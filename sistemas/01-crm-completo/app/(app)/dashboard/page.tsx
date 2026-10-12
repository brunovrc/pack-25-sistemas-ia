import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/primitives';
import { FilterBar } from '@/components/crm/filter-bar';
import { FunnelChartClient, GoalsChartClient, RepChartClient, SalesChartClient, SourcesChartClient, WonLostChartClient } from '@/components/crm/charts-loader';
import { requireContext } from '@/lib/auth/session';
import { activeOptions, personOptions, type SearchParams } from '@/lib/crm/access';
import { goalLabel, seriesRows, summarizeGoals } from '@/lib/crm/chart-data';
import { crmSettings, labelMap, loadDashboard, loadOptions, type AlertRow } from '@/lib/crm/data';
import { parseFilters, filtersToQuery } from '@/lib/crm/filters';
import { formatBRL, formatDate, formatPct } from '@/lib/crm/format';

export const metadata: Metadata = { title: 'Painel' };

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'muted' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'muted' ? 'text-muted' : ''}`}>{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </div>
  );
}

const ALERT_META: Record<AlertRow['kind'], { title: string; href: (a: AlertRow) => string; text: (a: AlertRow) => string }> = {
  overdue_activity: { title: 'Follow-ups atrasados', href: () => '/activities?state=overdue', text: (a) => `${a.title} · ${a.days ?? 0} dia(s) de atraso` },
  stale_opportunity: { title: 'Oportunidades paradas', href: (a) => `/opportunities/${a.ref_id}`, text: (a) => `${a.title} · ${a.days ?? 0} dia(s) sem atividade` },
  closing_soon: { title: 'Fechamento próximo', href: (a) => `/opportunities/${a.ref_id}`, text: (a) => `${a.title} · ${a.days === 0 ? 'hoje' : `em ${a.days} dia(s)`} · ${formatBRL(a.detail)}` },
  goal_pace: { title: 'Metas abaixo do ritmo', href: () => '/goals', text: (a) => `${a.title} · ${formatPct(a.detail)} atingido` },
};

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const seesAll = ctx.membership.role !== 'member';

  const [options, data, settings] = await Promise.all([loadOptions(ctx), loadDashboard(ctx, filters), crmSettings(ctx)]);
  const labels = labelMap(options.people);
  const query = filtersToQuery(filters);

  if (data.error || !data.kpis) {
    return (
      <>
        <PageHeader title="Painel" />
        <Alert tone="error">Não foi possível carregar os indicadores agora. Tente novamente em instantes.</Alert>
      </>
    );
  }

  const k = data.kpis;
  const goals = summarizeGoals(data.goals);
  const series = seriesRows(data.series, filters.from, filters.to);
  const alertsByKind = (kind: AlertRow['kind']) => data.alerts.filter((a) => a.kind === kind);
  const ranking = data.reps.map((r) => ({ ...r, name: labels.get(r.user_id) ?? 'Usuário' }));

  return (
    <>
      <PageHeader title="Painel" description={`Período: ${formatDate(filters.from)} a ${formatDate(filters.to)}. Números calculados do banco de dados; fórmulas em docs/METRICS.md.`}>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href={`/reports?${query}`}>Relatórios</Link>
      </PageHeader>

      <FilterBar
        action="/dashboard"
        filters={filters}
        owners={seesAll ? personOptions(options.people) : undefined}
        teams={seesAll ? options.teams.map((t) => ({ value: t.id, label: t.name })) : undefined}
        sources={activeOptions(options.sources)}
      />
      {ctx.membership.role === 'member' ? <div className="mb-4"><Alert tone="info">Você vê os números dos seus próprios leads e oportunidades.</Alert></div> : null}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Pipeline ativo" value={formatBRL(k.pipeline_value)} hint={`${k.pipeline_count} oportunidade(s) aberta(s) · situação atual, não depende do período`} />
        <Kpi label="Vendas ganhas" value={formatBRL(k.won_value)} hint={`${k.won_count} negócio(s) ganho(s) no período · valor registrado no CRM, não é faturamento`} />
        <Kpi label="Taxa de conversão" value={formatPct(k.conversion_rate)} hint={k.conversion_rate === null ? 'Sem negócios encerrados no período' : `${k.won_count} ganho(s) ÷ (${k.won_count} ganho(s) + ${k.lost_count} perdido(s))`} tone={k.conversion_rate === null ? 'muted' : undefined} />
        <Kpi label="Leads ativos" value={k.active_leads.toLocaleString('pt-BR')} hint="Novo, contatado ou qualificado · situação atual" />
        <Kpi label="Ticket médio" value={formatBRL(k.avg_ticket)} hint={k.avg_ticket === null ? 'Sem negócios ganhos no período' : 'Valor ganho ÷ negócios ganhos'} tone={k.avg_ticket === null ? 'muted' : undefined} />
        <Kpi label="Metas no período" value={goals.pct === null ? '—' : formatPct(goals.pct)} hint={goals.count === 0 ? 'Nenhuma meta definida para o período' : `${formatBRL(goals.realized)} de ${formatBRL(goals.target)} · ${goals.count} meta(s) ${goals.scopeLabel} · ${goals.met} atingida(s)`} tone={goals.pct === null ? 'muted' : undefined} />
      </section>

      <section aria-label="Gráficos" className="mt-6 grid gap-4 lg:grid-cols-2">
        <SalesChartClient rows={series} />
        <FunnelChartClient rows={data.funnel.map((f) => ({ name: f.stage_name, count: f.opp_count, value: f.opp_value }))} />
        <RepChartClient rows={ranking.map((r) => ({ name: r.name, won_value: r.won_value, won_count: r.won_count }))} />
        <SourcesChartClient rows={data.sources.map((s) => ({ name: s.source_name, count: s.lead_count }))} />
        <WonLostChartClient rows={series} />
        <GoalsChartClient rows={data.goals.map((g) => ({ name: goalLabel(g, labels), target: g.target_amount, realized: g.realized, pct: g.pct }))} />
      </section>

      <section aria-label="Alertas e ranking" className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Alertas" description={`Parada = sem atividade há mais de ${settings.stale_days} dia(s). Fechamento próximo = em até ${settings.closing_soon_days} dia(s).`}>
          {data.alerts.length === 0 ? <p className="text-sm text-muted">Nenhum alerta no momento. Tudo em dia.</p> : (
            <div className="space-y-4">
              {(Object.keys(ALERT_META) as AlertRow['kind'][]).map((kind) => {
                const list = alertsByKind(kind);
                if (list.length === 0) return null;
                return (
                  <div key={kind}>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">{ALERT_META[kind].title} <Badge tone={kind === 'goal_pace' ? 'warning' : 'danger'}>{list.length}</Badge></h3>
                    <ul className="space-y-1 text-sm">
                      {list.slice(0, 5).map((a) => (
                        <li key={`${kind}-${a.ref_id}`}><Link className="underline-offset-2 hover:underline" href={ALERT_META[kind].href(a)}>{ALERT_META[kind].text(a)}</Link>{a.owner_id && seesAll ? <span className="text-muted"> · {labels.get(a.owner_id) ?? 'Usuário'}</span> : null}</li>
                      ))}
                      {list.length > 5 ? <li className="text-muted">e mais {list.length - 5}…</li> : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card title="Ranking de vendedores" description="Por valor ganho no período. Conversão e metas atingidas ao lado.">
          {ranking.length === 0 ? <p className="text-sm text-muted">Sem vendedores com oportunidades.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Ranking de vendedores</caption>
                <thead className="text-left text-muted"><tr><th className="py-1 pr-2 font-medium">#</th><th className="py-1 pr-2 font-medium">Vendedor</th><th className="py-1 pr-2 text-right font-medium">Ganhos</th><th className="py-1 pr-2 text-right font-medium">Valor</th><th className="py-1 pr-2 text-right font-medium">Conversão</th><th className="py-1 text-right font-medium">Metas</th></tr></thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.user_id} className="border-t border-border">
                      <td className="py-2 pr-2 tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-2 font-medium">{r.name}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.won_count}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(r.won_value)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatPct(r.conversion_rate)}</td>
                      <td className="py-2 text-right tabular-nums">{r.goals_met}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
