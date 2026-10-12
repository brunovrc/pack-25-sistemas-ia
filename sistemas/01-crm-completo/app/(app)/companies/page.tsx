import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/crm/list-bits';
import { CompaniesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { labelMap, listCompanies, loadOptions, parsePage, searchToken } from '@/lib/crm/data';
import { canWriteCrm, one, type SearchParams } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Empresas' };

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = searchToken(sp.q);
  const archived = one(sp.view) === 'archived';
  const page = parsePage(sp.page);
  const [options, { rows, total }] = await Promise.all([loadOptions(ctx), listCompanies(ctx, { q, archived, page })]);
  const write = canWriteCrm(ctx.membership.role);
  return (
    <>
      <PageHeader title="Empresas" description="Cadastro das empresas atendidas. Contatos e oportunidades se ligam a elas.">
        {write ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/companies/new">Nova empresa</Link> : null}
      </PageHeader>
      <ListFilters action="/companies" q={q} placeholder="Nome ou segmento" selects={[{ name: 'view', label: 'Exibir', value: archived ? 'archived' : '', all: 'Ativas', options: [{ value: 'archived', label: 'Arquivadas' }] }]} />
      <CompaniesTable rows={rows} owners={Object.fromEntries(labelMap(options.people))} empty={<EmptyState title={q ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa ainda'} description={q ? 'Ajuste a busca.' : 'Cadastre a primeira empresa.'}>{write ? <Link className="underline" href="/companies/new">Criar empresa</Link> : null}</EmptyState>} />
      <Pagination basePath="/companies" page={page} total={total} params={{ q, view: archived ? 'archived' : '' }} />
    </>
  );
}
