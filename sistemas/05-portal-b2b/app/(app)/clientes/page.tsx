import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/app/list-bits';
import { ClientsTable } from '@/components/portal/tables';
import { requireContext } from '@/lib/auth/session';
import { isManager, one, pick, type SearchParams } from '@/lib/portal/access';
import { labelMap, listClients, loadPeople, parsePage, searchToken } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Clientes' };

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const q = searchToken(sp.q);
  const status = pick(one(sp.status), ['active', 'inactive'] as const);
  const page = parsePage(sp.page);
  const [{ rows, total, error }, people] = await Promise.all([listClients(ctx, org, { q, status, page }), loadPeople(ctx, org)]);
  const manager = isManager(ctx.membership.role);
  return (
    <>
      <PageHeader title="Clientes" description={manager ? 'Todas as empresas clientes da prestadora.' : 'As empresas em que você é gestor ou tem solicitações.'}>
        {manager ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/clientes/novo">Nova empresa</Link> : null}
      </PageHeader>
      <ListFilters action="/clientes" q={q} placeholder="Nome da empresa" selects={[{ name: 'status', label: 'Situação', value: status, all: 'Todas', options: [{ value: 'active', label: 'Ativas' }, { value: 'inactive', label: 'Inativas' }] }]} />
      {error ? <p role="alert" className="mb-3 text-sm text-danger">Não foi possível carregar a lista agora.</p> : null}
      <ClientsTable rows={rows} managers={Object.fromEntries(labelMap(people))} empty={<EmptyState title="Nenhuma empresa encontrada" description={q || status ? 'Ajuste os filtros.' : manager ? 'Cadastre a primeira empresa cliente para abrir solicitações e convidar usuários.' : 'Você ainda não está vinculado a nenhuma empresa.'} />} />
      <Pagination basePath="/clientes" page={page} total={total} params={{ q, status }} />
    </>
  );
}
