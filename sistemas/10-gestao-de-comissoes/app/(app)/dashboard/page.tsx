import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Kpi, Section } from '@/components/cm/bits';
import { DonutClient, MoneyChartClient, MoneyLinesClient } from '@/components/cm/charts-loader';
import { FInput, FSelect, FilterForm, Progress, StatusPill } from '@/components/cm/page-bits';
import { goalKpis, goalLines, loadOptions } from '@/lib/commissions/data';
import { brl, monthBR, pctBR } from '@/lib/commissions/format';
import { APPROVAL_LABEL, GOAL_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { PRESETS, PRESET_LABEL, isUuid, one, resolvePeriod, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Painel de comissões' };

type Kpis = {
  sales_base_cents: number; sales_count: number; commissions_cents: number; bonuses_cents: number; adjustments_cents: number; reversals_cents: number; calculated_cents: number;
  provisional_cents: number; approved_cents: number; rejected_cents: number; paid_cents: number | null; payable_cents: number | null; cost_pct: number | null; active_sellers: number;
  pending_periods: number; closings_without_statement: number;
};
type Dash = {
  base_mode: 'sale' | 'credit'; kpis: Kpis;
  monthly: Array<{ month: string; base_cents: number; calculated_cents: number; approved_cents: number; paid_cents: number | null; reversals_cents: number; adjustments_cents: number }>;
  ranking_sales: Array<{ name: string; cents: number }>; ranking_commission: Array<{ name: string; cents: number }>;
  by_team: Array<{ name: string; cents: number }>; by_category: Array<{ name: string; cents: number }>; by_status: Array<{ status: string; count: number; cents: number }>; by_plan: Array<{ name: string; cents: number }>;
};
type Agg = { sales_base_cents: number; sales_count: number; calculated_cents: number; approved_cents: number; paid_cents: number; reversals_cents: number; cost_pct: number | null };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx();
  const { ctx, org, perms, profile } = pc;
  const period = resolvePeriod(sp, pc.today);
  const base = '/dashboard';

  // ---- visão «Consulta»: somente agregados da empresa (nenhuma remuneração individual)
  if (profile === 'viewer') {
    const { data } = await ctx.supabase.rpc('cm_org_aggregates', { p_org: org, p_from: period.from, p_to: period.to });
    const a = data as Agg | null;
    return (
      <>
        <PageHeader title="Painel" description="Visão agregada da empresa. Remuneração individual não é exibida neste perfil." />
        <FilterForm clear={base}>
          <FSelect name="p" label="Período" sp={sp} opts={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))} placeholder="Mês atual" />
          <FInput name="from" label="De" sp={sp} type="date" /><FInput name="to" label="Até" sp={sp} type="date" />
        </FilterForm>
        {a ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Vendas elegíveis" value={brl(a.sales_base_cents)} definition="Valor comissionável das vendas confirmadas no período, líquido de devoluções." />
            <Kpi label="Comissões calculadas" value={brl(a.calculated_cents)} definition="Soma líquida dos lançamentos do período, exceto rejeitados." />
            <Kpi label="Comissões aprovadas" value={brl(a.approved_cents)} />
            <Kpi label="Registradas como pagas" value={brl(a.paid_cents)} />
            <Kpi label="Comissões estornadas" value={brl(a.reversals_cents)} />
            <Kpi label="Custo de comissão sobre vendas" value={a.cost_pct === null ? '—' : pctBR(a.cost_pct)} definition="Comissões calculadas ÷ vendas elegíveis. Sem vendas no período, não há percentual." />
          </div>
        ) : <EmptyState title="Sem dados para o período" />}
      </>
    );
  }

  // ---- demais perfis
  const opts = await loadOptions(ctx);
  const filters: Record<string, string> = {};
  for (const k of ['seller_id', 'team_id', 'manager_user', 'plan_id', 'category_id', 'product_id', 'customer_id'] as const) {
    const key = { seller_id: 'seller', team_id: 'team', manager_user: 'manager', plan_id: 'plan', category_id: 'category', product_id: 'product', customer_id: 'customer' }[k];
    const v = one(sp[key]);
    if (isUuid(v)) filters[k] = v;
  }
  const appr = one(sp.status);
  if (appr && Object.keys(APPROVAL_LABEL).includes(appr)) filters.approval_status = appr;
  const clo = one(sp.closing);
  if (clo && ['none', 'draft', 'awaiting_approval', 'closed'].includes(clo)) filters.closing_status = clo;

  const { data, error } = await ctx.supabase.rpc('cm_dashboard', { p_org: org, p_from: period.from, p_to: period.to, p_f: filters });
  const d = data as Dash | null;
  const k = d?.kpis;

  const visibleSellers = new Set(opts.sellers.map((s) => s.value));
  const lines = await goalLines(ctx, profile!, visibleSellers, pc.managedTeamIds, { from: period.from, to: period.to });
  const gk = goalKpis(lines);
  const isSeller = profile === 'seller';
  const mine = (a: string, b: string) => (isSeller ? a : b);

  const monthly = (d?.monthly ?? []).map((m) => ({ name: monthBR(m.month), base: m.base_cents, calculated: m.calculated_cents, approved: m.approved_cents, paid: m.paid_cents ?? 0, reversals: m.reversals_cents, adjustments: m.adjustments_cents }));
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      <PageHeader title={mine('Meu painel de comissões', 'Painel de comissões')} description={isSeller ? 'Suas vendas, comissões, metas e demonstrativos. Você vê somente os seus dados.' : 'Indicadores calculados no PostgreSQL com os lançamentos reais. Calculado, aprovado e pago são coisas diferentes.'}>
        {perms.runCalculation ? <Link href="/comissoes" className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Calcular e revisar comissões</Link> : null}
      </PageHeader>

      <FilterForm clear={base}>
        <FSelect name="p" label="Período" sp={sp} opts={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))} placeholder="Mês atual" />
        <FInput name="from" label="De (período personalizado)" sp={sp} type="date" /><FInput name="to" label="Até" sp={sp} type="date" />
        {!isSeller ? <FSelect name="seller" label="Vendedor" sp={sp} opts={opts.sellers} /> : null}
        {!isSeller ? <FSelect name="team" label="Equipe" sp={sp} opts={opts.teams} /> : null}
        <FSelect name="plan" label="Plano" sp={sp} opts={opts.plans} />
        <FSelect name="category" label="Categoria" sp={sp} opts={opts.categories} />
        <FSelect name="product" label="Produto" sp={sp} opts={opts.products} />
        <FSelect name="customer" label="Cliente" sp={sp} opts={opts.customers} />
        <FSelect name="status" label="Status da comissão" sp={sp} opts={Object.entries(APPROVAL_LABEL).map(([value, label]) => ({ value, label }))} />
        <FSelect name="closing" label="Status do fechamento" sp={sp} opts={[{ value: 'none', label: 'Fora de fechamento' }, { value: 'draft', label: 'Em conferência' }, { value: 'awaiting_approval', label: 'Aguardando aprovação' }, { value: 'closed', label: 'Fechado' }]} />
      </FilterForm>

      {error || !k ? <Alert tone="error">Não foi possível carregar os indicadores. Tente novamente.</Alert> : (
        <>
          <p className="mb-3 text-xs text-muted">
            Período {period.from.split('-').reverse().join('/')} a {period.to.split('-').reverse().join('/')} · vendas {d!.base_mode === 'sale' ? 'contadas uma vez por venda' : 'pelo crédito atribuído (valor × % de participação)'} · valores em BRL.
            {filtered ? ' Filtros ativos.' : ''}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={mine('Minhas vendas elegíveis', 'Vendas elegíveis')} value={brl(k.sales_base_cents)} definition={`${k.sales_count} venda(s) confirmada(s), líquidas de devoluções.`} />
            <Kpi label={mine('Minha comissão calculada', 'Comissões calculadas')} value={brl(k.calculated_cents)} definition={`Comissões ${brl(k.commissions_cents)} · bônus ${brl(k.bonuses_cents)} · ajustes ${brl(k.adjustments_cents)} · estornos −${brl(k.reversals_cents)}. Provisório ${brl(k.provisional_cents)} · definitivo ${brl(k.approved_cents)}.`} />
            <Kpi label={mine('Minha comissão aprovada', 'Comissões aprovadas')} value={brl(k.approved_cents)} tone="success" definition="Lançamentos aprovados (inclui ajustados), líquidos de estornos e ajustes." />
            <Kpi label={mine('Minha comissão pendente', 'Comissões pendentes')} value={brl(k.provisional_cents)} tone="warning" definition="Calculada e ainda aguardando revisão/aprovação (ou contestada)." />
            <Kpi label={mine('Minha comissão paga', 'Registradas como pagas')} value={k.paid_cents === null ? 'não se aplica' : brl(k.paid_cents)} definition="Pagamentos registrados (feitos fora do sistema), líquidos de estornos de registro. Não se aplica quando há filtro por plano, categoria, produto, cliente ou status." />
            <Kpi label="Valor a pagar" value={k.payable_cents === null ? 'não se aplica' : brl(k.payable_cents)} tone={k.payable_cents && k.payable_cents > 0 ? 'warning' : undefined} definition="Saldo aprovado até a data final ainda não registrado como pago, já com estornos e ajustes." />
            <Kpi label="Custo de comissão sobre vendas" value={k.cost_pct === null ? '—' : pctBR(k.cost_pct)} definition="Comissões calculadas ÷ vendas elegíveis do período. Sem vendas no período não há percentual (nunca infinito)." />
            <Kpi label="Comissões estornadas" value={brl(k.reversals_cents)} tone={k.reversals_cents > 0 ? 'danger' : undefined} definition="Soma dos estornos lançados no período (devoluções, cancelamentos, recálculos)." />
            <Kpi label={mine('Minhas metas atingidas', 'Vendedores com meta atingida')} value={String(gk.sellersReached)} definition={`Metas por vendedor ativas no período: ${lines.filter((l) => l.goal.scope === 'seller').length}.`} />
            <Kpi label="Atingimento médio de metas" value={gk.avgSimplePct === null ? '—' : pctBR(gk.avgSimplePct, 1)} definition={`Média simples entre as metas por vendedor. Atingimento agregado (Σ realizado ÷ Σ meta): ${gk.aggregatedPct === null ? '—' : pctBR(gk.aggregatedPct, 1)}.`} />
            <Kpi label="Vendedores ativos" value={String(k.active_sellers)} definition="Ativos na data final, dentro do escopo que você pode ver." />
            <Kpi label="Fechamentos pendentes" value={String(k.pending_periods)} tone={k.pending_periods > 0 ? 'warning' : undefined} definition={`Períodos já encerrados e ainda não fechados. Fechamentos sem demonstrativo: ${k.closings_without_statement}.`} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card title="Evolução mensal das comissões" description="Calculadas × aprovadas (líquidas de estornos e ajustes)."><MoneyChartClient data={monthly} series={[{ key: 'calculated', name: 'Calculadas' }, { key: 'approved', name: 'Aprovadas' }]} /></Card>
            <Card title="Aprovadas × pagas" description="Pagamentos pelo mês em que foram registrados."><MoneyChartClient data={monthly} series={[{ key: 'approved', name: 'Aprovadas' }, { key: 'paid', name: 'Pagas' }]} /></Card>
            <Card title="Base de vendas × custo de comissão" description="Vendas elegíveis (barras) e comissões calculadas (linha) por mês."><MoneyChartClient data={monthly} series={[{ key: 'base', name: 'Vendas elegíveis' }, { key: 'calculated', name: 'Comissões', type: 'line' }]} /></Card>
            <Card title="Estornos e ajustes" description="Evolução mensal."><MoneyLinesClient data={monthly} series={[{ key: 'reversals', name: 'Estornos' }, { key: 'adjustments', name: 'Ajustes' }]} /></Card>
            {!isSeller ? <Card title="Ranking por vendas elegíveis" description="Crédito atribuído (rateio aplicado, sem dupla contagem)."><MoneyChartClient horizontal data={(d?.ranking_sales ?? []).map((r) => ({ name: r.name, value: r.cents }))} series={[{ key: 'value', name: 'Vendas' }]} /></Card> : null}
            {!isSeller ? <Card title="Ranking por comissões"><MoneyChartClient horizontal data={(d?.ranking_commission ?? []).map((r) => ({ name: r.name, value: r.cents }))} series={[{ key: 'value', name: 'Comissão' }]} /></Card> : null}
            {!isSeller ? <Card title="Comissões por equipe" description="Equipe vigente na data de cada lançamento (mudanças de equipe não reescrevem o passado)."><MoneyChartClient data={(d?.by_team ?? []).map((r) => ({ name: r.name, value: r.cents }))} series={[{ key: 'value', name: 'Comissão' }]} /></Card> : null}
            <Card title={mine('Minhas comissões por categoria', 'Comissões por categoria de produto')}><DonutClient data={(d?.by_category ?? []).map((r) => ({ name: r.name, value: r.cents }))} /></Card>
            <Card title="Distribuição por status"><DonutClient money={false} data={(d?.by_status ?? []).map((r) => ({ name: APPROVAL_LABEL[r.status] ?? r.status, value: r.count }))} /></Card>
            <Card title="Desempenho por plano de comissão"><MoneyChartClient data={(d?.by_plan ?? []).map((r) => ({ name: r.name, value: r.cents }))} series={[{ key: 'value', name: 'Comissão' }]} /></Card>
          </div>

          <Section title={mine('Minhas metas', 'Atingimento de metas')} description="Realizado ÷ meta, calculado pelo mesmo motor usado nos bônus. Metas arquivadas não aparecem.">
            {lines.length === 0 ? <EmptyState title="Nenhuma meta ativa no período" description={perms.goals ? 'Cadastre metas em Metas e bônus.' : undefined} /> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lines.map((l) => (
                  <Card key={l.goal.id}>
                    <p className="font-medium">{l.goal.name}</p>
                    <p className="text-xs text-muted">{GOAL_TYPE_LABEL[l.goal.type]} · {l.goal.periodStart.split('-').reverse().join('/')} a {l.goal.periodEnd.split('-').reverse().join('/')}</p>
                    <div className="mt-3"><Progress pct={l.attainment * 100} label={`Atingimento de ${l.goal.name}`} /></div>
                    <p className="mt-1 text-sm tabular-nums">{pctBR(l.attainment * 100, 1)} {l.reached ? <StatusPill kind="approval" status="approved" /> : null}</p>
                  </Card>
                ))}
              </div>
            )}
          </Section>
          <p className="mt-6 text-xs text-muted">Definições completas dos indicadores: docs/METRICS.md. Este painel é controle gerencial e não substitui folha de pagamento nem assessoria trabalhista.</p>
        </>
      )}
    </>
  );
}

