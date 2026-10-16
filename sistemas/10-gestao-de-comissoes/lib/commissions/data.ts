/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor de consultas do PostgREST não tem tipos gerados neste projeto */
import 'server-only';
import type { Context } from '@/lib/auth/session';
import { fetchAll } from './facts';
import { goalProgress, type GoalFacts } from './engine';
import { loadGoalContext } from './run';
import type { Profile } from './labels';
import type { Opt } from '@/components/cm/bits';

// Leituras para as telas: sempre pelo cliente do usuário (RLS). O que o perfil não pode ver simplesmente não volta.

export type SellerRow = { id: string; name: string; seller_code: string; seller_type: string; status: string; team_id: string | null; user_id: string | null; starts_at: string; ends_at: string | null; notes: string | null };
export type TeamRow = { id: string; name: string; description: string | null; manager_user_id: string | null; active: boolean };

export async function loadSellers(ctx: Context, includeArchived = false): Promise<SellerRow[]> {
  return fetchAll<SellerRow>(() => {
    let q = ctx.supabase.from('sellers').select('id, name, seller_code, seller_type, status, team_id, user_id, starts_at, ends_at, notes').order('name') as any;
    if (!includeArchived) q = q.neq('status', 'archived');
    return q;
  });
}
export async function loadTeams(ctx: Context): Promise<TeamRow[]> {
  return fetchAll<TeamRow>(() => ctx.supabase.from('sales_teams').select('id, name, description, manager_user_id, active').order('name') as never);
}

export type Options = {
  sellers: Opt[]; teams: Opt[]; plans: Opt[]; categories: Opt[]; products: Opt[]; customers: Opt[];
};
/** Listas para os filtros/formulários (já limitadas pelo RLS do perfil). */
export async function loadOptions(ctx: Context): Promise<Options> {
  const [sellers, teams, plans, categories, products, customers] = await Promise.all([
    loadSellers(ctx),
    loadTeams(ctx),
    fetchAll<{ id: string; name: string }>(() => ctx.supabase.from('commission_plans').select('id, name').eq('status', 'active').order('name') as never),
    fetchAll<{ id: string; name: string }>(() => ctx.supabase.from('product_categories').select('id, name').eq('active', true).order('name') as never),
    ctx.supabase.from('products').select('id, name, sku').eq('active', true).order('name').limit(500),
    ctx.supabase.from('customers').select('id, name').is('archived_at', null).order('name').limit(500),
  ]);
  return {
    sellers: sellers.map((s) => ({ value: s.id, label: `${s.name} (${s.seller_code})` })),
    teams: teams.map((t) => ({ value: t.id, label: t.name })),
    plans: plans.map((p) => ({ value: p.id, label: p.name })),
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    products: ((products.data ?? []) as Array<{ id: string; name: string; sku: string }>).map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` })),
    customers: ((customers.data ?? []) as Array<{ id: string; name: string }>).map((c) => ({ value: c.id, label: c.name })),
  };
}

export async function loadNameMaps(ctx: Context): Promise<{ sellers: Map<string, string>; teams: Map<string, string> }> {
  const [sellers, teams] = await Promise.all([loadSellers(ctx, true), loadTeams(ctx)]);
  return { sellers: new Map(sellers.map((s) => [s.id, s.name])), teams: new Map(teams.map((t) => [t.id, t.name])) };
}

// ----------------------------------------------------------------------------------------- metas
export type GoalLine = { goal: GoalFacts; value: string; attainment: number; reached: boolean };

/** Progresso das metas VISÍVEIS ao perfil (progresso só é calculado quando o perfil enxerga todas as vendas do escopo). */
export async function goalLines(ctx: Context, profile: Profile, visibleSellerIds: Set<string>, managedTeamIds: string[], onlyActiveAt?: { from: string; to: string }): Promise<GoalLine[]> {
  const gc = await loadGoalContext(ctx);
  const ok = (g: GoalFacts): boolean => {
    if (profile === 'admin' || profile === 'finance') return true;
    if (profile === 'manager') return (g.scope === 'seller' && !!g.scopeReference && visibleSellerIds.has(g.scopeReference)) || (g.scope === 'team' && !!g.scopeReference && managedTeamIds.includes(g.scopeReference));
    if (profile === 'seller') return g.scope === 'seller' && !!g.scopeReference && visibleSellerIds.has(g.scopeReference);
    return false;
  };
  return gc.goals
    .filter(ok)
    .filter((g) => !onlyActiveAt || (g.periodStart <= onlyActiveAt.to && g.periodEnd >= onlyActiveAt.from))
    .map((g) => {
      const p = goalProgress(g, gc.sales);
      return { goal: g, value: p.value.toString(), attainment: p.attainment.toNumber(), reached: p.attainment.gte(1) };
    });
}

export function goalKpis(lines: GoalLine[]): { count: number; sellersReached: number; avgSimplePct: number | null; aggregatedPct: number | null } {
  const sellerGoals = lines.filter((l) => l.goal.scope === 'seller');
  const sellersReached = new Set(sellerGoals.filter((l) => l.reached).map((l) => l.goal.scopeReference)).size;
  const avgSimplePct = sellerGoals.length ? (sellerGoals.reduce((a, l) => a + l.attainment, 0) / sellerGoals.length) * 100 : null;
  const tgt = sellerGoals.reduce((a, l) => a + Number(l.goal.target), 0);
  const real = sellerGoals.reduce((a, l) => a + Number(l.value), 0);
  return { count: lines.length, sellersReached, avgSimplePct, aggregatedPct: tgt > 0 ? (real / tgt) * 100 : null };
}
