import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { DashboardView } from '@/components/portal/dashboard-view';
import { FilterBar } from '@/components/portal/filter-bar';
import { DeliverableBadge, StatusBadge } from '@/components/portal/badges';
import { requirePortalContext } from '@/lib/auth/session';
import type { SearchParams } from '@/lib/portal/access';
import { loadDashboard } from '@/lib/portal/dashboard';
import { listAnnouncements, listDeliverables, listRequests, loadCategories, loadSettings } from '@/lib/portal/data';
import { parseFilters, todayIn } from '@/lib/portal/filters';
import { formatDateTime, requestCode } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Início' };

export default async function PortalHome({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePortalContext();
  const { account } = ctx;
  const org = account.organization_id;
  const sp = await searchParams;
  const settings = await loadSettings(ctx, org);
  const filters = { ...parseFilters(sp, todayIn(settings.timezone)), client: account.client_account_id, assignee: null };
  const [data, categories, ann, awaiting, toAck] = await Promise.all([
    loadDashboard(ctx.supabase, org, filters), loadCategories(ctx, org),
    listAnnouncements(ctx, org, { page: 1, includeArchived: false }),
    listRequests(ctx, org, { q: '', status: 'waiting_client', priority: '', client: account.client_account_id, assignee: '', category: '', view: '', page: 1 }),
    listDeliverables(ctx, org, { client: account.client_account_id, status: 'published', page: 1 }),
  ]);
  return (
    <>
      <PageHeader title={`Olá! Esta é a área da ${account.name}`} description={settings.welcome_message ?? 'Acompanhe suas solicitações, receba entregas e acesse seus documentos.'}>
        <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/portal/solicitacoes/nova">Nova solicitação</Link>
      </PageHeader>

      {awaiting.rows.length > 0 ? (
        <section aria-label="Precisa da sua atenção" className="mb-6">
          <Card title="Precisamos de você" description="A equipe aguarda uma resposta sua nestas solicitações.">
            <ul className="divide-y divide-border">
              {awaiting.rows.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><Link className="font-medium underline-offset-2 hover:underline" href={`/portal/solicitacoes/${r.id}`}>{requestCode(r.number)} · {r.title}</Link><StatusBadge status={r.status} client /></li>)}
            </ul>
          </Card>
        </section>
      ) : null}
      {toAck.rows.length > 0 ? (
        <section aria-label="Entregas novas" className="mb-6">
          <Card title="Entregas aguardando sua confirmação" description="Confirme o recebimento depois de conferir.">
            <ul className="divide-y divide-border">
              {toAck.rows.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><Link className="font-medium underline-offset-2 hover:underline" href={`/portal/entregas/${d.id}`}>{d.title}</Link><span className="flex items-center gap-2 text-xs text-muted"><DeliverableBadge status={d.status} />{formatDateTime(d.delivered_at, settings.timezone)}</span></li>)}
            </ul>
          </Card>
        </section>
      ) : null}
      {ann.rows.length > 0 ? (
        <section aria-label="Comunicados" className="mb-6">
          <Card title="Comunicados" description="Avisos da equipe para você.">
            <ul className="space-y-3">
              {ann.rows.slice(0, 3).map((a) => <li key={a.id} className="rounded-md border border-border p-3 text-sm"><p className="font-medium">{a.title}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted">{a.body}</p></li>)}
            </ul>
            <p className="mt-3 text-sm"><Link className="underline" href="/portal/comunicados">Ver todos</Link></p>
          </Card>
        </section>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">Seus números</h2>
      <FilterBar action="/portal" filters={filters} categories={categories.map((c) => ({ value: c.id, label: c.name }))} client />
      {data.error || !data.kpis ? <Alert tone="error">Não foi possível carregar os indicadores agora. Tente novamente em instantes.</Alert> : <DashboardView data={data} labels={new Map()} client />}
    </>
  );
}
