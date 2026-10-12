import 'server-only';
import type { Context } from '@/lib/auth/session';
import { addDays, type CrmFilters } from './filters';
import { toCents } from './money';

// ------------------------------------------------------------------ tipos das linhas
export type Stage = { id: string; name: string; position: number; probability: number; kind: 'open' | 'won' | 'lost'; color: string | null; is_active: boolean };
export type Named = { id: string; name: string; is_active: boolean };
export type Team = { id: string; name: string };
export type Person = { user_id: string; label: string };
export type Options = { stages: Stage[]; sources: Named[]; reasons: Named[]; teams: Team[]; people: Person[] };

export type Lead = {
  id: string; name: string; company_name: string | null; email: string | null; phone: string | null; job_title: string | null;
  source_id: string | null; status: string; temperature: string; owner_id: string | null; notes: string | null;
  archived_at: string | null; converted_at: string | null; converted_opportunity_id: string | null; created_at: string;
};
export type Company = { id: string; name: string; document: string | null; website: string | null; segment: string | null; phone: string | null; notes: string | null; owner_id: string | null; archived_at: string | null; created_at: string };
export type Contact = { id: string; company_id: string | null; name: string; email: string | null; phone: string | null; job_title: string | null; notes: string | null; owner_id: string | null; archived_at: string | null; created_at: string };
export type Opportunity = {
  id: string; title: string; company_id: string | null; contact_id: string | null; lead_id: string | null; source_id: string | null; value: number; stage_id: string;
  status: 'open' | 'won' | 'lost'; probability: number | null; expected_close_date: string | null; owner_id: string | null; closed_at: string | null;
  loss_reason_id: string | null; loss_notes: string | null; notes: string | null; created_at: string; updated_at: string;
};
export type Activity = {
  id: string; kind: string; title: string; description: string | null; due_at: string | null; completed_at: string | null; priority: string;
  owner_id: string | null; lead_id: string | null; contact_id: string | null; company_id: string | null; opportunity_id: string | null; created_at: string;
};
export type Goal = { id: string; scope: 'user' | 'team'; user_id: string | null; team_id: string | null; period_start: string; period_end: string; target_amount: number };
export type HistoryRow = { id: number; from_stage_id: string | null; to_stage_id: string; changed_by: string | null; changed_at: string };

export const PAGE_SIZE = 20;

export function parsePage(value: string | string[] | undefined): number {
  const v = Array.isArray(value) ? value[0] : value;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/**
 * Termo de busca seguro para filtros PostgREST: só letras, números, espaço e . _ - @.
 * Remove vírgula, parênteses, asteriscos e aspas (que permitiriam injetar filtros).
 */
export function searchToken(q: string | string[] | undefined): string {
  const v = (Array.isArray(q) ? q[0] : q) ?? '';
  return v.normalize('NFC').replace(/[^\p{L}\p{N} ._@-]/gu, '').trim().slice(0, 60);
}

const numeric = <T extends { value?: unknown }>(row: T): T => ({ ...row, value: Number(row.value) });

// ------------------------------------------------------------------ opções e rótulos
export async function loadOptions(ctx: Context): Promise<Options> {
  const org = ctx.membership.organization_id;
  const db = ctx.supabase;
  const [stages, sources, reasons, teams, people] = await Promise.all([
    db.from('crm_pipeline_stages').select('id, name, position, probability, kind, color, is_active').eq('organization_id', org).order('position').order('name'),
    db.from('crm_lead_sources').select('id, name, is_active').eq('organization_id', org).order('name'),
    db.from('crm_loss_reasons').select('id, name, is_active').eq('organization_id', org).order('name'),
    db.from('crm_teams').select('id, name').eq('organization_id', org).order('name'),
    db.rpc('crm_user_labels', { p_org: org }),
  ]);
  return {
    stages: (stages.data ?? []) as Stage[],
    sources: (sources.data ?? []) as Named[],
    reasons: (reasons.data ?? []) as Named[],
    teams: (teams.data ?? []) as Team[],
    people: ((people.data ?? []) as Person[]).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
  };
}

export const labelMap = (people: Person[]) => new Map(people.map((p) => [p.user_id, p.label]));
export const nameMap = (rows: Array<{ id: string; name: string }>) => new Map(rows.map((r) => [r.id, r.name]));

// ------------------------------------------------------------------ listagens
type ListResult<T> = { rows: T[]; total: number };

export async function listLeads(ctx: Context, p: { q: string; status: string; owner: string | null; source: string | null; archived: boolean; page: number }): Promise<ListResult<Lead>> {
  let query = ctx.supabase.from('crm_leads').select('*', { count: 'exact' }).eq('organization_id', ctx.membership.organization_id);
  query = p.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (p.status) query = query.eq('status', p.status);
  if (p.owner) query = query.eq('owner_id', p.owner);
  if (p.source) query = query.eq('source_id', p.source);
  if (p.q) query = query.or(`name.ilike.*${p.q}*,email.ilike.*${p.q}*,company_name.ilike.*${p.q}*`);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as Lead[], total: count ?? 0 };
}

export async function listCompanies(ctx: Context, p: { q: string; archived: boolean; page: number }): Promise<ListResult<Company>> {
  let query = ctx.supabase.from('crm_companies').select('*', { count: 'exact' }).eq('organization_id', ctx.membership.organization_id);
  query = p.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (p.q) query = query.or(`name.ilike.*${p.q}*,segment.ilike.*${p.q}*`);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query.order('name').range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as Company[], total: count ?? 0 };
}

export async function listContacts(ctx: Context, p: { q: string; company: string | null; archived: boolean; page: number }): Promise<ListResult<Contact>> {
  let query = ctx.supabase.from('crm_contacts').select('*', { count: 'exact' }).eq('organization_id', ctx.membership.organization_id);
  query = p.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (p.company) query = query.eq('company_id', p.company);
  if (p.q) query = query.or(`name.ilike.*${p.q}*,email.ilike.*${p.q}*`);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query.order('name').range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as Contact[], total: count ?? 0 };
}

export async function listOpportunities(ctx: Context, p: { q: string; status: string; owner: string | null; stage: string | null; page: number }): Promise<ListResult<Opportunity>> {
  let query = ctx.supabase.from('crm_opportunities').select('*', { count: 'exact' }).eq('organization_id', ctx.membership.organization_id);
  if (p.status) query = query.eq('status', p.status);
  if (p.owner) query = query.eq('owner_id', p.owner);
  if (p.stage) query = query.eq('stage_id', p.stage);
  if (p.q) query = query.ilike('title', `%${p.q}%`);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: ((data ?? []) as Opportunity[]).map(numeric), total: count ?? 0 };
}

export async function listActivities(ctx: Context, p: { state: string; owner: string | null; kind: string; page: number }): Promise<ListResult<Activity>> {
  let query = ctx.supabase.from('crm_activities').select('*', { count: 'exact' }).eq('organization_id', ctx.membership.organization_id);
  if (p.state === 'done') query = query.not('completed_at', 'is', null);
  else if (p.state === 'overdue') query = query.is('completed_at', null).lt('due_at', new Date().toISOString());
  else query = query.is('completed_at', null);
  if (p.owner) query = query.eq('owner_id', p.owner);
  if (p.kind) query = query.eq('kind', p.kind);
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query
    .order('due_at', { ascending: p.state !== 'done', nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as Activity[], total: count ?? 0 };
}

export async function getById<T>(ctx: Context, table: string, id: string): Promise<T | null> {
  const { data } = await ctx.supabase.from(table).select('*').eq('id', id).eq('organization_id', ctx.membership.organization_id).maybeSingle();
  return (data as T | null) ?? null;
}

export async function activitiesFor(ctx: Context, column: 'lead_id' | 'contact_id' | 'company_id' | 'opportunity_id', id: string): Promise<Activity[]> {
  const { data } = await ctx.supabase.from('crm_activities').select('*').eq('organization_id', ctx.membership.organization_id).eq(column, id).order('created_at', { ascending: false }).limit(50);
  return (data ?? []) as Activity[];
}

export async function stageHistory(ctx: Context, opportunityId: string): Promise<HistoryRow[]> {
  const { data } = await ctx.supabase.from('crm_stage_history').select('id, from_stage_id, to_stage_id, changed_by, changed_at').eq('opportunity_id', opportunityId).order('changed_at', { ascending: true }).order('id', { ascending: true });
  return (data ?? []) as HistoryRow[];
}

export async function companyOptions(ctx: Context): Promise<Array<{ id: string; name: string }>> {
  const { data } = await ctx.supabase.from('crm_companies').select('id, name').eq('organization_id', ctx.membership.organization_id).is('archived_at', null).order('name').limit(500);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function contactOptions(ctx: Context): Promise<Array<{ id: string; name: string; company_id: string | null }>> {
  const { data } = await ctx.supabase.from('crm_contacts').select('id, name, company_id').eq('organization_id', ctx.membership.organization_id).is('archived_at', null).order('name').limit(500);
  return (data ?? []) as Array<{ id: string; name: string; company_id: string | null }>;
}

export async function pipelineOpportunities(ctx: Context, p: { owner: string | null }): Promise<Opportunity[]> {
  let query = ctx.supabase.from('crm_opportunities').select('*').eq('organization_id', ctx.membership.organization_id);
  if (p.owner) query = query.eq('owner_id', p.owner);
  const { data } = await query.order('updated_at', { ascending: false }).limit(1000);
  return ((data ?? []) as Opportunity[]).map(numeric);
}

export async function listGoals(ctx: Context): Promise<Goal[]> {
  const { data } = await ctx.supabase.from('crm_goals').select('id, scope, user_id, team_id, period_start, period_end, target_amount').eq('organization_id', ctx.membership.organization_id).order('period_start', { ascending: false });
  return ((data ?? []) as Array<Goal & { target_amount: string | number }>).map((g) => ({ ...g, target_amount: Number(g.target_amount) }));
}

export async function crmSettings(ctx: Context): Promise<{ stale_days: number; closing_soon_days: number }> {
  const { data } = await ctx.supabase.from('crm_settings').select('stale_days, closing_soon_days').eq('organization_id', ctx.membership.organization_id).maybeSingle();
  return (data as { stale_days: number; closing_soon_days: number } | null) ?? { stale_days: 14, closing_soon_days: 7 };
}

// ------------------------------------------------------------------ indicadores (funções SQL; ver docs/METRICS.md)
export type Kpis = { pipeline_value: number; pipeline_count: number; won_value: number; won_count: number; lost_count: number; conversion_rate: number | null; active_leads: number; avg_ticket: number | null };
export type SalesPoint = { bucket: string; won_value: number; won_count: number; lost_count: number };
export type FunnelRow = { stage_id: string; stage_name: string; stage_position: number; opp_count: number; opp_value: number };
export type SourceRow = { source_id: string | null; source_name: string; lead_count: number };
export type RepRow = { user_id: string; won_count: number; won_value: number; lost_count: number; conversion_rate: number | null; goals_met: number };
export type GoalProgress = { goal_id: string; scope: 'user' | 'team'; user_id: string | null; team_id: string | null; team_name: string | null; period_start: string; period_end: string; target_amount: number; realized: number; pct: number | null; elapsed_pct: number };
export type AlertRow = { kind: 'overdue_activity' | 'stale_opportunity' | 'closing_soon' | 'goal_pace'; ref_id: string; title: string; due: string | null; days: number | null; owner_id: string | null; detail: number | null };

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function loadDashboard(ctx: Context, f: CrmFilters) {
  const org = ctx.membership.organization_id;
  const base = { p_org: org, p_from: f.from, p_to: f.to, p_owner: f.owner, p_team: f.team, p_source: f.source };
  const db = ctx.supabase;
  const [kpis, series, funnel, sources, reps, goals, alerts] = await Promise.all([
    db.rpc('crm_kpis', base),
    db.rpc('crm_sales_series', base),
    db.rpc('crm_funnel', { p_org: org, p_owner: f.owner, p_team: f.team, p_source: f.source }),
    db.rpc('crm_lead_sources_chart', base),
    db.rpc('crm_rep_performance', base),
    db.rpc('crm_goals_progress', { p_org: org, p_from: f.from, p_to: f.to, p_owner: f.owner, p_team: f.team }),
    db.rpc('crm_alerts', { p_org: org, p_owner: f.owner, p_team: f.team }),
  ]);
  const k = ((kpis.data ?? []) as Array<Record<string, unknown>>)[0];
  return {
    error: [kpis, series, funnel, sources, reps, goals, alerts].some((r) => r.error),
    kpis: k
      ? ({
          pipeline_value: num(k.pipeline_value), pipeline_count: num(k.pipeline_count), won_value: num(k.won_value), won_count: num(k.won_count),
          lost_count: num(k.lost_count), conversion_rate: numOrNull(k.conversion_rate), active_leads: num(k.active_leads), avg_ticket: numOrNull(k.avg_ticket),
        } satisfies Kpis)
      : null,
    series: ((series.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ bucket: String(r.bucket), won_value: num(r.won_value), won_count: num(r.won_count), lost_count: num(r.lost_count) })) satisfies SalesPoint[],
    funnel: ((funnel.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ stage_id: String(r.stage_id), stage_name: String(r.stage_name), stage_position: num(r.stage_position), opp_count: num(r.opp_count), opp_value: num(r.opp_value) })) satisfies FunnelRow[],
    sources: ((sources.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ source_id: (r.source_id as string | null) ?? null, source_name: String(r.source_name), lead_count: num(r.lead_count) })) satisfies SourceRow[],
    reps: ((reps.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ user_id: String(r.user_id), won_count: num(r.won_count), won_value: num(r.won_value), lost_count: num(r.lost_count), conversion_rate: numOrNull(r.conversion_rate), goals_met: num(r.goals_met) })) satisfies RepRow[],
    goals: ((goals.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      goal_id: String(r.goal_id), scope: r.scope as 'user' | 'team', user_id: (r.user_id as string | null) ?? null, team_id: (r.team_id as string | null) ?? null,
      team_name: (r.team_name as string | null) ?? null, period_start: String(r.period_start), period_end: String(r.period_end),
      target_amount: num(r.target_amount), realized: num(r.realized), pct: numOrNull(r.pct), elapsed_pct: num(r.elapsed_pct),
    })) satisfies GoalProgress[],
    alerts: ((alerts.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      kind: r.kind as AlertRow['kind'], ref_id: String(r.ref_id), title: String(r.title), due: (r.due as string | null) ?? null,
      days: numOrNull(r.days), owner_id: (r.owner_id as string | null) ?? null, detail: numOrNull(r.detail),
    })) satisfies AlertRow[],
  };
}

export type LostReasonRow = { reason: string; count: number; value: number };

/** Perdas do período por motivo. Fronteiras do período em horário de Brasília (inclusivo nos dois lados). */
export async function lostReasonsReport(ctx: Context, f: CrmFilters, reasons: Array<{ id: string; name: string }>): Promise<LostReasonRow[]> {
  const org = ctx.membership.organization_id;
  let query = ctx.supabase
    .from('crm_opportunities')
    .select('loss_reason_id, value')
    .eq('organization_id', org)
    .eq('status', 'lost')
    .gte('closed_at', `${f.from}T00:00:00-03:00`)
    .lt('closed_at', `${addDays(f.to, 1)}T00:00:00-03:00`)
    .limit(10000);
  if (f.owner) query = query.eq('owner_id', f.owner);
  if (f.source) query = query.eq('source_id', f.source);
  if (f.team) {
    const { data } = await ctx.supabase.from('crm_team_members').select('user_id').eq('organization_id', org).eq('team_id', f.team);
    const ids = ((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    query = query.in('owner_id', ids.length ? ids : ['00000000-0000-4000-8000-000000000000']);
  }
  const { data } = await query;
  const names = new Map(reasons.map((r) => [r.id, r.name]));
  const acc = new Map<string, LostReasonRow>();
  for (const row of (data ?? []) as Array<{ loss_reason_id: string | null; value: number | string }>) {
    const key = row.loss_reason_id ? names.get(row.loss_reason_id) ?? 'Motivo removido' : 'Sem motivo';
    const cur = acc.get(key) ?? { reason: key, count: 0, value: 0 };
    cur.count += 1;
    cur.value = (toCents(cur.value) + toCents(Number(row.value))) / 100;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'pt-BR'));
}
