import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/crm/list-bits';
import { OpportunitiesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { companyOptions, labelMap, listOpportunities, loadOptions, nameMap, parsePage, searchToken } from '@/lib/crm/data';
import { canWriteCrm, isManager, one, personOptions, type SearchParams } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Oportunidades' };

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = searchToken(sp.q);
  const status = ['open', 'won', 'lost'].includes(one(sp.status)) ? one(sp.status) : '';
  const owner = z.uuid().safeParse(one(sp.owner)).success ? one(sp.owner) : null;
  const stage = z.uuid().safeParse(one(sp.stage)).success ? one(sp.stage) : null;
  const page = parsePage(sp.page);
  const [options, companies, { rows, total }] = await Promise.all([loadOptions(ctx), companyOptions(ctx), listOpportunities(ctx, { q, status, owner, stage, page })]);
  const write = canWriteCrm(ctx.membership.role);
  return (
    <>
      <PageHeader title="Oportunidades" description="Negócios em andamento, ganhos e perdidos. Para mover entre etapas visualmente, use o Pipeline.">
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/pipeline">Ver pipeline</Link>
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/export/opportunities" prefetch={false}>Exportar CSV</Link>
          {write ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/opportunities/new">Nova oportunidade</Link> : null}
        </div>
      </PageHeader>
      <ListFilters
        action="/opportunities"
        q={q}
        placeholder="Título"
        selects={[
          { name: 'status', label: 'Status', value: status, all: 'Todas', options: [{ value: 'open', label: 'Abertas' }, { value: 'won', label: 'Ganhas' }, { value: 'lost', label: 'Perdidas' }] },
          { name: 'stage', label: 'Etapa', value: stage ?? '', all: 'Todas', options: options.stages.map((s) => ({ value: s.id, label: s.name })) },
          ...(isManager(ctx.membership.role) ? [{ name: 'owner', label: 'Responsável', value: owner ?? '', all: 'Todos', options: personOptions(options.people) }] : []),
        ]}
      />
      <OpportunitiesTable rows={rows} stages={Object.fromEntries(nameMap(options.stages))} owners={Object.fromEntries(labelMap(options.people))} companies={Object.fromEntries(companies.map((c) => [c.id, c.name]))} empty={<EmptyState title={q || status || stage ? 'Nenhuma oportunidade encontrada' : 'Nenhuma oportunidade ainda'} description="Converta um lead ou crie uma oportunidade diretamente.">{write ? <Link className="underline" href="/opportunities/new">Criar oportunidade</Link> : null}</EmptyState>} />
      <Pagination basePath="/opportunities" page={page} total={total} params={{ q, status, stage: stage ?? '', owner: owner ?? '' }} />
    </>
  );
}
