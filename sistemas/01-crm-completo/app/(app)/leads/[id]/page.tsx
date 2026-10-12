import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ActivityForm, ConvertLeadForm, LeadForm } from '@/components/crm/forms';
import { ArchiveButton, DeleteRecordButton } from '@/components/crm/row-actions';
import { ActivitiesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { activitiesFor, companyOptions, getById, labelMap, loadOptions, nameMap, type Lead } from '@/lib/crm/data';
import { activeOptions, canWriteCrm, isManager, personOptions } from '@/lib/crm/access';
import { formatDateTimeBR } from '@/lib/crm/format';
import { LEAD_STATUS_LABELS, TEMPERATURE_LABELS } from '@/lib/crm/validation';
import { nowIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const lead = await getById<Lead>(ctx, 'crm_leads', id);
  if (!lead) notFound();

  const [options, companies, activities] = await Promise.all([loadOptions(ctx), companyOptions(ctx), activitiesFor(ctx, 'lead_id', id)]);
  const write = canWriteCrm(ctx.membership.role);
  const manager = isManager(ctx.membership.role);
  const canEdit = write && (manager || lead.owner_id === ctx.user.id);
  const owners = labelMap(options.people);
  const convertible = canEdit && lead.status !== 'converted' && !lead.archived_at;
  const openStages = options.stages.filter((s) => s.kind === 'open' && s.is_active).map((s) => ({ value: s.id, label: s.name }));

  return (
    <>
      <PageHeader title={lead.name} description={[lead.company_name, lead.job_title].filter(Boolean).join(' · ') || undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={lead.status === 'converted' ? 'success' : 'neutral'}>{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</Badge>
          <Badge tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'neutral'}>{TEMPERATURE_LABELS[lead.temperature] ?? lead.temperature}</Badge>
          {lead.archived_at ? <Badge tone="warning">Arquivado</Badge> : null}
        </div>
      </PageHeader>
      <p className="mb-4 text-sm"><Link className="underline" href="/leads">← Voltar aos leads</Link></p>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Dados do lead">
            {canEdit ? (
              <LeadForm lead={lead} sources={activeOptions(options.sources)} people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} />
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">E-mail</dt><dd>{lead.email ?? '—'}</dd></div>
                <div><dt className="text-muted">Telefone</dt><dd>{lead.phone ?? '—'}</dd></div>
                <div><dt className="text-muted">Origem</dt><dd>{lead.source_id ? nameMap(options.sources).get(lead.source_id) ?? '—' : '—'}</dd></div>
                <div><dt className="text-muted">Responsável</dt><dd>{lead.owner_id ? owners.get(lead.owner_id) ?? '—' : 'Sem responsável'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted">Observações</dt><dd className="whitespace-pre-wrap">{lead.notes ?? '—'}</dd></div>
              </dl>
            )}
          </Card>
          <Card title="Atividades deste lead">
            <ActivitiesTable rows={activities} owners={Object.fromEntries(owners)} canWrite={write} nowIso={nowIso()} empty={<EmptyState title="Sem atividades" description="Registre ligações, reuniões e follow-ups." />} />
            {write ? (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-semibold">Nova atividade</h3>
                <ActivityForm people={personOptions(options.people)} canPickOwner={manager} defaultOwner={lead.owner_id ?? ctx.user.id} links={{ lead_id: id }} />
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          {lead.status === 'converted' ? (
            <Card title="Convertido">
              <p className="text-sm">Convertido em {formatDateTimeBR(lead.converted_at)}.</p>
              {lead.converted_opportunity_id ? <p className="mt-2 text-sm"><Link className="underline" href={`/opportunities/${lead.converted_opportunity_id}`}>Abrir a oportunidade</Link></p> : null}
            </Card>
          ) : convertible ? (
            <Card title="Converter em oportunidade" description="Cria a oportunidade e, se quiser, a empresa e o contato, tudo de uma vez.">
              {openStages.length === 0 ? <Alert tone="warning">Não há etapas abertas ativas. Configure o funil.</Alert> : (
                <ConvertLeadForm leadId={id} defaultTitle={lead.company_name ? `${lead.company_name} — ${lead.name}` : lead.name} stages={openStages} companies={companies.map((c) => ({ value: c.id, label: c.name }))} hasCompanyName={Boolean(lead.company_name)} />
              )}
            </Card>
          ) : null}
          {canEdit ? (
            <Card title="Ações">
              <div className="flex flex-wrap gap-2">
                <ArchiveButton table="crm_leads" id={id} archived={Boolean(lead.archived_at)} />
                {manager ? <DeleteRecordButton table="crm_leads" id={id} backTo="/leads" /> : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
