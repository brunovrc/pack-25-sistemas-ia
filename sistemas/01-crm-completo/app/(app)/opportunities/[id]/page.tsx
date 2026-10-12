import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ActivityForm, MoveStageForm, OpportunityForm } from '@/components/crm/forms';
import { DeleteRecordButton } from '@/components/crm/row-actions';
import { ActivitiesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { activitiesFor, companyOptions, contactOptions, getById, labelMap, loadOptions, nameMap, stageHistory, type Opportunity } from '@/lib/crm/data';
import { activeOptions, canWriteCrm, isManager, personOptions } from '@/lib/crm/access';
import { formatBRL, formatDate, formatDateTimeBR } from '@/lib/crm/format';
import { nowIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Oportunidade' };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const found = await getById<Opportunity>(ctx, 'crm_opportunities', id);
  if (!found) notFound();
  const opp = { ...found, value: Number(found.value) };

  const [options, companies, contacts, activities, history] = await Promise.all([loadOptions(ctx), companyOptions(ctx), contactOptions(ctx), activitiesFor(ctx, 'opportunity_id', id), stageHistory(ctx, id)]);
  const write = canWriteCrm(ctx.membership.role);
  const manager = isManager(ctx.membership.role);
  const canEdit = write && (manager || opp.owner_id === ctx.user.id);
  const owners = labelMap(options.people);
  const stages = nameMap(options.stages);
  const activeStages = options.stages.filter((s) => s.is_active || s.id === opp.stage_id).map((s) => ({ value: s.id, label: s.name }));
  const lostStageIds = options.stages.filter((s) => s.kind === 'lost').map((s) => s.id);
  const reasons = options.reasons.filter((r) => r.is_active || r.id === opp.loss_reason_id).map((r) => ({ value: r.id, label: r.name }));
  const tone = opp.status === 'won' ? 'success' : opp.status === 'lost' ? 'danger' : 'neutral';
  const label = opp.status === 'won' ? 'Ganha' : opp.status === 'lost' ? 'Perdida' : 'Aberta';

  return (
    <>
      <PageHeader title={opp.title} description={`${formatBRL(opp.value)} · ${stages.get(opp.stage_id) ?? '—'}`}>
        <Badge tone={tone}>{label}</Badge>
      </PageHeader>
      <p className="mb-4 text-sm"><Link className="underline" href="/opportunities">← Voltar às oportunidades</Link> · <Link className="underline" href="/pipeline">Pipeline</Link></p>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Dados da oportunidade">
            {canEdit ? (
              <OpportunityForm
                opportunity={opp}
                stages={activeStages}
                companies={companies.map((c) => ({ value: c.id, label: c.name }))}
                contacts={contacts.map((c) => ({ value: c.id, label: c.name }))}
                sources={activeOptions(options.sources)}
                people={personOptions(options.people)}
                canPickOwner={manager}
                defaultOwner={ctx.user.id}
              />
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Valor</dt><dd>{formatBRL(opp.value)}</dd></div>
                <div><dt className="text-muted">Previsão de fechamento</dt><dd>{formatDate(opp.expected_close_date)}</dd></div>
                <div><dt className="text-muted">Responsável</dt><dd>{opp.owner_id ? owners.get(opp.owner_id) ?? '—' : '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted">Observações</dt><dd className="whitespace-pre-wrap">{opp.notes ?? '—'}</dd></div>
              </dl>
            )}
          </Card>
          <Card title="Atividades">
            <ActivitiesTable rows={activities} owners={Object.fromEntries(owners)} canWrite={write} nowIso={nowIso()} empty={<EmptyState title="Sem atividades" description="Registre follow-ups para não deixar o negócio esfriar." />} />
            {write ? <div className="mt-4 border-t border-border pt-4"><h3 className="mb-3 text-sm font-semibold">Nova atividade</h3><ActivityForm people={personOptions(options.people)} canPickOwner={manager} defaultOwner={opp.owner_id ?? ctx.user.id} links={{ opportunity_id: id }} /></div> : null}
          </Card>
        </div>

        <div className="space-y-6">
          {canEdit ? (
            <Card title="Mover de etapa" description="Ganho e Perdido encerram a oportunidade. Perdida exige o motivo.">
              <MoveStageForm key={opp.stage_id} opportunityId={id} currentStageId={opp.stage_id} stages={activeStages} reasons={reasons} lostStageIds={lostStageIds} />
            </Card>
          ) : null}
          {opp.status !== 'open' ? (
            <Card title="Encerramento">
              <p className="text-sm">{opp.status === 'won' ? 'Ganha' : 'Perdida'} em {formatDateTimeBR(opp.closed_at)}.</p>
              {opp.status === 'lost' ? <p className="mt-1 text-sm text-muted">Motivo: {opp.loss_reason_id ? nameMap(options.reasons).get(opp.loss_reason_id) ?? '—' : '—'}{opp.loss_notes ? ` — ${opp.loss_notes}` : ''}</p> : null}
            </Card>
          ) : null}
          <Card title="Histórico de etapas">
            {history.length === 0 ? <p className="text-sm text-muted">Sem movimentações.</p> : (
              <ol className="space-y-2 border-l border-border pl-4 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <p className="font-medium">{h.from_stage_id ? `${stages.get(h.from_stage_id) ?? '—'} → ${stages.get(h.to_stage_id) ?? '—'}` : `Criada em ${stages.get(h.to_stage_id) ?? '—'}`}</p>
                    <p className="text-xs text-muted">{formatDateTimeBR(h.changed_at)}{h.changed_by ? ` · ${owners.get(h.changed_by) ?? 'Usuário'}` : ''}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {manager ? <Card title="Ações"><DeleteRecordButton table="crm_opportunities" id={id} backTo="/opportunities" /></Card> : null}
        </div>
      </div>
    </>
  );
}
