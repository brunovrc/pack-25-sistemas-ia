import 'server-only';
import type { Context } from '@/lib/auth/session';
import { chunk, fetchAll } from './facts';
import { brl, dateBR, rateBR } from './format';
import { ENTRY_TYPE_LABEL, APPROVAL_LABEL, CAUSE_LABEL } from './labels';
import { toCsv, type Col, type Row } from './csv';

// Dados do demonstrativo individual: tudo vem do fechamento (imutável) e dos lançamentos que o compõem, sempre pelo RLS do usuário.
export type StatementData = {
  closingId: string; org: string; orgName: string; sellerId: string; sellerName: string; periodStart: string; periodEnd: string; status: string;
  totals: { commissions: number; bonuses: number; adjustments: number; reversals: number; carryoverIn: number; payable: number; carryoverOut: number };
  paid: number; pending: number; footer: string | null; template: 'standard' | 'compact';
  lines: Array<{ date: string; sale: string; customer: string; type: string; cause: string; base: number | null; plan: string; rule: string; rate: string; amount: number; status: string }>;
};

export async function loadStatement(ctx: Context, org: string, closingId: string): Promise<StatementData | null> {
  const { data: c } = await ctx.supabase.from('commission_closings').select('id, period_id, seller_id, total_commissions_cents, total_bonuses_cents, total_adjustments_cents, total_reversals_cents, carryover_in_cents, carryover_out_cents, payable_amount_cents, status').eq('id', closingId).maybeSingle();
  if (!c) return null;
  const cl = c as { id: string; period_id: string; seller_id: string; total_commissions_cents: number; total_bonuses_cents: number; total_adjustments_cents: number; total_reversals_cents: number; carryover_in_cents: number; carryover_out_cents: number; payable_amount_cents: number; status: string };
  const [{ data: per }, { data: sel }, { data: st }, { data: bal }, { data: orgS }] = await Promise.all([
    ctx.supabase.from('commission_periods').select('period_start, period_end').eq('id', cl.period_id).maybeSingle(),
    ctx.supabase.from('sellers').select('name').eq('id', cl.seller_id).maybeSingle(),
    ctx.supabase.from('commission_settings').select('statement_footer, statement_template').eq('organization_id', org).maybeSingle(),
    ctx.supabase.from('commission_closing_balances').select('paid_cents').eq('closing_id', closingId).maybeSingle(),
    ctx.supabase.from('organization_settings').select('display_name').eq('organization_id', org).maybeSingle(),
  ]);
  const items = await fetchAll<{ commission_entry_id: string }>(() => ctx.supabase.from('commission_closing_items').select('commission_entry_id').eq('closing_id', closingId).is('voided_at', null).order('id') as never);
  const entries: Array<{ id: string; sale_id: string | null; sale_item_id: string | null; plan_version_id: string | null; calculation_detail_id: string | null; entry_type: string; amount_cents: number; approval_status: string; effective_at: string; cause: string }> = [];
  for (const part of chunk(items.map((i) => i.commission_entry_id))) entries.push(...(await fetchAll<(typeof entries)[number]>(() => ctx.supabase.from('commission_entries').select('id, sale_id, sale_item_id, plan_version_id, calculation_detail_id, entry_type, amount_cents, approval_status, effective_at, cause').in('id', part).order('effective_at').order('id') as never)));
  const saleIds = [...new Set(entries.map((e) => e.sale_id).filter((x): x is string => !!x))];
  const { data: sales } = saleIds.length ? await ctx.supabase.from('sales').select('id, sale_number, customer_id').in('id', saleIds.slice(0, 1000)) : { data: [] };
  const saleRows = (sales ?? []) as Array<{ id: string; sale_number: string; customer_id: string | null }>;
  const custIds = [...new Set(saleRows.map((s) => s.customer_id).filter((x): x is string => !!x))];
  const { data: cs } = custIds.length ? await ctx.supabase.from('customers').select('id, name').in('id', custIds.slice(0, 1000)) : { data: [] };
  const cust = new Map(((cs ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  const saleInfo = new Map(saleRows.map((s) => [s.id, { no: s.sale_number, customer: s.customer_id ? cust.get(s.customer_id) ?? '' : '' }]));
  const detIds = [...new Set(entries.map((e) => e.calculation_detail_id).filter((x): x is string => !!x))];
  const dets = new Map<string, { base: number; snapshot: { rule?: { name?: string }; plan?: { name?: string; version?: number } } }>();
  for (const part of chunk(detIds)) for (const d of ((await ctx.supabase.from('commission_calculation_details').select('id, base_amount_cents, calculation_snapshot_json').in('id', part)).data ?? []) as Array<{ id: string; base_amount_cents: number; calculation_snapshot_json: { rule?: { name?: string }; plan?: { name?: string; version?: number } } }>) dets.set(d.id, { base: d.base_amount_cents, snapshot: d.calculation_snapshot_json });
  const lines = entries.map((e) => {
    const d = e.calculation_detail_id ? dets.get(e.calculation_detail_id) : undefined;
    const rate = (d?.snapshot as { rate?: string } | undefined)?.rate;
    return {
      date: e.effective_at, sale: e.sale_id ? saleInfo.get(e.sale_id)?.no ?? '' : '', customer: e.sale_id ? saleInfo.get(e.sale_id)?.customer ?? '' : '', type: ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type, cause: CAUSE_LABEL[e.cause] ?? e.cause,
      base: d ? d.base : null, plan: d?.snapshot.plan ? `${d.snapshot.plan.name} v${d.snapshot.plan.version}` : e.cause === 'adjustment' ? 'Ajuste manual' : '', rule: d?.snapshot.rule?.name ?? '', rate: rate ? rateBR(rate) : '', amount: e.amount_cents, status: APPROVAL_LABEL[e.approval_status] ?? e.approval_status,
    };
  });
  const paid = (bal as { paid_cents?: number } | null)?.paid_cents ?? 0;
  const p = per as { period_start: string; period_end: string } | null;
  return {
    closingId, org, orgName: (orgS as { display_name?: string } | null)?.display_name ?? '', sellerId: cl.seller_id, sellerName: (sel as { name?: string } | null)?.name ?? '', periodStart: p?.period_start ?? '', periodEnd: p?.period_end ?? '', status: cl.status,
    totals: { commissions: cl.total_commissions_cents, bonuses: cl.total_bonuses_cents, adjustments: cl.total_adjustments_cents, reversals: cl.total_reversals_cents, carryoverIn: cl.carryover_in_cents, payable: cl.payable_amount_cents, carryoverOut: cl.carryover_out_cents },
    paid, pending: Math.max(0, cl.payable_amount_cents - paid), footer: (st as { statement_footer?: string | null } | null)?.statement_footer ?? null, template: ((st as { statement_template?: 'standard' | 'compact' } | null)?.statement_template) ?? 'standard', lines,
  };
}

export const STATEMENT_COLS: Col[] = [
  { key: 'date', label: 'Data', kind: 'date' }, { key: 'sale', label: 'Venda', kind: 'text' }, { key: 'customer', label: 'Cliente', kind: 'text' }, { key: 'type', label: 'Tipo', kind: 'text' },
  { key: 'base', label: 'Base', kind: 'money' }, { key: 'plan', label: 'Plano/versão', kind: 'text' }, { key: 'rule', label: 'Regra', kind: 'text' }, { key: 'rate', label: 'Taxa', kind: 'text' }, { key: 'amount', label: 'Valor', kind: 'money' }, { key: 'status', label: 'Status', kind: 'text' },
];
export const statementCsv = (s: StatementData): string => toCsv(STATEMENT_COLS, s.lines as unknown as Row[]);
export const statementSummary = (s: StatementData): Array<[string, string]> => [
  ['Vendedor', s.sellerName], ['Empresa', s.orgName], ['Período', `${dateBR(s.periodStart)} a ${dateBR(s.periodEnd)}`],
  ['Comissões', brl(s.totals.commissions)], ['Bônus', brl(s.totals.bonuses)], ['Ajustes', brl(s.totals.adjustments)], ['Estornos', brl(s.totals.reversals)],
  ...(s.totals.carryoverIn ? [['Saldo devedor de períodos anteriores', brl(-s.totals.carryoverIn)] as [string, string]] : []),
  ['Total aprovado a pagar', brl(s.totals.payable)], ['Registrado como pago', brl(s.paid)], ['Saldo pendente', brl(s.pending)],
  ...(s.totals.carryoverOut ? [['Saldo a compensar no próximo período', brl(-s.totals.carryoverOut)] as [string, string]] : []),
];
