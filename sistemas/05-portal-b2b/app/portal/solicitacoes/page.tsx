import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/app/list-bits';
import { RequestsTable } from '@/components/portal/tables';
import { requirePortalContext } from '@/lib/auth/session';
import { one, pick, type SearchParams } from '@/lib/portal/access';
import { listRequests, loadSettings, parsePage, searchToken } from '@/lib/portal/data';
import { CLIENT_STATUS_LABELS, REQUEST_STATUSES } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Solicitações' };

export default async function PortalRequests({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePortalContext();
  const { account } = ctx;
  const sp = await searchParams;
  const f = { q: searchToken(sp.q), status: pick(one(sp.status), REQUEST_STATUSES), page: parsePage(sp.page) };
  const settings = await loadSettings(ctx, account.organization_id);
  const now = nowMs();
  const { rows, total, error } = await listRequests(ctx, account.organization_id, { ...f, priority: '', client: account.client_account_id, assignee: '', category: '', view: '' });
  return (
    <>
      <PageHeader title="Solicitações" description="Tudo o que você pediu à equipe, com situação e prazo.">
        <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/portal/solicitacoes/nova">Nova solicitação</Link>
      </PageHeader>
      <ListFilters action="/portal/solicitacoes" q={f.q} placeholder="Título ou número (SOL-0012)" selects={[{ name: 'status', label: 'Situação', value: f.status, all: 'Todas', options: REQUEST_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABELS[s] })) }]} />
      {error ? <p role="alert" className="mb-3 text-sm text-danger">Não foi possível carregar a lista agora.</p> : null}
      <RequestsTable rows={rows} base="/portal" names={{}} clients={{}} timezone={settings.timezone} now={now} soonHours={settings.alert_due_soon_hours} client empty={<EmptyState title="Nenhuma solicitação" description={f.q || f.status ? 'Ajuste os filtros.' : 'Abra a primeira solicitação para a equipe.'} />} />
      <Pagination basePath="/portal/solicitacoes" page={f.page} total={total} params={{ q: f.q, status: f.status }} />
    </>
  );
}
