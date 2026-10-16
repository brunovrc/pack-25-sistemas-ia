/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor de consultas do PostgREST não tem tipos gerados neste projeto */
import 'server-only';
import { createHash } from 'node:crypto';
import type { Context } from '@/lib/auth/session';
import { chunk, dec, fetchAll, loadFacts, type LoadedFacts } from './facts';
import { ENGINE_VERSION, computeCommissions, evaluateGoals, periodKey, type BookedEntry, type ComputeOutput, type GoalBonusRule, type GoalFacts, type GoalScope, type GoalType, type SaleFacts, type TierPeriod } from './engine';
import { addMonths, monthEnd, monthStart } from './query';

export type RunType = 'sale' | 'period' | 'reprocess';
export type RunSummary = { runs: number; entriesNew: number; entriesSkipped: number; detailsInserted: number; pendencies: number; criticalPendencies: number; sales: number };
const EMPTY: RunSummary = { runs: 0, entriesNew: 0, entriesSkipped: 0, detailsInserted: 0, pendencies: 0, criticalPendencies: 0, sales: 0 };

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function periodBounds(date: string, p: TierPeriod): { start: string; end: string } {
  if (p === 'month') return { start: monthStart(date), end: monthEnd(date) };
  if (p === 'quarter') {
    const q = Math.floor((Number(date.slice(5, 7)) - 1) / 3);
    const start = `${date.slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    return { start, end: monthEnd(addMonths(start, 2)) };
  }
  return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` };
}

/** Vendas com movimento no intervalo: venda no período, recebimento, devolução ou cancelamento. Rascunhos nunca entram. */
export async function salesWithActivity(ctx: Context, from: string, to: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const r of await fetchAll<{ id: string }>(() => ctx.supabase.from('sales').select('id').neq('status', 'draft').gte('sale_date', from).lte('sale_date', to).order('id') as never)) ids.add(r.id);
  for (const r of await fetchAll<{ sale_id: string }>(() => ctx.supabase.from('customer_receipts').select('sale_id').gte('received_at', from).lte('received_at', to).order('id') as never)) ids.add(r.sale_id);
  for (const r of await fetchAll<{ sale_id: string }>(() => ctx.supabase.from('sale_events').select('sale_id').in('event_type', ['partially_returned', 'totally_returned', 'cancelled']).gte('effective_at', from).lte('effective_at', to).order('id') as never)) ids.add(r.sale_id);
  return [...ids];
}

/** Faixas acumulam por período: traz as demais vendas do mesmo período para o cálculo ter o acumulado completo. */
async function expandForTiers(ctx: Context, base: LoadedFacts): Promise<LoadedFacts> {
  const ranges: Array<{ start: string; end: string }> = [];
  for (const s of base.sales) {
    for (const p of s.participants) {
      for (const r of p.plan?.rules ?? []) if (r.kind === 'tiered' && r.tier) ranges.push(periodBounds(s.date, r.tier.period));
    }
  }
  if (!ranges.length) return base;
  const start = ranges.reduce((a, r) => (r.start < a ? r.start : a), ranges[0]!.start);
  const end = ranges.reduce((a, r) => (r.end > a ? r.end : a), ranges[0]!.end);
  const have = new Set(base.sales.map((s) => s.id));
  const extra = (await fetchAll<{ id: string }>(() => ctx.supabase.from('sales').select('id').neq('status', 'draft').gte('sale_date', start).lte('sale_date', end).order('id') as never)).map((r) => r.id).filter((id) => !have.has(id));
  if (!extra.length) return base;
  const more = await loadFacts(ctx, extra);
  return { sales: [...base.sales, ...more.sales], booked: [...base.booked, ...more.booked], plans: new Map([...base.plans, ...more.plans]) };
}

export function inputHash(sales: SaleFacts[], booked: BookedEntry[]): string {
  return sha256(stableStringify({ engine: ENGINE_VERSION, sales, booked: booked.map((b) => `${b.idempotencyKey}=${b.amountCents}`).sort() }));
}

type Posted = { entries_new: number; entries_skipped: number; details_inserted: number; pendencies: number; critical_pendencies: number };

/** Grava o resultado do motor pelo RPC (idempotente). Componentes inteiros por lote; estornos depois dos originais. */
async function post(ctx: Context, org: string, runType: 'sale' | 'period' | 'goals' | 'reprocess', from: string, to: string, hash: string, scopeSales: string[], out: ComputeOutput): Promise<RunSummary> {
  const byComp = new Map<string, { d: ComputeOutput['details']; e: ComputeOutput['entries']; ref: boolean }>();
  for (const d of out.details) (byComp.get(d.componentKey) ?? byComp.set(d.componentKey, { d: [], e: [], ref: false }).get(d.componentKey)!).d.push(d);
  for (const e of out.entries) {
    const c = byComp.get(e.componentKey) ?? byComp.set(e.componentKey, { d: [], e: [], ref: false }).get(e.componentKey)!;
    c.e.push(e);
    if (e.originalIdempotencyKey) c.ref = true;
  }
  const comps = [...byComp.entries()].sort((a, b) => Number(a[1].ref) - Number(b[1].ref) || (a[0] < b[0] ? -1 : 1)).map(([, c]) => c);
  const batches: Array<{ d: ComputeOutput['details']; e: ComputeOutput['entries'] }> = [];
  let cur = { d: [] as ComputeOutput['details'], e: [] as ComputeOutput['entries'] };
  for (const c of comps) {
    if (cur.d.length + c.d.length > 1500 || cur.e.length + c.e.length > 1500) {
      batches.push(cur);
      cur = { d: [], e: [] };
    }
    cur.d.push(...c.d);
    cur.e.push(...c.e);
  }
  batches.push(cur);
  const sum: RunSummary = { ...EMPTY, sales: scopeSales.length };
  for (const [i, b] of batches.entries()) {
    const last = i === batches.length - 1;
    const { data, error } = await ctx.supabase.rpc('cm_post_calculation', {
      p_org: org, p_run_type: runType, p_start: from, p_end: to, p_engine: ENGINE_VERSION, p_hash: hash, p_scope_sales: last ? scopeSales : [],
      p_details: b.d, p_entries: b.e, p_pendencies: last ? out.pendencies : [],
    });
    if (error) throw new Error(`gravação falhou: ${error.message}`);
    const r = data as Posted;
    sum.runs += 1;
    sum.entriesNew += r.entries_new;
    sum.entriesSkipped += r.entries_skipped;
    sum.detailsInserted += r.details_inserted;
    sum.pendencies = r.pendencies;
    sum.criticalPendencies = r.critical_pendencies;
  }
  return sum;
}

/** Calcula e grava. `saleIds` (evento de uma venda) ou intervalo (lote por período). Idempotente: repetir não duplica. */
export async function runCalculation(ctx: Context, org: string, p: { runType: RunType; saleIds?: string[]; from: string; to: string }): Promise<RunSummary> {
  try {
    const ids = p.saleIds?.length ? p.saleIds : await salesWithActivity(ctx, p.from, p.to);
    if (!ids.length) return { ...EMPTY };
    const facts = await expandForTiers(ctx, await loadFacts(ctx, ids));
    if (!facts.sales.length) return { ...EMPTY };
    const out = computeCommissions({ sales: facts.sales, booked: facts.booked });
    return await post(ctx, org, p.runType, p.from, p.to, inputHash(facts.sales, facts.booked), facts.sales.map((s) => s.id), out);
  } catch (e) {
    await ctx.supabase.rpc('cm_report_calculation_failure', { p_org: org, p_message: e instanceof Error ? e.message.slice(0, 300) : 'falha' });
    throw e;
  }
}

// ----------------------------------------------------------------------------------------- metas e bônus
type GoalRow = { id: string; name: string; goal_type: GoalType; target_value_decimal: number | string; period_start: string; period_end: string; scope_type: GoalScope; scope_reference_id: string | null; product_id: string | null };
type BonusRow = { id: string; goal_id: string; plan_version_id: string; threshold_decimal: number | string; bonus_type: 'fixed' | 'rate'; bonus_rate_decimal: number | string | null; bonus_amount_cents: number | null; award_timing: 'on_attainment' | 'period_end'; distribution: 'each' | 'proportional' };

export type GoalContext = { goals: GoalFacts[]; sales: SaleFacts[]; booked: BookedEntry[] };

/** Metas ativas com seus bônus, vendedores-alvo, as vendas dos períodos e o que já foi lançado como bônus. */
export async function loadGoalContext(ctx: Context, onlyIds?: string[]): Promise<GoalContext> {
  const goalRows = await fetchAll<GoalRow>(() => {
    let q = ctx.supabase.from('sales_goals').select('id, name, goal_type, target_value_decimal, period_start, period_end, scope_type, scope_reference_id, product_id').eq('status', 'active').order('id') as any;
    if (onlyIds?.length) q = q.in('id', onlyIds);
    return q;
  });
  if (!goalRows.length) return { goals: [], sales: [], booked: [] };
  const bonusRows: BonusRow[] = [];
  for (const part of chunk(goalRows.map((g) => g.id))) bonusRows.push(...(await fetchAll<BonusRow>(() => ctx.supabase.from('goal_bonus_rules').select('id, goal_id, plan_version_id, threshold_decimal, bonus_type, bonus_rate_decimal, bonus_amount_cents, award_timing, distribution').in('goal_id', part).order('id') as never)));
  const sellers = await fetchAll<{ id: string; team_id: string | null; status: string }>(() => ctx.supabase.from('sellers').select('id, team_id, status').neq('status', 'archived').order('id') as never);
  const minStart = goalRows.reduce((a, g) => (g.period_start < a ? g.period_start : a), goalRows[0]!.period_start);
  const maxEnd = goalRows.reduce((a, g) => (g.period_end > a ? g.period_end : a), goalRows[0]!.period_end);
  const saleIds = (await fetchAll<{ id: string }>(() => ctx.supabase.from('sales').select('id').neq('status', 'draft').gte('sale_date', minStart).lte('sale_date', maxEnd).order('id') as never)).map((r) => r.id);
  const facts = await loadFacts(ctx, saleIds);
  const booked: BookedEntry[] = [];
  for (const g of goalRows) {
    const rows = await fetchAll<{ id: string; idempotency_key: string; component_key: string; seller_id: string; plan_version_id: string | null; entry_type: BookedEntry['entryType']; amount_cents: number }>(
      () => ctx.supabase.from('commission_entries').select('id, idempotency_key, component_key, seller_id, plan_version_id, entry_type, amount_cents').like('component_key', `g:${g.id}:%`).order('id') as never);
    for (const e of rows) booked.push({ id: e.id, idempotencyKey: e.idempotency_key, componentKey: e.component_key, saleId: null, itemId: null, planVersionId: e.plan_version_id ?? '', ruleId: null, sellerId: e.seller_id, entryType: e.entry_type, amountCents: e.amount_cents });
  }
  const goals: GoalFacts[] = goalRows.map((g) => ({
    id: g.id, name: g.name, type: g.goal_type, target: dec(g.target_value_decimal), periodStart: g.period_start, periodEnd: g.period_end, scope: g.scope_type, scopeReference: g.scope_reference_id, productId: g.product_id,
    sellerIds: (g.scope_type === 'seller' ? sellers.filter((s) => s.id === g.scope_reference_id) : g.scope_type === 'team' ? sellers.filter((s) => s.team_id === g.scope_reference_id && s.status === 'active') : sellers.filter((s) => s.status === 'active')).map((s) => s.id).sort(),
    bonusRules: bonusRows.filter((b) => b.goal_id === g.id).map((b): GoalBonusRule => ({
      id: b.id, planVersionId: b.plan_version_id, thresholdPct: dec(b.threshold_decimal), bonusType: b.bonus_type, bonusRate: b.bonus_rate_decimal === null ? null : dec(b.bonus_rate_decimal),
      bonusAmountCents: b.bonus_amount_cents, timing: b.award_timing, distribution: b.distribution,
    })),
  }));
  return { goals, sales: facts.sales, booked };
}

/** Avalia metas e lança os bônus devidos (idempotente: o mesmo bônus nunca é lançado duas vezes). */
export async function runGoals(ctx: Context, org: string, asOf: string): Promise<RunSummary> {
  const gc = await loadGoalContext(ctx);
  if (!gc.goals.length) return { ...EMPTY };
  const out = evaluateGoals(gc.goals, gc.sales, gc.booked, asOf);
  if (!out.entries.length && !out.details.length) return { ...EMPTY };
  const from = gc.goals.reduce((a, g) => (g.periodStart < a ? g.periodStart : a), gc.goals[0]!.periodStart);
  const to = gc.goals.reduce((a, g) => (g.periodEnd > a ? g.periodEnd : a), gc.goals[0]!.periodEnd);
  return post(ctx, org, 'goals', from, to, sha256(stableStringify({ goals: gc.goals, asOf, booked: gc.booked.map((b) => b.idempotencyKey).sort() })), [], out);
}

export { periodKey };
