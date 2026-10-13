import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/app/list-bits';
import { DeliverablesTable } from '@/components/portal/tables';
import { requireContext } from '@/lib/auth/session';
import { canWrite, one, pick, uuidOrEmpty, type SearchParams } from '@/lib/portal/access';
import { listDeliverables, loadClientOptions, loadSettings, parsePage } from '@/lib/portal/data';
import { DELIVERABLE_LABELS, DELIVERABLE_STATUSES } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Entregas' };

export default async function DeliverablesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const f = { client: uuidOrEmpty(one(sp.client)), status: pick(one(sp.status), DELIVERABLE_STATUSES), page: parsePage(sp.page) };
  const [{ rows, total, error }, clients, settings] = await Promise.all([listDeliverables(ctx, org, f), loadClientOptions(ctx, org, true), loadSettings(ctx, org)]);
  return (
    <>
      <PageHeader title="Entregas" description="Resultados prontos para o cliente. Uma entrega nasce como rascunho, é publicada (o cliente é avisado) e o cliente confirma o recebimento.">
        {canWrite(ctx.membership.role) ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/entregas/nova">Nova entrega</Link> : null}
      </PageHeader>
      <ListFilters action="/entregas" q="" search={false} selects={[
        { name: 'client', label: 'Empresa', value: f.client, all: 'Todas', options: clients.map((c) => ({ value: c.id, label: c.name })) },
        { name: 'status', label: 'Situação', value: f.status, all: 'Todas', options: DELIVERABLE_STATUSES.map((s) => ({ value: s, label: DELIVERABLE_LABELS[s] })) },
      ]} />
      {error ? <p role="alert" className="mb-3 text-sm text-danger">Não foi possível carregar a lista agora.</p> : null}
      <DeliverablesTable rows={rows} base="" clients={Object.fromEntries(clients.map((c) => [c.id, c.name]))} timezone={settings.timezone} showClient empty={<EmptyState title="Nenhuma entrega" description="Crie uma entrega, vincule os arquivos e publique para o cliente." />} />
      <Pagination basePath="/entregas" page={f.page} total={total} params={{ client: f.client, status: f.status }} />
    </>
  );
}
