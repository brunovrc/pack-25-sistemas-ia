/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor de consultas do PostgREST não tem tipos gerados neste projeto */
import 'server-only';
import type { Context } from '@/lib/auth/session';
import type { Col, Row } from './csv';
import { goalLines, loadSellers, loadTeams } from './data';
import { chunk, fetchAll } from './facts';
import { ADJUSTMENT_TYPE_LABEL, APPROVAL_LABEL, ENTRY_TYPE_LABEL, GOAL_TYPE_LABEL, PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL, type Profile, CLOSING_STATUS_LABEL, DISPUTE_STATUS_LABEL } from './labels';

// Relatórios: sempre consultas reais pelo cliente do usuário (RLS). Exportar nunca amplia o que o perfil já enxerga.
export type ReportDef = { key: string; title: string; description: string };
export const REPORTS: ReportDef[] = [
  { key: 'vendas_periodo', title: 'Vendas por período', description: 'Cada venda do período com valores e situação.' },
  { key: 'vendas_vendedor', title: 'Vendas por vendedor', description: 'Crédito atribuído (valor × participação), líquido de devoluções.' },
  { key: 'vendas_equipe', title: 'Vendas por equipe', description: 'Crédito atribuído por equipe vigente na data da venda.' },
  { key: 'comissoes_periodo', title: 'Comissões por período', description: 'Mês a mês: comissões, bônus, ajustes e estornos.' },
  { key: 'comissoes_vendedor', title: 'Comissões por vendedor', description: 'Totais por tipo de lançamento e líquido.' },
  { key: 'comissoes_equipe', title: 'Comissões por equipe', description: 'Líquido por equipe vigente na data do lançamento.' },
  { key: 'comissoes_plano', title: 'Comissões por plano', description: 'Líquido por plano (ajustes manuais separados).' },
  { key: 'comissoes_categoria', title: 'Comissões por categoria', description: 'Líquido por categoria de produto.' },
  { key: 'metas', title: 'Metas', description: 'Metas ativas no período com o realizado.' },
  { key: 'atingimento', title: 'Atingimento por vendedor', description: 'Atingimento das metas por vendedor.' },
  { key: 'bonus', title: 'Bônus', description: 'Lançamentos de bônus.' },
  { key: 'ajustes', title: 'Ajustes', description: 'Ajustes manuais com justificativa e situação.' },
  { key: 'estornos', title: 'Estornos', description: 'Estornos lançados (devoluções, cancelamentos, recálculos).' },
  { key: 'pendentes', title: 'Comissões pendentes', description: 'Calculadas, em revisão ou contestadas.' },
  { key: 'aprovadas', title: 'Comissões aprovadas', description: 'Aprovadas ou ajustadas.' },
  { key: 'pagas', title: 'Comissões pagas', description: 'Pagamentos registrados (feitos fora do sistema).' },
  { key: 'saldos', title: 'Saldos a pagar', description: 'Saldo aprovado ainda não registrado como pago, por fechamento.' },
  { key: 'fechamentos', title: 'Fechamentos', description: 'Fechamentos individuais por período.' },
  { key: 'demonstrativos', title: 'Demonstrativos', description: 'Demonstrativos gerados.' },
  { key: 'divergencias', title: 'Divergências e contestações', description: 'Contestações e pendências abertas.' },
];
export const VIEWER_REPORT: ReportDef = { key: 'resumo_empresa', title: 'Resumo agregado da empresa', description: 'Totais da empresa por mês, sem remuneração individual.' };

export type ReportFilter = { from: string; to: string; seller: string | null; team: string | null };
export type ReportResult = { cols: Col[]; rows: Row[]; totals?: Row; truncated: boolean };
const LIMIT = 20000;
const t = (key: string, label: string): Col => ({ key, label, kind: 'text' });
const m = (key: string, label: string): Col => ({ key, label, kind: 'money' });
const d = (key: string, label: string): Col => ({ key, label, kind: 'date' });
const p = (key: string, label: string): Col => ({ key, label, kind: 'pct' });
const n = (key: string, label: string): Col => ({ key, label, kind: 'int' });
const sumBy = <T,>(xs: T[], f: (x: T) => number): number => xs.reduce((a, x) => a + f(x), 0);

type EntryRaw = { id: string; seller_id: string; sale_id: string | null; sale_item_id: string | null; plan_version_id: string | null; entry_type: string; amount_cents: number; approval_status: string; effective_at: string; cause: string };

async function ctxData(ctx: Context) {
  const [sellers, teams] = await Promise.all([loadSellers(ctx, true), loadTeams(ctx)]);
  const { data: h } = await ctx.supabase.from('seller_team_history').select('seller_id, team_id, valid_from, valid_until');
  const hist = (h ?? []) as Array<{ seller_id: string; team_id: string | null; valid_from: string; valid_until: string | null }>;
  const sName = new Map(sellers.map((s) => [s.id, s.name]));
  const tName = new Map(teams.map((x) => [x.id, x.name]));
  const teamAt = (sid: string, date: string): string => {
    const rows = hist.filter((x) => x.seller_id === sid);
    const tid = rows.length ? rows.find((x) => x.valid_from <= date && (!x.valid_until || x.valid_until >= date))?.team_id ?? null : sellers.find((s) => s.id === sid)?.team_id ?? null;
    return tid ? tName.get(tid) ?? 'Sem equipe' : 'Sem equipe';
  };
  const teamIdAt = (sid: string, date: string): string | null => {
    const rows = hist.filter((x) => x.seller_id === sid);
    return rows.length ? rows.find((x) => x.valid_from <= date && (!x.valid_until || x.valid_until >= date))?.team_id ?? null : sellers.find((s) => s.id === sid)?.team_id ?? null;
  };
  return { sName, tName, teamAt, teamIdAt, sellers };
}

async function entries(ctx: Context, f: ReportFilter, statuses?: string[], types?: string[]): Promise<EntryRaw[]> {
  return fetchAll<EntryRaw>(() => {
    let q = ctx.supabase.from('commission_entries').select('id, seller_id, sale_id, sale_item_id, plan_version_id, entry_type, amount_cents, approval_status, effective_at, cause').gte('effective_at', f.from).lte('effective_at', f.to).order('effective_at').order('id') as any;
    if (f.seller) q = q.eq('seller_id', f.seller);
    if (statuses) q = q.in('approval_status', statuses);
    if (types) q = q.in('entry_type', types);
    return q;
  }).then((r) => r.slice(0, LIMIT));
}

const net = (rows: EntryRaw[], tp?: string[]) => sumBy(rows.filter((r) => r.approval_status !== 'rejected' && (!tp || tp.includes(r.entry_type))), (r) => r.amount_cents);

/** Crédito atribuído por participante: (comissionável − devolvido) × % de participação. */
async function credits(ctx: Context, f: ReportFilter) {
  const sales = await fetchAll<{ id: string; sale_date: string }>(() => ctx.supabase.from('sales').select('id, sale_date').in('status', ['confirmed', 'partially_returned']).gte('sale_date', f.from).lte('sale_date', f.to).order('id') as never);
  const out: Array<{ sale_id: string; seller_id: string; date: string; credit: number }> = [];
  for (const part of chunk(sales.map((s) => s.id))) {
    const [items, parts, ev] = await Promise.all([
      fetchAll<{ sale_id: string; id: string; commissionable_amount_cents: number }>(() => ctx.supabase.from('sale_items').select('sale_id, id, commissionable_amount_cents').in('sale_id', part).order('id') as never),
      fetchAll<{ sale_id: string; seller_id: string; allocation_percentage: number }>(() => ctx.supabase.from('sale_participants').select('sale_id, seller_id, allocation_percentage').in('sale_id', part).order('seller_id') as never),
      fetchAll<{ sale_id: string; metadata_json: { itemAmounts?: Record<string, number> } | null }>(() => ctx.supabase.from('sale_events').select('sale_id, metadata_json').in('sale_id', part).in('event_type', ['partially_returned', 'totally_returned']).lte('effective_at', f.to).order('id') as never),
    ]);
    const ret = new Map<string, number>();
    for (const e of ev) for (const v of Object.values(e.metadata_json?.itemAmounts ?? {})) ret.set(e.sale_id, (ret.get(e.sale_id) ?? 0) + Number(v));
    const base = new Map<string, number>();
    for (const i of items) base.set(i.sale_id, (base.get(i.sale_id) ?? 0) + i.commissionable_amount_cents);
    for (const x of parts) {
      if (f.seller && x.seller_id !== f.seller) continue;
      const s = sales.find((y) => y.id === x.sale_id)!;
      out.push({ sale_id: x.sale_id, seller_id: x.seller_id, date: s.sale_date, credit: Math.round(((base.get(x.sale_id) ?? 0) - (ret.get(x.sale_id) ?? 0)) * Number(x.allocation_percentage) / 100) });
    }
  }
  return out;
}

export async function runReport(ctx: Context, key: string, f: ReportFilter, visibleSellerIds: Set<string>, profile: Profile, managedTeamIds: string[]): Promise<ReportResult | null> {
  const cd = await ctxData(ctx);
  const keep = <T extends { seller_id: string; date?: string; effective_at?: string }>(rows: T[]): T[] => (f.team ? rows.filter((r) => cd.teamIdAt(r.seller_id, (r.date ?? r.effective_at) as string) === f.team) : rows);
  const res = (cols: Col[], rows: Row[], totals?: Row, truncated = false): ReportResult => ({ cols, rows, totals, truncated });
  const monthOf = (iso: string) => iso.slice(0, 7);

  switch (key) {
    case 'vendas_periodo': {
      const q = ctx.supabase.from('sales').select('id, sale_number, sale_date, status, customer_id, net_amount_cents, commissionable_amount_cents, channel').gte('sale_date', f.from).lte('sale_date', f.to).order('sale_date').order('sale_number').limit(LIMIT);
      const { data } = await q;
      const rows = (data ?? []) as Array<{ id: string; sale_number: string; sale_date: string; status: string; customer_id: string | null; net_amount_cents: number; commissionable_amount_cents: number; channel: string | null }>;
      const ids = [...new Set(rows.map((r) => r.customer_id).filter((x): x is string => !!x))];
      const { data: cs } = ids.length ? await ctx.supabase.from('customers').select('id, name').in('id', ids.slice(0, 500)) : { data: [] };
      const cn = new Map(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      return res([t('numero', 'Venda'), d('data', 'Data'), t('cliente', 'Cliente'), t('canal', 'Canal'), t('status', 'Status'), m('liquido', 'Líquido'), m('base', 'Base comissionável')],
        rows.map((r) => ({ numero: r.sale_number, data: r.sale_date, cliente: r.customer_id ? cn.get(r.customer_id) ?? '' : '', canal: r.channel, status: SALE_STATUS_LABEL[r.status] ?? r.status, liquido: r.net_amount_cents, base: r.commissionable_amount_cents })),
        { numero: 'Total', liquido: sumBy(rows, (r) => r.net_amount_cents), base: sumBy(rows, (r) => r.commissionable_amount_cents) }, rows.length >= LIMIT);
    }
    case 'vendas_vendedor': case 'vendas_equipe': {
      const cr = keep(await credits(ctx, f));
      const by = new Map<string, { label: string; n: Set<string>; v: number }>();
      for (const c of cr) {
        const label = key === 'vendas_vendedor' ? cd.sName.get(c.seller_id) ?? '—' : cd.teamAt(c.seller_id, c.date);
        const e = by.get(label) ?? { label, n: new Set(), v: 0 };
        e.n.add(c.sale_id); e.v += c.credit; by.set(label, e);
      }
      const rows = [...by.values()].sort((a, b) => b.v - a.v);
      return res([t('nome', key === 'vendas_vendedor' ? 'Vendedor' : 'Equipe'), n('vendas', 'Vendas'), m('credito', 'Crédito atribuído')], rows.map((r) => ({ nome: r.label, vendas: r.n.size, credito: r.v })), { nome: 'Total', credito: sumBy(rows, (r) => r.v) });
    }
    case 'comissoes_periodo': {
      const es = keep(await entries(ctx, f));
      const months = [...new Set(es.map((e) => monthOf(e.effective_at)))].sort();
      const rows = months.map((mo) => { const x = es.filter((e) => monthOf(e.effective_at) === mo); return { mes: `${mo}-01`, com: net(x, ['commission']), bon: net(x, ['bonus']), aju: net(x, ['adjustment_positive', 'adjustment_negative']), est: net(x, ['reversal']), liq: net(x) }; });
      return res([d('mes', 'Mês'), m('com', 'Comissões'), m('bon', 'Bônus'), m('aju', 'Ajustes'), m('est', 'Estornos'), m('liq', 'Líquido')], rows, { mes: '', com: sumBy(rows, (r) => r.com), bon: sumBy(rows, (r) => r.bon), aju: sumBy(rows, (r) => r.aju), est: sumBy(rows, (r) => r.est), liq: sumBy(rows, (r) => r.liq) });
    }
    case 'comissoes_vendedor': case 'comissoes_equipe': {
      const es = keep(await entries(ctx, f));
      const by = new Map<string, EntryRaw[]>();
      for (const e of es) { const k = key === 'comissoes_vendedor' ? cd.sName.get(e.seller_id) ?? '—' : cd.teamAt(e.seller_id, e.effective_at); by.set(k, [...(by.get(k) ?? []), e]); }
      const rows = [...by.entries()].map(([nome, x]) => ({ nome, com: net(x, ['commission']), bon: net(x, ['bonus']), aju: net(x, ['adjustment_positive', 'adjustment_negative']), est: net(x, ['reversal']), liq: net(x) })).sort((a, b) => b.liq - a.liq);
      return res([t('nome', key === 'comissoes_vendedor' ? 'Vendedor' : 'Equipe'), m('com', 'Comissões'), m('bon', 'Bônus'), m('aju', 'Ajustes'), m('est', 'Estornos'), m('liq', 'Líquido')], rows, { nome: 'Total', com: sumBy(rows, (r) => r.com), bon: sumBy(rows, (r) => r.bon), aju: sumBy(rows, (r) => r.aju), est: sumBy(rows, (r) => r.est), liq: sumBy(rows, (r) => r.liq) });
    }
    case 'comissoes_plano': case 'comissoes_categoria': {
      const es = keep(await entries(ctx, f));
      const label = new Map<string, string>();
      if (key === 'comissoes_plano') {
        const vids = [...new Set(es.map((e) => e.plan_version_id).filter((x): x is string => !!x))];
        const { data: vs } = vids.length ? await ctx.supabase.from('commission_plan_versions').select('id, plan_id').in('id', vids.slice(0, 500)) : { data: [] };
        const { data: ps } = (vs ?? []).length ? await ctx.supabase.from('commission_plans').select('id, name').in('id', [...new Set(((vs ?? []) as Array<{ plan_id: string }>).map((v) => v.plan_id))]) : { data: [] };
        const pn = new Map(((ps ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
        for (const v of (vs ?? []) as Array<{ id: string; plan_id: string }>) label.set(v.id, pn.get(v.plan_id) ?? '—');
      } else {
        const iids = [...new Set(es.map((e) => e.sale_item_id).filter((x): x is string => !!x))];
        const items: Array<{ id: string; product_id: string | null }> = [];
        for (const part of chunk(iids)) items.push(...((await ctx.supabase.from('sale_items').select('id, product_id').in('id', part)).data ?? []) as typeof items);
        const pids = [...new Set(items.map((i) => i.product_id).filter((x): x is string => !!x))];
        const prods: Array<{ id: string; category_id: string | null }> = [];
        for (const part of chunk(pids)) prods.push(...((await ctx.supabase.from('products').select('id, category_id').in('id', part)).data ?? []) as typeof prods);
        const { data: cs } = await ctx.supabase.from('product_categories').select('id, name');
        const cn = new Map(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
        const pc = new Map(prods.map((x) => [x.id, x.category_id]));
        for (const i of items) label.set(i.id, (i.product_id && pc.get(i.product_id) ? cn.get(pc.get(i.product_id)!) : null) ?? 'Sem categoria');
      }
      const by = new Map<string, EntryRaw[]>();
      for (const e of es) { const k = (key === 'comissoes_plano' ? (e.plan_version_id ? label.get(e.plan_version_id) : null) ?? 'Ajustes manuais' : (e.sale_item_id ? label.get(e.sale_item_id) : null) ?? 'Sem categoria'); by.set(k, [...(by.get(k) ?? []), e]); }
      const rows = [...by.entries()].map(([nome, x]) => ({ nome, liq: net(x), n: x.length })).sort((a, b) => b.liq - a.liq);
      return res([t('nome', key === 'comissoes_plano' ? 'Plano' : 'Categoria'), n('n', 'Lançamentos'), m('liq', 'Líquido')], rows, { nome: 'Total', liq: sumBy(rows, (r) => r.liq) });
    }
    case 'bonus': case 'estornos': case 'pendentes': case 'aprovadas': {
      const es = keep(await entries(ctx, f, key === 'pendentes' ? ['calculated', 'pending_review', 'contested'] : key === 'aprovadas' ? ['approved', 'adjusted'] : undefined, key === 'bonus' ? ['bonus'] : key === 'estornos' ? ['reversal'] : undefined));
      return res([d('data', 'Data'), t('vendedor', 'Vendedor'), t('tipo', 'Tipo'), t('status', 'Status'), m('valor', 'Valor')], es.map((e) => ({ data: e.effective_at, vendedor: cd.sName.get(e.seller_id) ?? '—', tipo: ENTRY_TYPE_LABEL[e.entry_type], status: APPROVAL_LABEL[e.approval_status], valor: e.amount_cents })), { data: '', vendedor: 'Total', valor: sumBy(es, (e) => e.amount_cents) }, es.length >= LIMIT);
    }
    case 'ajustes': {
      let q = ctx.supabase.from('commission_adjustments').select('effective_at, seller_id, adjustment_type, direction, amount_cents, reason, reference, status').gte('effective_at', f.from).lte('effective_at', f.to).order('effective_at').limit(LIMIT);
      if (f.seller) q = q.eq('seller_id', f.seller);
      const { data } = await q;
      const rows = (data ?? []) as Array<{ effective_at: string; seller_id: string; adjustment_type: string; direction: string; amount_cents: number; reason: string; reference: string | null; status: string }>;
      return res([d('data', 'Data'), t('vendedor', 'Vendedor'), t('tipo', 'Tipo'), t('motivo', 'Motivo'), t('ref', 'Referência'), t('status', 'Situação'), m('valor', 'Valor')],
        rows.map((r) => ({ data: r.effective_at, vendedor: cd.sName.get(r.seller_id) ?? '—', tipo: ADJUSTMENT_TYPE_LABEL[r.adjustment_type], motivo: r.reason, ref: r.reference, status: { pending: 'Aguardando', approved: 'Aprovado', rejected: 'Rejeitado' }[r.status] ?? r.status, valor: r.direction === 'debit' ? -r.amount_cents : r.amount_cents })));
    }
    case 'metas': case 'atingimento': {
      const lines = (await goalLines(ctx, profile, visibleSellerIds, managedTeamIds, { from: f.from, to: f.to })).filter((l) => key === 'metas' || l.goal.scope === 'seller');
      const money = (type: string) => ['sold_value', 'received_value', 'product_value'].includes(type);
      return res([t('meta', 'Meta'), t('tipo', 'Tipo'), t('alvo', 'Alvo'), d('ini', 'Início'), d('fim', 'Fim'), t('meta_valor', 'Meta'), t('real', 'Realizado'), p('pct', 'Atingimento (%)')],
        lines.map((l) => ({ meta: l.goal.name, tipo: GOAL_TYPE_LABEL[l.goal.type], alvo: l.goal.scope === 'seller' ? cd.sName.get(l.goal.scopeReference ?? '') ?? '' : l.goal.scope === 'team' ? cd.tName.get(l.goal.scopeReference ?? '') ?? '' : 'Empresa', ini: l.goal.periodStart, fim: l.goal.periodEnd,
          meta_valor: money(l.goal.type) ? (Number(l.goal.target) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.goal.target, real: money(l.goal.type) ? (Number(l.value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(Math.round(Number(l.value))), pct: l.attainment * 100 })));
    }
    case 'pagas': {
      let q = ctx.supabase.from('payout_records').select('payment_date, seller_id, payment_method, external_reference, status, amount_cents').gte('payment_date', f.from).lte('payment_date', f.to).order('payment_date').limit(LIMIT);
      if (f.seller) q = q.eq('seller_id', f.seller);
      const { data } = await q;
      const rows = (data ?? []) as Array<{ payment_date: string; seller_id: string; payment_method: string; external_reference: string | null; status: string; amount_cents: number }>;
      return res([d('data', 'Data'), t('vendedor', 'Vendedor'), t('forma', 'Forma'), t('ref', 'Referência'), t('status', 'Situação'), m('valor', 'Valor')], rows.map((r) => ({ data: r.payment_date, vendedor: cd.sName.get(r.seller_id) ?? '—', forma: PAYMENT_METHOD_LABEL[r.payment_method], ref: r.external_reference, status: r.status === 'recorded' ? 'Registrado' : 'Estornado', valor: r.amount_cents })),
        { data: '', vendedor: 'Total (registrados)', valor: sumBy(rows.filter((r) => r.status === 'recorded'), (r) => r.amount_cents) });
    }
    case 'saldos': case 'fechamentos': {
      const { data: per } = await ctx.supabase.from('commission_periods').select('id, period_start, period_end').lte('period_start', f.to).gte('period_end', f.from);
      const periods = (per ?? []) as Array<{ id: string; period_start: string; period_end: string }>;
      const pid = new Map(periods.map((x) => [x.id, x]));
      if (!periods.length) return res([t('x', 'Sem fechamentos no período')], []);
      let q = ctx.supabase.from('commission_closings').select('id, period_id, seller_id, total_commissions_cents, total_bonuses_cents, total_adjustments_cents, total_reversals_cents, carryover_in_cents, payable_amount_cents, status').in('period_id', periods.map((x) => x.id)).neq('status', 'cancelled').limit(LIMIT);
      if (f.seller) q = q.eq('seller_id', f.seller);
      const { data } = await q;
      const rows = (data ?? []) as Array<{ id: string; period_id: string; seller_id: string; total_commissions_cents: number; total_bonuses_cents: number; total_adjustments_cents: number; total_reversals_cents: number; carryover_in_cents: number; payable_amount_cents: number; status: string }>;
      if (key === 'fechamentos') return res([d('ini', 'Período de'), d('fim', 'até'), t('vendedor', 'Vendedor'), t('status', 'Situação'), m('com', 'Comissões'), m('bon', 'Bônus'), m('aju', 'Ajustes'), m('est', 'Estornos'), m('pagar', 'A pagar')],
        rows.map((r) => ({ ini: pid.get(r.period_id)?.period_start ?? '', fim: pid.get(r.period_id)?.period_end ?? '', vendedor: cd.sName.get(r.seller_id) ?? '—', status: CLOSING_STATUS_LABEL[r.status], com: r.total_commissions_cents, bon: r.total_bonuses_cents, aju: r.total_adjustments_cents, est: r.total_reversals_cents, pagar: r.payable_amount_cents })),
        { vendedor: 'Total', pagar: sumBy(rows, (r) => r.payable_amount_cents) });
      const { data: bal } = await ctx.supabase.from('commission_closing_balances').select('closing_id, paid_cents').in('closing_id', rows.map((r) => r.id).slice(0, 500));
      const paid = new Map(((bal ?? []) as Array<{ closing_id: string; paid_cents: number }>).map((b) => [b.closing_id, b.paid_cents]));
      const closed = rows.filter((r) => r.status === 'closed');
      return res([d('ini', 'Período de'), d('fim', 'até'), t('vendedor', 'Vendedor'), m('pagar', 'Aprovado a pagar'), m('pago', 'Registrado como pago'), m('saldo', 'Saldo pendente')],
        closed.map((r) => ({ ini: pid.get(r.period_id)?.period_start ?? '', fim: pid.get(r.period_id)?.period_end ?? '', vendedor: cd.sName.get(r.seller_id) ?? '—', pagar: r.payable_amount_cents, pago: paid.get(r.id) ?? 0, saldo: r.payable_amount_cents - (paid.get(r.id) ?? 0) })),
        { vendedor: 'Total', saldo: sumBy(closed, (r) => r.payable_amount_cents - (paid.get(r.id) ?? 0)) });
    }
    case 'demonstrativos': {
      const { data } = await ctx.supabase.from('commission_statements').select('seller_id, version_number, generated_at, closing_id').gte('generated_at', `${f.from}T00:00:00Z`).lte('generated_at', `${f.to}T23:59:59Z`).order('generated_at').limit(LIMIT);
      const rows = (data ?? []) as Array<{ seller_id: string; version_number: number; generated_at: string }>;
      return res([d('data', 'Gerado em'), t('vendedor', 'Vendedor'), n('versao', 'Versão')], rows.map((r) => ({ data: r.generated_at, vendedor: cd.sName.get(r.seller_id) ?? '—', versao: r.version_number })));
    }
    case 'divergencias': {
      const { data } = await ctx.supabase.from('commission_disputes').select('opened_at, seller_id, status, description, resolution').gte('opened_at', `${f.from}T00:00:00Z`).lte('opened_at', `${f.to}T23:59:59Z`).order('opened_at').limit(LIMIT);
      const rows = (data ?? []) as Array<{ opened_at: string; seller_id: string; status: string; description: string; resolution: string | null }>;
      return res([d('data', 'Aberta em'), t('vendedor', 'Vendedor'), t('status', 'Status'), t('desc', 'Descrição'), t('resp', 'Resposta')], rows.map((r) => ({ data: r.opened_at, vendedor: cd.sName.get(r.seller_id) ?? '—', status: DISPUTE_STATUS_LABEL[r.status], desc: r.description, resp: r.resolution })));
    }
    default:
      return null;
  }
}
