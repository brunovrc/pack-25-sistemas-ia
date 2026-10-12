import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { FilterBar } from '@/components/crm/filter-bar';
import { requireContext } from '@/lib/auth/session';
import { activeOptions, personOptions, type SearchParams } from '@/lib/crm/access';
import { labelMap, loadDashboard, loadOptions, lostReasonsReport } from '@/lib/crm/data';
import { filtersToQuery, parseFilters } from '@/lib/crm/filters';
import { formatBRL, formatDate, formatPct } from '@/lib/crm/format';

export const metadata: Metadata = { title: 'Relatórios' };

const exportLink = 'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5';

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const seesAll = ctx.membership.role !== 'member';
  const options = await loadOptions(ctx);
  const [data, lost] = await Promise.all([loadDashboard(ctx, filters), lostReasonsReport(ctx, filters, options.reasons)]);
  const labels = labelMap(options.people);
  const q = filtersToQuery(filters);

  return (
    <>
      <PageHeader title="Relatórios" description={`Período: ${formatDate(filters.from)} a ${formatDate(filters.to)}. Cada relatório pode ser exportado em CSV com os mesmos filtros.`} />
      <FilterBar action="/reports" filters={filters} owners={seesAll ? personOptions(options.people) : undefined} teams={seesAll ? options.teams.map((t) => ({ value: t.id, label: t.name })) : undefined} sources={activeOptions(options.sources)} />
      {data.error ? <Alert tone="error">Não foi possível carregar os relatórios agora.</Alert> : null}

      <div className="space-y-6">
        <Card title="Vendas por vendedor" description="Negócios ganhos e perdidos no período, conversão e metas atingidas.">
          <div className="mb-3"><Link className={exportLink} href={`/export/sales-by-rep?${q}`} prefetch={false}>Exportar CSV</Link></div>
          {data.reps.length === 0 ? <EmptyState title="Sem dados no período" /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Vendas por vendedor</caption>
              <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-medium">Vendedor</th><th className="py-1 pr-3 text-right font-medium">Ganhos</th><th className="py-1 pr-3 text-right font-medium">Valor ganho</th><th className="py-1 pr-3 text-right font-medium">Perdidos</th><th className="py-1 pr-3 text-right font-medium">Conversão</th><th className="py-1 text-right font-medium">Metas atingidas</th></tr></thead>
              <tbody>{data.reps.map((r) => <tr key={r.user_id} className="border-t border-border"><td className="py-2 pr-3 font-medium">{labels.get(r.user_id) ?? 'Usuário'}</td><td className="py-2 pr-3 text-right tabular-nums">{r.won_count}</td><td className="py-2 pr-3 text-right tabular-nums">{formatBRL(r.won_value)}</td><td className="py-2 pr-3 text-right tabular-nums">{r.lost_count}</td><td className="py-2 pr-3 text-right tabular-nums">{formatPct(r.conversion_rate)}</td><td className="py-2 text-right tabular-nums">{r.goals_met}</td></tr>)}</tbody></table></div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Funil" description="Oportunidades abertas por etapa (situação atual).">
            <div className="mb-3"><Link className={exportLink} href={`/export/funnel?${q}`} prefetch={false}>Exportar CSV</Link></div>
            <table className="w-full text-sm"><caption className="sr-only">Funil</caption>
              <thead className="text-left text-muted"><tr><th className="py-1 font-medium">Etapa</th><th className="py-1 text-right font-medium">Oportunidades</th><th className="py-1 text-right font-medium">Valor</th></tr></thead>
              <tbody>{data.funnel.map((f) => <tr key={f.stage_id} className="border-t border-border"><td className="py-2">{f.stage_name}</td><td className="py-2 text-right tabular-nums">{f.opp_count}</td><td className="py-2 text-right tabular-nums">{formatBRL(f.opp_value)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Leads por origem" description="Leads criados no período.">
            <div className="mb-3"><Link className={exportLink} href={`/export/lead-sources?${q}`} prefetch={false}>Exportar CSV</Link></div>
            {data.sources.length === 0 ? <EmptyState title="Sem leads no período" /> : (
              <table className="w-full text-sm"><caption className="sr-only">Leads por origem</caption>
                <thead className="text-left text-muted"><tr><th className="py-1 font-medium">Origem</th><th className="py-1 text-right font-medium">Leads</th></tr></thead>
                <tbody>{data.sources.map((s) => <tr key={s.source_id ?? 'none'} className="border-t border-border"><td className="py-2">{s.source_name}</td><td className="py-2 text-right tabular-nums">{s.lead_count}</td></tr>)}</tbody></table>
            )}
          </Card>
        </div>

        <Card title="Perdas por motivo" description="Negócios perdidos no período, por motivo informado.">
          <div className="mb-3"><Link className={exportLink} href={`/export/lost-reasons?${q}`} prefetch={false}>Exportar CSV</Link></div>
          {lost.length === 0 ? <EmptyState title="Nenhuma perda no período" /> : (
            <table className="w-full text-sm"><caption className="sr-only">Perdas por motivo</caption>
              <thead className="text-left text-muted"><tr><th className="py-1 font-medium">Motivo</th><th className="py-1 text-right font-medium">Negócios</th><th className="py-1 text-right font-medium">Valor perdido</th></tr></thead>
              <tbody>{lost.map((r) => <tr key={r.reason} className="border-t border-border"><td className="py-2">{r.reason}</td><td className="py-2 text-right tabular-nums">{r.count}</td><td className="py-2 text-right tabular-nums">{formatBRL(r.value)}</td></tr>)}</tbody></table>
          )}
        </Card>

        <Card title="Listas completas">
          <div className="flex flex-wrap gap-2">
            <Link className={exportLink} href="/export/leads" prefetch={false}>Todos os leads (CSV)</Link>
            <Link className={exportLink} href="/export/opportunities" prefetch={false}>Todas as oportunidades (CSV)</Link>
          </div>
          <p className="mt-3 text-xs text-muted">As exportações respeitam o seu papel: vendedores exportam apenas o que enxergam.</p>
        </Card>
      </div>
    </>
  );
}
