import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters } from '@/components/crm/list-bits';
import { KanbanBoardClient } from '@/components/crm/kanban-loader';
import { requireContext } from '@/lib/auth/session';
import { companyOptions, labelMap, loadOptions, nameMap, pipelineOpportunities } from '@/lib/crm/data';
import { canWriteCrm, isManager, one, personOptions, type SearchParams } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Pipeline' };

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const owner = z.uuid().safeParse(one(sp.owner)).success ? one(sp.owner) : null;
  const [options, companies, opps] = await Promise.all([loadOptions(ctx), companyOptions(ctx), pipelineOpportunities(ctx, { owner })]);
  const stages = options.stages.filter((s) => s.is_active || opps.some((o) => o.stage_id === s.id));
  const owners = labelMap(options.people);
  const companyNames = nameMap(companies.map((c) => ({ id: c.id, name: c.name })));
  const write = canWriteCrm(ctx.membership.role);
  const manager = isManager(ctx.membership.role);

  // Ganhas e perdidas: só as mais recentes, para o quadro não crescer indefinidamente.
  const closedKept = new Set<string>();
  for (const kind of ['won', 'lost'] as const) {
    const ids = new Set(stages.filter((s) => s.kind === kind).map((s) => s.id));
    opps.filter((o) => ids.has(o.stage_id)).slice(0, 20).forEach((o) => closedKept.add(o.id));
  }
  const visible = opps.filter((o) => {
    const kind = stages.find((s) => s.id === o.stage_id)?.kind;
    return kind === 'open' || closedKept.has(o.id);
  });

  return (
    <>
      <PageHeader title="Pipeline" description="Arraste as oportunidades entre as etapas, ou use o seletor “Mover para…” de cada cartão. Em Ganho e Perdido aparecem as 20 mais recentes.">
        {write ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/opportunities/new">Nova oportunidade</Link> : null}
      </PageHeader>
      {manager ? <ListFilters action="/pipeline" q="" search={false} selects={[{ name: 'owner', label: 'Responsável', value: owner ?? '', all: 'Todos', options: personOptions(options.people) }]} /> : null}
      {stages.length === 0 ? <EmptyState title="Funil sem etapas" description="Peça a um administrador para configurar as etapas em Configurações do CRM." /> : (
        <KanbanBoardClient
          stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, probability: s.probability }))}
          opportunities={visible.map((o) => ({
            id: o.id, title: o.title, value: o.value, stage_id: o.stage_id, owner_label: o.owner_id ? owners.get(o.owner_id) ?? null : null,
            company_name: o.company_id ? companyNames.get(o.company_id) ?? null : null, expected_close_date: o.expected_close_date,
            can_move: write && (manager || o.owner_id === ctx.user.id),
          }))}
          reasons={options.reasons.filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }))}
        />
      )}
    </>
  );
}
