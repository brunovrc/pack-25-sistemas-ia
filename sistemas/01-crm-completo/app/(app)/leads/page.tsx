import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/crm/list-bits';
import { LeadsTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { labelMap, listLeads, loadOptions, nameMap, parsePage, searchToken } from '@/lib/crm/data';
import { activeOptions, canWriteCrm, isManager, one, personOptions, type SearchParams } from '@/lib/crm/access';
import { LEAD_STATUS_LABELS } from '@/lib/crm/validation';
import { z } from 'zod';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = searchToken(sp.q);
  const status = Object.keys(LEAD_STATUS_LABELS).includes(one(sp.status)) ? one(sp.status) : '';
  const source = z.uuid().safeParse(one(sp.source)).success ? one(sp.source) : null;
  const owner = z.uuid().safeParse(one(sp.owner)).success ? one(sp.owner) : null;
  const archived = one(sp.view) === 'archived';
  const page = parsePage(sp.page);

  const [options, { rows, total }] = await Promise.all([loadOptions(ctx), listLeads(ctx, { q, status, owner, source, archived, page })]);
  const params = { q, status, source: source ?? '', owner: owner ?? '', view: archived ? 'archived' : '' };
  const exportQuery = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const write = canWriteCrm(ctx.membership.role);

  return (
    <>
      <PageHeader title="Leads" description="Contatos em qualificação. Converta um lead em oportunidade quando houver interesse real.">
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href={`/export/leads${exportQuery ? `?${exportQuery}` : ''}`} prefetch={false}>Exportar CSV</Link>
          {write ? <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/leads/import">Importar CSV</Link> : null}
          {write ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/leads/new">Novo lead</Link> : null}
        </div>
      </PageHeader>
      <ListFilters
        action="/leads"
        q={q}
        placeholder="Nome, e-mail ou empresa"
        selects={[
          { name: 'status', label: 'Status', value: status, all: 'Todos', options: Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
          { name: 'source', label: 'Origem', value: source ?? '', all: 'Todas', options: activeOptions(options.sources) },
          ...(isManager(ctx.membership.role) ? [{ name: 'owner', label: 'Responsável', value: owner ?? '', all: 'Todos', options: personOptions(options.people) }] : []),
          { name: 'view', label: 'Exibir', value: archived ? 'archived' : '', all: 'Ativos', options: [{ value: 'archived', label: 'Arquivados' }] },
        ]}
      />
      <LeadsTable
        rows={rows}
        sources={Object.fromEntries(nameMap(options.sources))}
        owners={Object.fromEntries(labelMap(options.people))}
        empty={<EmptyState title={q || status || source || owner ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'} description={q || status ? 'Ajuste os filtros.' : 'Crie o primeiro lead ou importe uma planilha CSV.'}>{write ? <Link className="underline" href="/leads/new">Criar lead</Link> : null}</EmptyState>}
      />
      <Pagination basePath="/leads" page={page} total={total} params={params} />
    </>
  );
}
