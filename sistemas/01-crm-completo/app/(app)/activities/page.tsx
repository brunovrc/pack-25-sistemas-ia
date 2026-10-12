import type { Metadata } from 'next';
import { z } from 'zod';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ActivityForm } from '@/components/crm/forms';
import { ListFilters, Pagination } from '@/components/crm/list-bits';
import { ActivitiesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { labelMap, listActivities, loadOptions, parsePage } from '@/lib/crm/data';
import { canWriteCrm, isManager, one, personOptions, type SearchParams } from '@/lib/crm/access';
import { ACTIVITY_KIND_LABELS } from '@/lib/crm/validation';
import { nowIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Atividades' };

const STATES = { pending: 'Pendentes', overdue: 'Atrasadas', done: 'Concluídas' } as const;

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const state = Object.keys(STATES).includes(one(sp.state)) ? one(sp.state) : 'pending';
  const kind = Object.keys(ACTIVITY_KIND_LABELS).includes(one(sp.kind)) ? one(sp.kind) : '';
  const owner = z.uuid().safeParse(one(sp.owner)).success ? one(sp.owner) : null;
  const page = parsePage(sp.page);
  const [options, { rows, total }] = await Promise.all([loadOptions(ctx), listActivities(ctx, { state, owner, kind, page })]);
  const write = canWriteCrm(ctx.membership.role);
  const manager = isManager(ctx.membership.role);

  return (
    <>
      <PageHeader title="Atividades" description="Tarefas, ligações, reuniões e follow-ups. As atrasadas aparecem destacadas e também no painel." />
      {write ? (
        <details className="mb-6 rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer font-medium">Nova atividade</summary>
          <div className="mt-4"><ActivityForm people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} /></div>
        </details>
      ) : null}
      <ListFilters
        action="/activities"
        q=""
        search={false}
        selects={[
          { name: 'state', label: 'Situação', value: state, all: 'Pendentes', options: Object.entries(STATES).filter(([k]) => k !== 'pending').map(([value, label]) => ({ value, label })) },
          { name: 'kind', label: 'Tipo', value: kind, all: 'Todos', options: Object.entries(ACTIVITY_KIND_LABELS).map(([value, label]) => ({ value, label })) },
          ...(manager ? [{ name: 'owner', label: 'Responsável', value: owner ?? '', all: 'Todos', options: personOptions(options.people) }] : []),
        ]}
      />
      <Card className="p-0">
        <ActivitiesTable rows={rows} owners={Object.fromEntries(labelMap(options.people))} canWrite={write} nowIso={nowIso()} empty={<EmptyState title={state === 'done' ? 'Nenhuma atividade concluída' : state === 'overdue' ? 'Nenhuma atividade atrasada' : 'Nenhuma atividade pendente'} description="Crie atividades a partir de um lead, contato, empresa ou oportunidade, ou aqui." />} />
      </Card>
      <Pagination basePath="/activities" page={page} total={total} params={{ state: state === 'pending' ? '' : state, kind, owner: owner ?? '' }} />
    </>
  );
}
