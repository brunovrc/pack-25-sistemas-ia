import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { DashboardView } from '@/components/portal/dashboard-view';
import { FilterBar } from '@/components/portal/filter-bar';
import { requireContext } from '@/lib/auth/session';
import { runRefresh } from '@/lib/portal/actions';
import { isManager, type SearchParams } from '@/lib/portal/access';
import { loadDashboard } from '@/lib/portal/dashboard';
import { labelMap, loadCategories, loadClientOptions, loadPeople, loadSettings, personOptions } from '@/lib/portal/data';
import { filtersToQuery, parseFilters, todayIn } from '@/lib/portal/filters';
import { formatDate } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Painel' };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  // Avisos de prazo e comunicados agendados: rotina idempotente, disparada ao abrir o painel (ver docs/WORKFLOWS.md).
  await runRefresh();
  const settings = await loadSettings(ctx, org);
  const filters = parseFilters(sp, todayIn(settings.timezone));
  const [people, categories, clients, data] = await Promise.all([loadPeople(ctx, org), loadCategories(ctx, org), loadClientOptions(ctx, org, true), loadDashboard(ctx.supabase, org, filters)]);
  const query = filtersToQuery(filters);

  if (data.error || !data.kpis) {
    return (
      <>
        <PageHeader title="Painel" />
        <Alert tone="error">Não foi possível carregar os indicadores agora. Tente novamente em instantes.</Alert>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Painel" description={`Período: ${formatDate(filters.from)} a ${formatDate(filters.to)} (fuso ${settings.timezone}). Números calculados do banco de dados; fórmulas em docs/METRICS.md.`}>
        {isManager(ctx.membership.role) ? <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href={`/relatorios?${query}`}>Relatórios</Link> : null}
      </PageHeader>
      <FilterBar
        action="/dashboard" filters={filters} clients={clients.map((c) => ({ value: c.id, label: c.name }))} assignees={personOptions(people, ['staff'])}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
      />
      {ctx.membership.role === 'member' ? <div className="mb-4"><Alert tone="info">Você vê as empresas em que é gestor ou tem solicitações. Gestores e administradores veem todas.</Alert></div> : null}
      <DashboardView data={data} labels={labelMap(people)} />
    </>
  );
}
