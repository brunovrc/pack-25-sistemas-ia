import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { FilterBar } from '@/components/portal/filter-bar';
import { requireContext } from '@/lib/auth/session';
import { MANAGER_ROLES, type SearchParams } from '@/lib/portal/access';
import { labelMap, loadCategories, loadClientOptions, loadPeople, loadSettings, personOptions } from '@/lib/portal/data';
import { filtersToQuery, parseFilters, todayIn } from '@/lib/portal/filters';
import { formatDate } from '@/lib/portal/format';
import { buildReport, REPORT_KEYS, REPORT_TITLES } from '@/lib/portal/reports';

export const metadata: Metadata = { title: 'Relatórios' };
const PREVIEW_ROWS = 8;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext(MANAGER_ROLES);
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const settings = await loadSettings(ctx, org);
  const f = parseFilters(sp, todayIn(settings.timezone));
  const [people, clients, categories] = await Promise.all([loadPeople(ctx, org), loadClientOptions(ctx, org, true), loadCategories(ctx, org, false)]);
  const cmap = new Map(clients.map((c) => [c.id, c.name]));
  const catmap = new Map(categories.map((c) => [c.id, c.name]));
  const reports = await Promise.all(REPORT_KEYS.map(async (k) => [k, await buildReport(k, ctx.supabase, org, f, settings.timezone, labelMap(people), cmap, catmap)] as const));
  const query = filtersToQuery(f);
  return (
    <>
      <PageHeader title="Relatórios" description={`Período: ${formatDate(f.from)} a ${formatDate(f.to)}. Cada exportação em CSV fica registrada na auditoria (quem, qual relatório, quantas linhas).`} />
      <FilterBar action="/relatorios" filters={f} clients={clients.map((c) => ({ value: c.id, label: c.name }))} assignees={personOptions(people, ['staff'])} categories={categories.map((c) => ({ value: c.id, label: c.name }))} />
      <div className="grid gap-6">
        {reports.map(([k, r]) => (
          <Card key={k} title={REPORT_TITLES[k].title} description={`${REPORT_TITLES[k].description} ${r.rows.length.toLocaleString('pt-BR')} linha(s).`}>
            <div className="mb-3"><a className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href={`/export/${k}?${query}`} download>Baixar CSV</a></div>
            {r.rows.length === 0 ? <p className="text-sm text-muted">Sem dados no período.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-xs"><caption className="sr-only">{REPORT_TITLES[k].title} (prévia)</caption>
                  <thead className="text-muted"><tr>{r.headers.map((h) => <th key={h} scope="col" className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{r.rows.slice(0, PREVIEW_ROWS).map((row, i) => <tr key={i} className="border-t border-border">{row.map((c, j) => <td key={j} className="px-2 py-1 align-top">{c !== null && typeof c === 'object' ? String(c.int) : typeof c === 'number' ? c.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : (c ?? '')}</td>)}</tr>)}</tbody>
                </table>
                {r.rows.length > PREVIEW_ROWS ? <p className="mt-1 text-xs text-muted">Mostrando {PREVIEW_ROWS} de {r.rows.length}. O CSV traz todas.</p> : null}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
