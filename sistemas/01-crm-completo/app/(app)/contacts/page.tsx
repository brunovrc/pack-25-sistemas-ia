import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/crm/list-bits';
import { ContactsTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { companyOptions, labelMap, listContacts, loadOptions, parsePage, searchToken } from '@/lib/crm/data';
import { canWriteCrm, one, type SearchParams } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Contatos' };

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = searchToken(sp.q);
  const archived = one(sp.view) === 'archived';
  const page = parsePage(sp.page);
  const [options, companies, { rows, total }] = await Promise.all([loadOptions(ctx), companyOptions(ctx), listContacts(ctx, { q, company: null, archived, page })]);
  const write = canWriteCrm(ctx.membership.role);
  return (
    <>
      <PageHeader title="Contatos" description="Pessoas das empresas atendidas.">
        {write ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/contacts/new">Novo contato</Link> : null}
      </PageHeader>
      <ListFilters action="/contacts" q={q} placeholder="Nome ou e-mail" selects={[{ name: 'view', label: 'Exibir', value: archived ? 'archived' : '', all: 'Ativos', options: [{ value: 'archived', label: 'Arquivados' }] }]} />
      <ContactsTable rows={rows} companies={Object.fromEntries(companies.map((c) => [c.id, c.name]))} owners={Object.fromEntries(labelMap(options.people))} empty={<EmptyState title={q ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'} description={q ? 'Ajuste a busca.' : 'Cadastre o primeiro contato.'}>{write ? <Link className="underline" href="/contacts/new">Criar contato</Link> : null}</EmptyState>} />
      <Pagination basePath="/contacts" page={page} total={total} params={{ q, view: archived ? 'archived' : '' }} />
    </>
  );
}
