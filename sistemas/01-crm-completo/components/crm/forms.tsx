'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';
import { Alert, Button } from '@/components/ui/primitives';
import { ActionButton, CheckField, FormShell, SelectField, TextAreaField, TextField, useActionForm, type Opt } from './form-kit';
import {
  convertLead as convertLeadAction, saveActivity as saveActivityAction, saveCompany as saveCompanyAction, saveContact as saveContactAction,
  saveGoal as saveGoalAction, saveLead as saveLeadAction, saveOpportunity as saveOpportunityAction, moveOpportunity as moveOpportunityAction,
  saveStage as saveStageAction, saveNamed as saveNamedAction, saveTeam as saveTeamAction, setTeamMember as setTeamMemberAction,
  saveCrmSettings as saveCrmSettingsAction,
} from '@/lib/crm/actions';
import {
  ACTIVITY_KIND_LABELS, ACTIVITY_KINDS, activitySchema, companySchema, contactSchema, convertLeadSchema, crmSettingsSchema, goalSchema, LEAD_STATUS_LABELS,
  LEAD_STATUSES, leadSchema, moveOpportunitySchema, nameSchema, opportunitySchema, PRIORITIES, PRIORITY_LABELS, stageSchema, TEMPERATURE_LABELS, TEMPERATURES,
  teamMemberSchema, teamSchema,
} from '@/lib/crm/validation';
import { isoToLocalInput } from '@/lib/crm/format';

const labelOpts = (labels: Record<string, string>, keys: readonly string[]): Opt[] => keys.map((k) => ({ value: k, label: labels[k] ?? k }));
const s = (v: string | null | undefined) => v ?? '';
const reais = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));

// ======================================================================= leads
type LeadValues = { id: string; name: string; company_name: string | null; email: string | null; phone: string | null; job_title: string | null; source_id: string | null; status: string; temperature: string; owner_id: string | null; notes: string | null };

export function LeadForm({ lead, sources, people, canPickOwner, defaultOwner }: { lead?: LeadValues; sources: Opt[]; people: Opt[]; canPickOwner: boolean; defaultOwner: string }) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<z.input<typeof leadSchema>, z.output<typeof leadSchema>>({
    schema: leadSchema,
    defaultValues: {
      name: s(lead?.name), company_name: s(lead?.company_name), email: s(lead?.email), phone: s(lead?.phone), job_title: s(lead?.job_title),
      source_id: s(lead?.source_id), status: (lead?.status === 'converted' ? 'qualified' : lead?.status ?? 'new') as 'new', temperature: (lead?.temperature ?? 'warm') as 'warm',
      owner_id: lead?.owner_id ?? defaultOwner, notes: s(lead?.notes),
    },
    action: (input) => saveLeadAction(lead?.id ?? null, input),
    onSuccess: (r) => { if (!lead && r.id) router.push(`/leads/${r.id}`); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={lead ? 'Salvar lead' : 'Criar lead'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="name" label="Nome" />
        <TextField form={form} name="company_name" label="Empresa" />
        <TextField form={form} name="email" label="E-mail" type="email" />
        <TextField form={form} name="phone" label="Telefone" type="tel" />
        <TextField form={form} name="job_title" label="Cargo" />
        <SelectField form={form} name="source_id" label="Origem" options={sources} empty="Sem origem" />
        <SelectField form={form} name="status" label="Status" options={labelOpts(LEAD_STATUS_LABELS, LEAD_STATUSES)} />
        <SelectField form={form} name="temperature" label="Classificação" options={labelOpts(TEMPERATURE_LABELS, TEMPERATURES)} />
        {canPickOwner ? <SelectField form={form} name="owner_id" label="Responsável" options={people} /> : null}
      </div>
      <TextAreaField form={form} name="notes" label="Observações" maxLength={4000} />
    </FormShell>
  );
}

export function ConvertLeadForm({ leadId, defaultTitle, stages, companies, hasCompanyName }: { leadId: string; defaultTitle: string; stages: Opt[]; companies: Opt[]; hasCompanyName: boolean }) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<z.input<typeof convertLeadSchema>, z.output<typeof convertLeadSchema>>({
    schema: convertLeadSchema,
    defaultValues: { lead_id: leadId, title: defaultTitle, value: '', stage_id: stages[0]?.value ?? '', expected_close_date: '', company_id: '', create_company: hasCompanyName, create_contact: true },
    action: (input) => convertLeadAction(input),
    onSuccess: (r) => { if (r.id) router.push(`/opportunities/${r.id}`); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Converter em oportunidade">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="title" label="Título da oportunidade" />
        <TextField form={form} name="value" label="Valor (R$)" inputMode="decimal" placeholder="1.500,00" />
        <SelectField form={form} name="stage_id" label="Etapa inicial" options={stages} />
        <TextField form={form} name="expected_close_date" label="Previsão de fechamento" type="date" />
        <SelectField form={form} name="company_id" label="Empresa existente (opcional)" options={companies} empty="Nenhuma" />
      </div>
      <div className="flex flex-wrap gap-6">
        <CheckField form={form} name="create_company" label="Criar empresa a partir do lead" />
        <CheckField form={form} name="create_contact" label="Criar contato a partir do lead" />
      </div>
    </FormShell>
  );
}

// ======================================================================= empresas e contatos
type CompanyValues = { id: string; name: string; document: string | null; website: string | null; segment: string | null; phone: string | null; notes: string | null; owner_id: string | null };

export function CompanyForm({ company, people, canPickOwner, defaultOwner }: { company?: CompanyValues; people: Opt[]; canPickOwner: boolean; defaultOwner: string }) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<z.input<typeof companySchema>, z.output<typeof companySchema>>({
    schema: companySchema,
    defaultValues: { name: s(company?.name), document: s(company?.document), website: s(company?.website), segment: s(company?.segment), phone: s(company?.phone), notes: s(company?.notes), owner_id: company?.owner_id ?? defaultOwner },
    action: (input) => saveCompanyAction(company?.id ?? null, input),
    onSuccess: (r) => { if (!company && r.id) router.push(`/companies/${r.id}`); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={company ? 'Salvar empresa' : 'Criar empresa'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="name" label="Nome da empresa" />
        <TextField form={form} name="document" label="CNPJ" hint="Opcional." />
        <TextField form={form} name="website" label="Site" placeholder="https://" />
        <TextField form={form} name="segment" label="Segmento" />
        <TextField form={form} name="phone" label="Telefone" type="tel" />
        {canPickOwner ? <SelectField form={form} name="owner_id" label="Responsável" options={people} empty="Sem responsável" /> : null}
      </div>
      <TextAreaField form={form} name="notes" label="Observações" maxLength={4000} />
    </FormShell>
  );
}

type ContactValues = { id: string; company_id: string | null; name: string; email: string | null; phone: string | null; job_title: string | null; notes: string | null; owner_id: string | null };

export function ContactForm({ contact, companies, people, canPickOwner, defaultOwner, defaultCompany }: { contact?: ContactValues; companies: Opt[]; people: Opt[]; canPickOwner: boolean; defaultOwner: string; defaultCompany?: string }) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<z.input<typeof contactSchema>, z.output<typeof contactSchema>>({
    schema: contactSchema,
    defaultValues: { company_id: contact?.company_id ?? defaultCompany ?? '', name: s(contact?.name), email: s(contact?.email), phone: s(contact?.phone), job_title: s(contact?.job_title), notes: s(contact?.notes), owner_id: contact?.owner_id ?? defaultOwner },
    action: (input) => saveContactAction(contact?.id ?? null, input),
    onSuccess: (r) => { if (!contact && r.id) router.push(`/contacts/${r.id}`); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={contact ? 'Salvar contato' : 'Criar contato'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="name" label="Nome" />
        <SelectField form={form} name="company_id" label="Empresa" options={companies} empty="Sem empresa" />
        <TextField form={form} name="email" label="E-mail" type="email" />
        <TextField form={form} name="phone" label="Telefone" type="tel" />
        <TextField form={form} name="job_title" label="Cargo" />
        {canPickOwner ? <SelectField form={form} name="owner_id" label="Responsável" options={people} empty="Sem responsável" /> : null}
      </div>
      <TextAreaField form={form} name="notes" label="Observações" maxLength={4000} />
    </FormShell>
  );
}

// ======================================================================= oportunidades
type OppValues = { id: string; title: string; value: number; stage_id: string; company_id: string | null; contact_id: string | null; source_id: string | null; expected_close_date: string | null; probability: number | null; owner_id: string | null; notes: string | null };

export function OpportunityForm({ opportunity, stages, companies, contacts, sources, people, canPickOwner, defaultOwner }: {
  opportunity?: OppValues; stages: Opt[]; companies: Opt[]; contacts: Opt[]; sources: Opt[]; people: Opt[]; canPickOwner: boolean; defaultOwner: string;
}) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<z.input<typeof opportunitySchema>, z.output<typeof opportunitySchema>>({
    schema: opportunitySchema,
    defaultValues: {
      title: s(opportunity?.title), value: reais(opportunity?.value), stage_id: opportunity?.stage_id ?? stages[0]?.value ?? '', company_id: s(opportunity?.company_id),
      contact_id: s(opportunity?.contact_id), source_id: s(opportunity?.source_id), expected_close_date: s(opportunity?.expected_close_date),
      probability: opportunity?.probability === null || opportunity?.probability === undefined ? '' : String(opportunity.probability), owner_id: opportunity?.owner_id ?? defaultOwner, notes: s(opportunity?.notes),
    },
    action: (input) => saveOpportunityAction(opportunity?.id ?? null, input),
    onSuccess: (r) => { if (!opportunity && r.id) router.push(`/opportunities/${r.id}`); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={opportunity ? 'Salvar oportunidade' : 'Criar oportunidade'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="title" label="Título" />
        <TextField form={form} name="value" label="Valor (R$)" inputMode="decimal" placeholder="1.500,00" />
        {!opportunity ? <SelectField form={form} name="stage_id" label="Etapa" options={stages} /> : null}
        <TextField form={form} name="expected_close_date" label="Previsão de fechamento" type="date" />
        <TextField form={form} name="probability" label="Probabilidade (%)" inputMode="numeric" hint="Vazio = usa a probabilidade da etapa." />
        <SelectField form={form} name="company_id" label="Empresa" options={companies} empty="Sem empresa" />
        <SelectField form={form} name="contact_id" label="Contato" options={contacts} empty="Sem contato" />
        <SelectField form={form} name="source_id" label="Origem" options={sources} empty="Sem origem" />
        {canPickOwner ? <SelectField form={form} name="owner_id" label="Responsável" options={people} /> : null}
      </div>
      <TextAreaField form={form} name="notes" label="Observações" maxLength={4000} />
    </FormShell>
  );
}

/** Mover de etapa (com motivo da perda quando a etapa é "Perdido"). Usado no detalhe e no Kanban. */
export function MoveStageForm({ opportunityId, currentStageId, stages, reasons, lostStageIds }: { opportunityId: string; currentStageId: string; stages: Opt[]; reasons: Opt[]; lostStageIds: string[] }) {
  const { form, state, pending, submit } = useActionForm<z.input<typeof moveOpportunitySchema>, z.output<typeof moveOpportunitySchema>>({
    schema: moveOpportunitySchema,
    defaultValues: { id: opportunityId, stage_id: currentStageId, loss_reason_id: '', loss_notes: '' },
    action: (input) => moveOpportunityAction(input),
  });
  const target = form.watch('stage_id');
  const isLost = lostStageIds.includes(target);
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Mover">
      <SelectField form={form} name="stage_id" label="Etapa" options={stages} />
      {isLost ? (
        <>
          <SelectField form={form} name="loss_reason_id" label="Motivo da perda" options={reasons} empty="Selecione…" />
          <TextAreaField form={form} name="loss_notes" label="Detalhes (opcional)" maxLength={2000} />
        </>
      ) : null}
    </FormShell>
  );
}

// ======================================================================= atividades
type ActivityValues = { id: string; kind: string; title: string; description: string | null; due_at: string | null; priority: string; owner_id: string | null; lead_id: string | null; contact_id: string | null; company_id: string | null; opportunity_id: string | null };

export function ActivityForm({ activity, people, canPickOwner, defaultOwner, links, onDone }: {
  activity?: ActivityValues; people: Opt[]; canPickOwner: boolean; defaultOwner: string;
  links?: { lead_id?: string; contact_id?: string; company_id?: string; opportunity_id?: string }; onDone?: () => void;
}) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<z.input<typeof activitySchema>, z.output<typeof activitySchema>>({
    schema: activitySchema,
    defaultValues: {
      kind: (activity?.kind ?? 'follow_up') as 'task', title: s(activity?.title), description: s(activity?.description), due_at: isoToLocalInput(activity?.due_at),
      priority: (activity?.priority ?? 'medium') as 'low', owner_id: activity?.owner_id ?? defaultOwner,
      lead_id: activity?.lead_id ?? links?.lead_id ?? '', contact_id: activity?.contact_id ?? links?.contact_id ?? '',
      company_id: activity?.company_id ?? links?.company_id ?? '', opportunity_id: activity?.opportunity_id ?? links?.opportunity_id ?? '',
    },
    action: (input) => saveActivityAction(activity?.id ?? null, input),
    resetOnSuccess: !activity,
    onSuccess: () => { onDone?.(); if (!activity) router.refresh(); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={activity ? 'Salvar atividade' : 'Criar atividade'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField form={form} name="kind" label="Tipo" options={labelOpts(ACTIVITY_KIND_LABELS, ACTIVITY_KINDS)} />
        <TextField form={form} name="title" label="Título" />
        <TextField form={form} name="due_at" label="Prazo" type="datetime-local" hint="Horário de Brasília." />
        <SelectField form={form} name="priority" label="Prioridade" options={labelOpts(PRIORITY_LABELS, PRIORITIES)} />
        {canPickOwner ? <SelectField form={form} name="owner_id" label="Responsável" options={people} /> : null}
      </div>
      <TextAreaField form={form} name="description" label="Descrição" maxLength={4000} />
    </FormShell>
  );
}

// ======================================================================= metas
export function GoalForm({ people, teams }: { people: Opt[]; teams: Opt[] }) {
  const { form, state, pending, submit } = useActionForm<z.input<typeof goalSchema>, z.output<typeof goalSchema>>({
    schema: goalSchema,
    defaultValues: { scope: 'user', user_id: '', team_id: '', period_start: '', period_end: '', target_amount: '' },
    action: (input) => saveGoalAction(input),
    resetOnSuccess: true,
  });
  const scope = form.watch('scope');
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Criar meta">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField form={form} name="scope" label="Tipo" options={[{ value: 'user', label: 'Individual (vendedor)' }, { value: 'team', label: 'Equipe' }]} />
        {scope === 'user' ? <SelectField form={form} name="user_id" label="Vendedor" options={people} empty="Selecione…" /> : <SelectField form={form} name="team_id" label="Equipe" options={teams} empty="Selecione…" />}
        <TextField form={form} name="period_start" label="Início" type="date" />
        <TextField form={form} name="period_end" label="Fim" type="date" />
        <TextField form={form} name="target_amount" label="Meta de vendas ganhas (R$)" inputMode="decimal" placeholder="50.000,00" />
      </div>
    </FormShell>
  );
}

// ======================================================================= configurações
type StageValues = { id: string; name: string; position: number; probability: number; kind: 'open' | 'won' | 'lost'; color: string | null; is_active: boolean };
const KIND_LABEL: Record<string, string> = { open: 'Aberta', won: 'Ganho', lost: 'Perdido' };

export function StageForm({ stage }: { stage?: StageValues }) {
  const { form, state, pending, submit } = useActionForm<z.input<typeof stageSchema>, z.output<typeof stageSchema>>({
    schema: stageSchema,
    defaultValues: { name: s(stage?.name), position: String(stage?.position ?? 50), probability: String(stage?.probability ?? 50), kind: stage?.kind ?? 'open', color: s(stage?.color), is_active: stage?.is_active ?? true },
    action: (input) => saveStageAction(stage?.id ?? null, input),
    resetOnSuccess: !stage,
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={stage ? 'Salvar etapa' : 'Adicionar etapa'}>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField form={form} name="name" label="Nome" />
        <TextField form={form} name="position" label="Posição" inputMode="numeric" hint="Menor = mais à esquerda." />
        <TextField form={form} name="probability" label="Probabilidade (%)" inputMode="numeric" />
        {stage ? (
          <p className="text-sm text-muted sm:self-end">Tipo: <strong>{KIND_LABEL[stage.kind]}</strong> (não pode ser alterado)</p>
        ) : (
          <SelectField form={form} name="kind" label="Tipo" options={[{ value: 'open', label: 'Aberta' }, { value: 'won', label: 'Ganho' }, { value: 'lost', label: 'Perdido' }]} />
        )}
        <TextField form={form} name="color" label="Cor" placeholder="#0891b2" />
        <CheckField form={form} name="is_active" label="Ativa" />
      </div>
    </FormShell>
  );
}

export function NamedForm({ table, item }: { table: 'crm_lead_sources' | 'crm_loss_reasons'; item?: { id: string; name: string; is_active: boolean } }) {
  const { form, state, pending, submit } = useActionForm<z.input<typeof nameSchema>, z.output<typeof nameSchema>>({
    schema: nameSchema,
    defaultValues: { name: s(item?.name), is_active: item?.is_active ?? true },
    action: (input) => saveNamedAction(table, item?.id ?? null, input),
    resetOnSuccess: !item,
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={item ? 'Salvar' : 'Adicionar'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="name" label="Nome" />
        <CheckField form={form} name="is_active" label="Ativo" />
      </div>
    </FormShell>
  );
}

export function TeamForm() {
  const { form, state, pending, submit } = useActionForm<z.input<typeof teamSchema>, z.output<typeof teamSchema>>({
    schema: teamSchema, defaultValues: { name: '' }, action: (input) => saveTeamAction(input), resetOnSuccess: true,
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Criar equipe">
      <TextField form={form} name="name" label="Nome da equipe" />
    </FormShell>
  );
}

export function TeamMemberForm({ teamId, people }: { teamId: string; people: Opt[] }) {
  const { form, state, pending, submit } = useActionForm<z.input<typeof teamMemberSchema>, z.output<typeof teamMemberSchema>>({
    schema: teamMemberSchema, defaultValues: { team_id: teamId, user_id: '' }, action: (input) => setTeamMemberAction(input, true), resetOnSuccess: false,
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Adicionar">
      <SelectField form={form} name="user_id" label="Pessoa" options={people} empty="Selecione…" />
    </FormShell>
  );
}

export function RemoveMemberButton({ teamId, userId, label }: { teamId: string; userId: string; label: string }) {
  return <ActionButton label="Remover" variant="ghost" confirm={`Remover ${label} da equipe?`} action={() => setTeamMemberAction({ team_id: teamId, user_id: userId }, false)} />;
}

export function CrmSettingsForm({ values }: { values: { stale_days: number; closing_soon_days: number } }) {
  const { form, state, pending, submit } = useActionForm<z.input<typeof crmSettingsSchema>, z.output<typeof crmSettingsSchema>>({
    schema: crmSettingsSchema,
    defaultValues: { stale_days: String(values.stale_days), closing_soon_days: String(values.closing_soon_days) },
    action: (input) => saveCrmSettingsAction(input),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Salvar limites">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="stale_days" label="Oportunidade parada após (dias sem atividade)" inputMode="numeric" />
        <TextField form={form} name="closing_soon_days" label="Fechamento próximo em (dias)" inputMode="numeric" />
      </div>
    </FormShell>
  );
}

/** Ícone de ajuda sem JavaScript pesado: mostra/esconde um bloco. */
export function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{summary}</Button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return <Alert tone="info">{children}</Alert>;
}
