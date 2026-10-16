import 'server-only';
import type { Context } from '@/lib/auth/session';
import type { Col, Row } from './csv';
import { loadSellers } from './data';
import type { Profile } from './labels';
import { REPORTS, VIEWER_REPORT, runReport, type ReportDef, type ReportFilter, type ReportResult } from './reports';
import { addMonths, monthEnd, monthStart, resolvePeriod, uuidOrNull, one, type SearchParams } from './query';

export type Prepared = { def: ReportDef; filter: ReportFilter; result: ReportResult; period: { preset: string; from: string; to: string } };

/** Resolve o relatório pedido na URL com os filtros e o escopo do perfil (RLS decide o que existe para o usuário). */
export async function prepareReport(ctx: Context, org: string, profile: Profile, managedTeamIds: string[], today: string, sp: SearchParams): Promise<Prepared | null> {
  const period = resolvePeriod(sp, today);
  const filter: ReportFilter = { from: period.from, to: period.to, seller: uuidOrNull(one(sp.seller)), team: uuidOrNull(one(sp.team)) };
  if (profile === 'viewer') {
    const cols: Col[] = [{ key: 'mes', label: 'Mês', kind: 'date' }, { key: 'vendas', label: 'Vendas elegíveis', kind: 'money' }, { key: 'calc', label: 'Comissões calculadas', kind: 'money' }, { key: 'apr', label: 'Aprovadas', kind: 'money' }, { key: 'pago', label: 'Pagas (registradas)', kind: 'money' }, { key: 'est', label: 'Estornadas', kind: 'money' }, { key: 'custo', label: 'Custo sobre vendas (%)', kind: 'pct' }];
    const rows: Row[] = [];
    for (let mo = monthStart(period.from); mo <= period.to && rows.length < 36; mo = addMonths(mo, 1)) {
      const { data } = await ctx.supabase.rpc('cm_org_aggregates', { p_org: org, p_from: mo < period.from ? period.from : mo, p_to: monthEnd(mo) > period.to ? period.to : monthEnd(mo) });
      const a = data as { sales_base_cents: number; calculated_cents: number; approved_cents: number; paid_cents: number; reversals_cents: number; cost_pct: number | null } | null;
      if (a) rows.push({ mes: mo, vendas: a.sales_base_cents, calc: a.calculated_cents, apr: a.approved_cents, pago: a.paid_cents, est: a.reversals_cents, custo: a.cost_pct });
    }
    return { def: VIEWER_REPORT, filter, result: { cols, rows, truncated: false }, period };
  }
  const key = one(sp.r) ?? REPORTS[0]!.key;
  const def = REPORTS.find((r) => r.key === key);
  if (!def) return null;
  const visible = new Set((await loadSellers(ctx, true)).map((s) => s.id));
  const result = await runReport(ctx, def.key, filter, visible, profile, managedTeamIds);
  return result ? { def, filter, result, period } : null;
}
