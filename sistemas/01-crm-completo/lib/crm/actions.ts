'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionContext, type Context } from '@/lib/auth/session';
import { fail, fieldErrorsFrom, messageForDbError, succeed, type ActionState } from '@/lib/actions/result';
import { logEvent } from '@/lib/log';
import { MAX_IMPORT_BYTES, parseLeadsCsv } from './csv';
import { loadOptions } from './data';
import {
  activitySchema, companySchema, contactSchema, convertLeadSchema, crmSettingsSchema, goalSchema, leadSchema, moveOpportunitySchema, nameSchema,
  opportunitySchema, stageSchema, teamMemberSchema, teamSchema, LEAD_STATUSES, TEMPERATURES,
} from './validation';

export type SaveResult = ActionState & { id?: string };

const WRITERS = ['owner', 'admin', 'manager', 'member'] as const;
const MANAGERS = ['owner', 'admin', 'manager'] as const;
const ADMINS = ['owner', 'admin'] as const;
const idSchema = z.uuid();

type Role = Context['membership']['role'];

/** Vendedor só cria/edita registros dele; gestão escolhe o responsável (padrão: ela mesma). */
function resolveOwner(ctx: Context, requested: string | null): string {
  const role: Role = ctx.membership.role;
  if (role === 'member') return ctx.user.id;
  return requested ?? ctx.user.id;
}

function dbMessage(error: { code?: string; message?: string }, duplicate?: string): string {
  if (error.code === '23505' && duplicate) return duplicate;
  if (error.code === '23503') return 'Este registro está em uso ou referencia algo inexistente.';
  if (error.code === '23514' && error.message) {
    if (/motivo da perda/i.test(error.message)) return 'Informe o motivo da perda.';
    if (/etapa desativada/i.test(error.message)) return 'Esta etapa está desativada.';
    if (/funil precisa manter/i.test(error.message)) return 'O funil precisa manter ao menos uma etapa ativa de Ganho e uma de Perdido.';
    if (/convertido/i.test(error.message)) return 'Lead convertido não pode mudar de status.';
  }
  return messageForDbError(error);
}

// ===================================================================== leads
export async function saveLead(id: string | null, input: unknown): Promise<SaveResult> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  const row = { ...d, owner_id: resolveOwner(ctx, d.owner_id) };
  const dup = 'Já existe um lead ativo com este e-mail.';

  if (id === null) {
    const { data, error } = await ctx.supabase.from('crm_leads').insert({ organization_id: ctx.membership.organization_id, ...row }).select('id').single();
    if (error) return fail(dbMessage(error, dup));
    revalidatePath('/leads');
    return { ...succeed('Lead criado.'), id: (data as { id: string }).id };
  }
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('crm_leads').update(row).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error, dup));
  if (!data?.length) return fail('Você não tem permissão para alterar este lead.');
  revalidatePath('/leads');
  revalidatePath(`/leads/${id}`);
  return { ...succeed('Lead atualizado.'), id };
}

export async function archiveRecord(table: 'crm_leads' | 'crm_companies' | 'crm_contacts', id: string, archive: boolean): Promise<ActionState> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from(table).update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error, 'Já existe um lead ativo com este e-mail; arquive ou edite o outro antes de restaurar.'));
  if (!data?.length) return fail('Você não tem permissão para esta ação.');
  revalidatePath('/leads');
  revalidatePath('/companies');
  revalidatePath('/contacts');
  return succeed(archive ? 'Arquivado.' : 'Restaurado.');
}

export async function convertLead(input: unknown): Promise<SaveResult> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = convertLeadSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  const { data, error } = await ctx.supabase.rpc('crm_convert_lead', {
    p_lead_id: d.lead_id, p_title: d.title, p_value: d.value, p_stage_id: d.stage_id, p_expected_close: d.expected_close_date,
    p_company_id: d.company_id, p_create_company: d.create_company, p_create_contact: d.create_contact,
  });
  if (error) return fail(dbMessage(error));
  revalidatePath('/leads');
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  revalidatePath('/companies');
  revalidatePath('/contacts');
  return { ...succeed('Lead convertido em oportunidade.'), id: String(data) };
}

// ===================================================================== empresas e contatos
export async function saveCompany(id: string | null, input: unknown): Promise<SaveResult> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const row = { ...parsed.data, owner_id: parsed.data.owner_id ?? ctx.user.id };
  if (id === null) {
    const { data, error } = await ctx.supabase.from('crm_companies').insert({ organization_id: ctx.membership.organization_id, ...row }).select('id').single();
    if (error) return fail(dbMessage(error));
    revalidatePath('/companies');
    return { ...succeed('Empresa criada.'), id: (data as { id: string }).id };
  }
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('crm_companies').update(row).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para alterar esta empresa.');
  revalidatePath('/companies');
  revalidatePath(`/companies/${id}`);
  return { ...succeed('Empresa atualizada.'), id };
}

export async function saveContact(id: string | null, input: unknown): Promise<SaveResult> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const row = { ...parsed.data, owner_id: parsed.data.owner_id ?? ctx.user.id };
  if (id === null) {
    const { data, error } = await ctx.supabase.from('crm_contacts').insert({ organization_id: ctx.membership.organization_id, ...row }).select('id').single();
    if (error) return fail(dbMessage(error));
    revalidatePath('/contacts');
    return { ...succeed('Contato criado.'), id: (data as { id: string }).id };
  }
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('crm_contacts').update(row).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para alterar este contato.');
  revalidatePath('/contacts');
  revalidatePath(`/contacts/${id}`);
  return { ...succeed('Contato atualizado.'), id };
}

export async function deleteRecord(table: 'crm_companies' | 'crm_contacts' | 'crm_leads' | 'crm_opportunities' | 'crm_activities', id: string): Promise<ActionState> {
  const auth = await actionContext(table === 'crm_activities' ? WRITERS : MANAGERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from(table).delete().eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para apagar este registro.');
  for (const p of ['/leads', '/companies', '/contacts', '/opportunities', '/pipeline', '/activities']) revalidatePath(p);
  return succeed('Registro apagado.');
}

// ===================================================================== oportunidades
const opportunityUpdateSchema = opportunitySchema.omit({ stage_id: true });

export async function saveOpportunity(id: string | null, input: unknown): Promise<SaveResult> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  if (id === null) {
    const parsed = opportunitySchema.safeParse(input);
    if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
    const d = parsed.data;
    const { data, error } = await ctx.supabase.from('crm_opportunities').insert({ organization_id: ctx.membership.organization_id, ...d, owner_id: resolveOwner(ctx, d.owner_id) }).select('id').single();
    if (error) return fail(dbMessage(error));
    revalidatePath('/opportunities');
    revalidatePath('/pipeline');
    return { ...succeed('Oportunidade criada.'), id: (data as { id: string }).id };
  }
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = opportunityUpdateSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  const { data, error } = await ctx.supabase.from('crm_opportunities').update({ ...d, owner_id: resolveOwner(ctx, d.owner_id) }).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para alterar esta oportunidade.');
  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${id}`);
  revalidatePath('/pipeline');
  return { ...succeed('Oportunidade atualizada.'), id };
}

export async function moveOpportunity(input: unknown): Promise<ActionState> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = moveOpportunitySchema.safeParse(input);
  if (!parsed.success) return fail('Dados inválidos.', fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from('crm_opportunities')
    .update({ stage_id: d.stage_id, loss_reason_id: d.loss_reason_id, loss_notes: d.loss_notes })
    .eq('id', d.id)
    .eq('organization_id', ctx.membership.organization_id)
    .select('id, status');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para mover esta oportunidade.');
  revalidatePath('/pipeline');
  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${d.id}`);
  revalidatePath('/dashboard');
  return succeed('Oportunidade movida.');
}

// ===================================================================== atividades
export async function saveActivity(id: string | null, input: unknown): Promise<SaveResult> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const row = { ...parsed.data, owner_id: resolveOwner(ctx, parsed.data.owner_id) };
  if (id === null) {
    const { data, error } = await ctx.supabase.from('crm_activities').insert({ organization_id: ctx.membership.organization_id, ...row }).select('id').single();
    if (error) return fail(dbMessage(error));
    revalidatePath('/activities');
    revalidatePath('/dashboard');
    return { ...succeed('Atividade criada.'), id: (data as { id: string }).id };
  }
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('crm_activities').update(row).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para alterar esta atividade.');
  revalidatePath('/activities');
  revalidatePath('/dashboard');
  return { ...succeed('Atividade atualizada.'), id };
}

export async function completeActivity(id: string, done: boolean): Promise<ActionState> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('crm_activities').update({ completed_at: done ? new Date().toISOString() : null }).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para alterar esta atividade.');
  revalidatePath('/activities');
  revalidatePath('/dashboard');
  return succeed(done ? 'Atividade concluída.' : 'Atividade reaberta.');
}

// ===================================================================== metas
export async function saveGoal(input: unknown): Promise<ActionState> {
  const auth = await actionContext(MANAGERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  const { error } = await ctx.supabase.from('crm_goals').insert({
    organization_id: ctx.membership.organization_id, scope: d.scope, user_id: d.scope === 'user' ? d.user_id : null,
    team_id: d.scope === 'team' ? d.team_id : null, period_start: d.period_start, period_end: d.period_end, target_amount: d.target_amount,
  });
  if (error) return fail(dbMessage(error, 'Já existe uma meta para este vendedor/equipe neste período.'));
  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return succeed('Meta criada.');
}

export async function deleteGoal(id: string): Promise<ActionState> {
  const auth = await actionContext(MANAGERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('crm_goals').delete().eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para apagar esta meta.');
  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return succeed('Meta apagada.');
}

// ===================================================================== configurações do CRM (owner/admin)
export async function saveStage(id: string | null, input: unknown): Promise<ActionState> {
  const auth = await actionContext(ADMINS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  const dup = 'Já existe uma etapa com este nome.';
  if (id === null) {
    const { error } = await ctx.supabase.from('crm_pipeline_stages').insert({ organization_id: ctx.membership.organization_id, ...d });
    if (error) return fail(dbMessage(error, dup));
  } else {
    if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
    // o tipo (aberta/ganho/perdido) é imutável; só nome, posição, probabilidade, cor e ativação mudam
    const { data, error } = await ctx.supabase.from('crm_pipeline_stages').update({ name: d.name, position: d.position, probability: d.probability, color: d.color, is_active: d.is_active }).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
    if (error) return fail(dbMessage(error, dup));
    if (!data?.length) return fail('Você não tem permissão para esta ação.');
  }
  for (const p of ['/crm-settings', '/pipeline', '/dashboard']) revalidatePath(p);
  return succeed('Etapa salva.');
}

export async function saveNamed(table: 'crm_lead_sources' | 'crm_loss_reasons', id: string | null, input: unknown): Promise<ActionState> {
  const auth = await actionContext(ADMINS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const dup = 'Já existe um item com este nome.';
  if (id === null) {
    const { error } = await ctx.supabase.from(table).insert({ organization_id: ctx.membership.organization_id, ...parsed.data });
    if (error) return fail(dbMessage(error, dup));
  } else {
    if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
    const { data, error } = await ctx.supabase.from(table).update(parsed.data).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
    if (error) return fail(dbMessage(error, dup));
    if (!data?.length) return fail('Você não tem permissão para esta ação.');
  }
  revalidatePath('/crm-settings');
  return succeed('Salvo.');
}

export async function deleteConfig(table: 'crm_pipeline_stages' | 'crm_lead_sources' | 'crm_loss_reasons' | 'crm_teams', id: string): Promise<ActionState> {
  const auth = await actionContext(ADMINS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from(table).delete().eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) {
    if (error.code === '23503') return fail('Este item está em uso e não pode ser apagado. Desative-o para escondê-lo.');
    return fail(dbMessage(error));
  }
  if (!data?.length) return fail('Você não tem permissão para esta ação.');
  for (const p of ['/crm-settings', '/pipeline', '/dashboard']) revalidatePath(p);
  return succeed('Apagado.');
}

export async function saveTeam(input: unknown): Promise<ActionState> {
  const auth = await actionContext(ADMINS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { error } = await ctx.supabase.from('crm_teams').insert({ organization_id: ctx.membership.organization_id, name: parsed.data.name });
  if (error) return fail(dbMessage(error, 'Já existe uma equipe com este nome.'));
  revalidatePath('/crm-settings');
  return succeed('Equipe criada.');
}

export async function setTeamMember(input: unknown, add: boolean): Promise<ActionState> {
  const auth = await actionContext(ADMINS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) return fail('Dados inválidos.');
  const org = ctx.membership.organization_id;
  const q = add
    ? ctx.supabase.from('crm_team_members').insert({ team_id: parsed.data.team_id, organization_id: org, user_id: parsed.data.user_id }).select('team_id')
    : ctx.supabase.from('crm_team_members').delete().eq('team_id', parsed.data.team_id).eq('user_id', parsed.data.user_id).eq('organization_id', org).select('team_id');
  const { data, error } = await q;
  if (error) return fail(dbMessage(error, 'A pessoa já faz parte da equipe.'));
  if (!data?.length && !add) return fail('Você não tem permissão para esta ação.');
  revalidatePath('/crm-settings');
  return succeed(add ? 'Pessoa adicionada à equipe.' : 'Pessoa removida da equipe.');
}

export async function saveCrmSettings(input: unknown): Promise<ActionState> {
  const auth = await actionContext(ADMINS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;
  const parsed = crmSettingsSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { data, error } = await ctx.supabase.from('crm_settings').update(parsed.data).eq('organization_id', ctx.membership.organization_id).select('organization_id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para esta ação.');
  revalidatePath('/crm-settings');
  revalidatePath('/dashboard');
  return succeed('Configurações salvas.');
}

// ===================================================================== importação de leads (CSV)
export type ImportReport = ActionState & {
  report?: {
    dryRun: boolean; total: number; created: number; duplicates: number; invalid: number; warnings: number;
    problems: Array<{ line: number; reason: string }>; unknownHeaders: string[];
  };
};

const STATUS_BY_TEXT: Record<string, (typeof LEAD_STATUSES)[number]> = {
  novo: 'new', new: 'new', contatado: 'contacted', contacted: 'contacted', qualificado: 'qualified', qualified: 'qualified',
  desqualificado: 'unqualified', unqualified: 'unqualified',
};
const TEMP_BY_TEXT: Record<string, (typeof TEMPERATURES)[number]> = { frio: 'cold', cold: 'cold', morno: 'warm', warm: 'warm', quente: 'hot', hot: 'hot' };
const MAX_REPORTED = 50;

export async function importLeads(_prev: ImportReport, formData: FormData): Promise<ImportReport> {
  const auth = await actionContext(WRITERS);
  if ('error' in auth) return auth.error;
  const { ctx } = auth;

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Selecione um arquivo CSV.');
  if (file.size > MAX_IMPORT_BYTES) return fail('Arquivo muito grande (máximo de 1 MB).');
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain|excel/i.test(file.type)) return fail('O arquivo precisa ser um CSV.');
  const dryRun = formData.get('dryRun') === 'on';
  const requestedOwner = String(formData.get('owner_id') ?? '');
  const ownerId = resolveOwner(ctx, idSchema.safeParse(requestedOwner).success ? requestedOwner : null);

  const parsedCsv = parseLeadsCsv(await file.text());
  if (!parsedCsv.ok) return fail(parsedCsv.error);

  const options = await loadOptions(ctx);
  const sourceByName = new Map(options.sources.map((s) => [s.name.toLowerCase(), s.id]));
  const org = ctx.membership.organization_id;

  const problems: Array<{ line: number; reason: string }> = [];
  let invalid = 0;
  let duplicates = 0;
  let warnings = 0;
  const seenEmails = new Set<string>();
  const candidates: Array<{ line: number; row: Record<string, unknown> }> = [];

  for (const { line, values } of parsedCsv.rows) {
    const status = values.status ? STATUS_BY_TEXT[values.status.toLowerCase()] : 'new';
    const temperature = values.temperature ? TEMP_BY_TEXT[values.temperature.toLowerCase()] : 'warm';
    let sourceId = '';
    if (values.source) {
      const found = sourceByName.get(values.source.toLowerCase());
      if (found) sourceId = found;
      else { warnings++; if (problems.length < MAX_REPORTED) problems.push({ line, reason: `origem não reconhecida ("${values.source.slice(0, 40)}"): importado sem origem` }); }
    }
    const check = leadSchema.safeParse({
      name: values.name ?? '', company_name: values.company_name ?? '', email: values.email ?? '', phone: values.phone ?? '', job_title: values.job_title ?? '',
      source_id: sourceId, status: status ?? 'new', temperature: temperature ?? 'warm', owner_id: '', notes: values.notes ?? '',
    });
    if (!check.success || (values.status && !status) || (values.temperature && !temperature)) {
      invalid++;
      if (problems.length < MAX_REPORTED) problems.push({ line, reason: !check.success ? (check.error.issues[0]?.message ?? 'dados inválidos') : 'status ou temperatura desconhecidos' });
      continue;
    }
    const email = check.data.email;
    if (email) {
      if (seenEmails.has(email)) { duplicates++; if (problems.length < MAX_REPORTED) problems.push({ line, reason: `e-mail repetido no arquivo (${email})` }); continue; }
      seenEmails.add(email);
    }
    candidates.push({ line, row: { organization_id: org, ...check.data, owner_id: ownerId } });
  }

  // duplicidade contra leads ativos já existentes (o banco também garante por índice único)
  const emails = [...seenEmails];
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await ctx.supabase.from('crm_leads').select('email').eq('organization_id', org).is('archived_at', null).in('email', emails.slice(i, i + 200));
    (data ?? []).forEach((r: { email: string | null }) => r.email && existing.add(r.email));
  }
  const toInsert = candidates.filter((c) => {
    const email = c.row.email as string | null;
    if (email && existing.has(email)) {
      duplicates++;
      if (problems.length < MAX_REPORTED) problems.push({ line: c.line, reason: `já existe um lead ativo com o e-mail ${email}` });
      return false;
    }
    return true;
  });

  let created = 0;
  if (!dryRun) {
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200).map((c) => c.row);
      const { error } = await ctx.supabase.from('crm_leads').insert(chunk);
      if (error) {
        logEvent('warn', 'crm.import_failed', { code: error.code });
        return fail(`A importação foi interrompida após ${created} lead(s): ${dbMessage(error, 'um e-mail já existia (outra pessoa pode ter importado ao mesmo tempo). Valide novamente.')}`);
      }
      created += chunk.length;
    }
    revalidatePath('/leads');
    revalidatePath('/dashboard');
  }

  return {
    ...succeed(dryRun ? 'Validação concluída. Nada foi gravado.' : `${created} lead(s) importado(s).`),
    report: {
      dryRun, total: parsedCsv.rows.length, created: dryRun ? 0 : created, duplicates, invalid, warnings, problems, unknownHeaders: parsedCsv.unknownHeaders,
    },
  };
}
