'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionContext, actionPortalContext, CLIENT_COOKIE, type ClientAccount, type Context, type PortalContext } from '@/lib/auth/session';
import { fail, fieldErrorsFrom, messageForDbError, succeed, type ActionState } from '@/lib/actions/result';
import { getPublicEnv } from '@/lib/env';
import { logEvent } from '@/lib/log';
import { AUTH_LIMITS, rateLimit } from '@/lib/security/rate-limit';
import type { OrgRole } from '@/lib/validation/org';
import { loadSettings } from './data';
import { zonedIso } from './filters';
import {
  announcementSchema, categorySchema, clientAccountSchema, clientMemberSchema, commentSchema, deliverableSchema, deliverableStatusSchema, deliverableUpdateSchema, dueSchema,
  folderSchema, internalNotesSchema, inviteSchema, inviteTokenSchema, portalSettingsSchema, requestCreateSchema, requestEditSchema, slaSchema, statusChangeSchema,
} from './validation';

export type SaveResult = ActionState & { id?: string; number?: number; link?: string };

const STAFF_WRITERS = ['owner', 'admin', 'manager', 'member'] as const;
const STAFF_MANAGERS = ['owner', 'admin', 'manager'] as const;
const STAFF_ADMINS = ['owner', 'admin'] as const;
const idSchema = z.uuid();

/** Mensagens que escrevemos no banco (funções pt_*) são seguras e úteis; erros nativos do Postgres viram mensagem genérica. */
function dbMessage(error: { code?: string; message?: string }, duplicate?: string): string {
  if (error.code === '23505' && duplicate) return duplicate;
  if (error.code === '23503') return 'Este registro está em uso ou referencia algo inexistente.';
  const own = ['23514', '22023', 'P0002', '42501'];
  const msg = error.message ?? '';
  if (own.includes(error.code ?? '') && msg && msg.length <= 200 && !/violat|constraint|relation|column|violação|restrição/i.test(msg)) {
    return msg.charAt(0).toUpperCase() + msg.slice(1) + (msg.endsWith('.') ? '' : '.');
  }
  return messageForDbError(error);
}
const bust = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));
const bustAll = () => ['/dashboard', '/solicitacoes', '/entregas', '/documentos', '/comunicados', '/clientes', '/portal'].forEach((p) => revalidatePath(p, 'layout'));

type Actor = { kind: 'staff'; ctx: Context } | { kind: 'client'; ctx: PortalContext };
/** Quem está agindo: equipe (qualquer papel de escrita) ou usuário do cliente. O banco autoriza de novo, pelo auth.uid(). */
async function actor(opts: { staff?: readonly OrgRole[]; client?: boolean }): Promise<{ actor: Actor } | { error: ActionState }> {
  if (opts.staff) {
    const s = await actionContext(opts.staff);
    if ('ctx' in s) return { actor: { kind: 'staff', ctx: s.ctx } };
    if (!opts.client) return { error: s.error };
  }
  if (opts.client) {
    const c = await actionPortalContext();
    if ('ctx' in c) return { actor: { kind: 'client', ctx: c.ctx } };
    return { error: c.error };
  }
  return { error: fail('Você não tem permissão para esta ação.') };
}
const orgOf = (a: Actor) => (a.kind === 'staff' ? a.ctx.membership.organization_id : a.ctx.account.organization_id);
const dbOf = (a: Actor) => a.ctx.supabase;

// ===================================================================== empresas clientes
export async function createClientAccount(input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  const parsed = clientAccountSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const { data, error } = await ctx.supabase.from('client_accounts').insert({ organization_id: ctx.membership.organization_id, ...v }).select('id').single();
  if (error) return fail(dbMessage(error, 'Já existe uma empresa com este nome.'));
  bust('/clientes', '/dashboard');
  return { ...succeed('Empresa cadastrada.'), id: (data as { id: string }).id };
}

export async function updateClientAccount(id: string, input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = clientAccountSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { data, error } = await ctx.supabase.from('client_accounts').update(parsed.data).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para alterar esta empresa.');
  bust('/clientes', `/clientes/${id}`);
  return { ...succeed('Empresa atualizada.'), id };
}

export async function archiveClientAccount(id: string, archive: boolean): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('client_accounts').update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para esta ação.');
  bustAll();
  return succeed(archive ? 'Empresa arquivada. Os usuários dela perdem o acesso ao portal.' : 'Empresa restaurada.');
}

export async function saveInternalNotes(id: string, input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = internalNotesSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const org = ctx.membership.organization_id;
  const { error } = await ctx.supabase.from('client_internal_notes').upsert({ client_account_id: id, organization_id: org, notes: parsed.data.notes || null }, { onConflict: 'client_account_id' });
  if (error) return fail(dbMessage(error));
  bust(`/clientes/${id}`);
  return succeed('Observações internas salvas. O cliente nunca vê este texto.');
}

// ===================================================================== solicitações
export async function createRequest(input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_WRITERS, client: true });
  if ('error' in auth) return auth.error;
  const a = auth.actor;
  const parsed = requestCreateSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  // O usuário do cliente só abre solicitações na PRÓPRIA conta; o banco confere de novo.
  const client = a.kind === 'client' ? a.ctx.account.client_account_id : v.client;
  const { data, error } = await dbOf(a).rpc('pt_request_create', {
    p_client: client, p_title: v.title, p_description: v.description, p_category: v.category, p_priority: v.priority, p_assigned_to: a.kind === 'staff' ? v.assigned_to : null,
  });
  if (error) return fail(dbMessage(error));
  const r = data as { id: string; number: number };
  bustAll();
  return { ...succeed(`Solicitação SOL-${String(r.number).padStart(4, '0')} aberta.`), id: r.id, number: r.number };
}

export async function editRequest(id: string, input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = requestEditSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const { error } = await dbOf(auth.actor).rpc('pt_request_edit', { p_request: id, p_title: v.title, p_description: v.description, p_category: v.category, p_priority: v.priority });
  if (error) return fail(dbMessage(error));
  bustAll();
  return { ...succeed('Solicitação atualizada.'), id };
}

export async function changeRequestStatus(id: string, input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_WRITERS, client: true });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { error } = await dbOf(auth.actor).rpc('pt_request_set_status', { p_request: id, p_status: parsed.data.status, p_reason: parsed.data.reason || null });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed('Situação atualizada.');
}

export async function assignRequest(id: string, userId: string | null): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success || (userId !== null && !idSchema.safeParse(userId).success)) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_request_assign', { p_request: id, p_user: userId });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed(userId ? 'Responsável atribuído.' : 'Solicitação sem responsável.');
}

export async function setRequestDue(id: string, input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = dueSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const settings = await loadSettings(ctx, ctx.membership.organization_id);
  const { error } = await ctx.supabase.rpc('pt_request_set_due', { p_request: id, p_due: zonedIso(parsed.data.date, parsed.data.time, settings.timezone), p_kind: parsed.data.kind, p_reason: parsed.data.reason });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed('Prazo atualizado e registrado no histórico.');
}

export async function addComment(requestId: string, input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_WRITERS, client: true });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(requestId).success) return fail('Registro inválido.');
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  // Cliente nunca escreve comentário interno: nem aqui nem no banco.
  const visibility = auth.actor.kind === 'client' ? 'shared' : parsed.data.visibility;
  const { data, error } = await dbOf(auth.actor).rpc('pt_comment_add', { p_request: requestId, p_body: parsed.data.body, p_visibility: visibility });
  if (error) return fail(dbMessage(error));
  bustAll();
  return { ...succeed(visibility === 'internal' ? 'Nota interna registrada (o cliente não a vê).' : 'Comentário enviado.'), id: String(data) };
}

// ===================================================================== documentos
export async function createFolder(clientId: string, input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_WRITERS, client: true });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(clientId).success) return fail('Registro inválido.');
  const parsed = folderSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const client = auth.actor.kind === 'client' ? auth.actor.ctx.account.client_account_id : clientId;
  const { data, error } = await dbOf(auth.actor).rpc('pt_folder_create', { p_client: client, p_parent: parsed.data.parent, p_name: parsed.data.name, p_visibility: auth.actor.kind === 'client' ? 'client' : parsed.data.visibility });
  if (error) return fail(dbMessage(error, 'Já existe uma pasta com este nome aqui.'));
  bustAll();
  return { ...succeed('Pasta criada.'), id: String(data) };
}

export async function archiveFolder(id: string): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_folder_archive', { p_folder: id });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed('Pasta arquivada.');
}

export async function setDocumentVisibility(id: string, visibility: 'internal' | 'client'): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success || !['internal', 'client'].includes(visibility)) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_document_set_visibility', { p_document: id, p_visibility: visibility });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed(visibility === 'client' ? 'Documento compartilhado com o cliente.' : 'Documento agora é interno (o cliente perde o acesso).');
}

export async function archiveDocument(id: string): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_document_archive', { p_document: id });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed('Documento arquivado.');
}

// ===================================================================== entregas
export async function createDeliverable(input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  const parsed = deliverableSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const { data, error } = await dbOf(auth.actor).rpc('pt_deliverable_create', { p_client: v.client, p_request: v.request, p_title: v.title, p_description: v.description });
  if (error) return fail(dbMessage(error));
  bustAll();
  return { ...succeed('Entrega criada como rascunho.'), id: String(data) };
}

export async function updateDeliverable(id: string, input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = deliverableUpdateSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { error } = await dbOf(auth.actor).rpc('pt_deliverable_update', { p_id: id, p_title: parsed.data.title, p_description: parsed.data.description });
  if (error) return fail(dbMessage(error));
  bustAll();
  return { ...succeed('Entrega atualizada.'), id };
}

export async function attachDeliverableFile(deliverableId: string, documentId: string, attach: boolean): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(deliverableId).success || !idSchema.safeParse(documentId).success) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc(attach ? 'pt_deliverable_attach' : 'pt_deliverable_detach', { p_deliverable: deliverableId, p_document: documentId });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed(attach ? 'Arquivo vinculado à entrega.' : 'Arquivo removido da entrega.');
}

export async function setDeliverableStatus(id: string, status: string): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_WRITERS });
  if ('error' in auth) return auth.error;
  const st = deliverableStatusSchema.safeParse(status);
  if (!idSchema.safeParse(id).success || !st.success) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_deliverable_set_status', { p_id: id, p_status: st.data });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed(st.data === 'published' ? 'Entrega publicada. O cliente foi avisado.' : 'Situação da entrega atualizada.');
}

export async function acknowledgeDeliverable(id: string): Promise<ActionState> {
  const auth = await actor({ client: true });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_deliverable_acknowledge', { p_id: id });
  if (error) return fail(dbMessage(error));
  bustAll();
  return succeed('Recebimento confirmado. Obrigado!');
}

// ===================================================================== comunicados
export async function publishAnnouncement(input: unknown): Promise<SaveResult> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const LOCAL = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
  if (v.publish_at && !LOCAL.test(v.publish_at)) return fail('Data de publicação inválida.', { publish_at: ['Data inválida.'] });
  if (v.expires_at && !LOCAL.test(v.expires_at)) return fail('Data de expiração inválida.', { expires_at: ['Data inválida.'] });
  const settings = await loadSettings(ctx, ctx.membership.organization_id);
  const dt = (s: string) => (s ? zonedIso(s.slice(0, 10), s.slice(11, 16), settings.timezone) : null);
  const publishAt = dt(v.publish_at);
  const expiresAt = dt(v.expires_at);
  if (publishAt && expiresAt && expiresAt <= publishAt) return fail('A expiração deve ser depois da publicação.', { expires_at: ['Deve ser depois da publicação.'] });
  const { data, error } = await ctx.supabase.from('announcements').insert({ organization_id: ctx.membership.organization_id, title: v.title, body: v.body, audience: v.audience, expires_at: expiresAt }).select('id').single();
  if (error) return fail(dbMessage(error));
  const id = (data as { id: string }).id;
  const pub = await ctx.supabase.rpc('pt_announcement_publish', { p_id: id, p_recipients: v.audience === 'selected' ? v.recipients : null, p_publish_at: publishAt });
  if (pub.error) {
    // não deixa um rascunho órfão visível: remove o que acabou de criar
    await ctx.supabase.from('announcements').update({ archived_at: new Date().toISOString() }).eq('id', id);
    return fail(dbMessage(pub.error));
  }
  bust('/comunicados', '/portal/comunicados', '/portal');
  return { ...succeed(publishAt && Date.parse(publishAt) > Date.now() ? 'Comunicado agendado.' : 'Comunicado publicado.'), id };
}

export async function archiveAnnouncement(id: string): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { data, error } = await ctx.supabase.from('announcements').update({ archived_at: new Date().toISOString() }).eq('id', id).eq('organization_id', ctx.membership.organization_id).select('id');
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail('Você não tem permissão para esta ação.');
  bust('/comunicados', '/portal/comunicados', '/portal');
  return succeed('Comunicado arquivado.');
}

// ===================================================================== convites e usuários
export async function createInvite(input: unknown): Promise<SaveResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const auth = await actor({ staff: v.kind === 'staff' ? STAFF_ADMINS : STAFF_MANAGERS, client: v.kind === 'client' });
  if ('error' in auth) return auth.error;
  const a = auth.actor;
  const client = a.kind === 'client' ? a.ctx.account.client_account_id : v.client;
  const { data, error } = await dbOf(a).rpc('pt_invite_create', { p_org: orgOf(a), p_kind: v.kind, p_client: v.kind === 'client' ? client : null, p_email: v.email, p_role: v.role });
  if (error) return fail(dbMessage(error));
  const r = data as { id: string; token: string };
  const link = `${getPublicEnv().NEXT_PUBLIC_APP_URL}/convite/${r.token}`;
  logEvent('info', 'invite.created', { kind: v.kind });
  bust('/clientes', '/equipe', '/portal/equipe');
  // O link só existe aqui: o banco guarda apenas o hash. É mostrado uma única vez.
  return { ...succeed('Convite criado. Copie o link agora: ele não será exibido novamente.'), id: r.id, link };
}

export async function revokeInvite(id: string): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS, client: true });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const { error } = await dbOf(auth.actor).rpc('pt_invite_revoke', { p_id: id });
  if (error) return fail(dbMessage(error));
  bust('/clientes', '/equipe', '/portal/equipe');
  return succeed('Convite revogado.');
}

export async function acceptInvite(token: string): Promise<ActionState & { redirectTo?: string }> {
  const t = inviteTokenSchema.safeParse(token);
  const generic = 'Convite inválido ou expirado.';
  if (!t.success) return fail(generic);
  const { getUser } = await import('@/lib/auth/session');
  const user = await getUser();
  if (!user) return fail('Entre na sua conta para aceitar o convite.');
  // Limite de taxa por usuário: impede varrer tokens. A mensagem de erro é uniforme (não revela se o token existe).
  if (!rateLimit(`invite:${user.id}`, AUTH_LIMITS.login).allowed) return fail('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const { createSupabaseServer } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc('pt_invite_accept', { p_token: t.data });
  if (error) return fail(error.code === '28000' ? 'Sua sessão expirou. Entre novamente.' : generic);
  const r = data as { kind: 'client' | 'staff'; client_account_id: string | null };
  if (r.kind === 'client' && r.client_account_id) {
    (await cookies()).set(CLIENT_COOKIE, r.client_account_id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  bustAll();
  return { ...succeed('Convite aceito!'), redirectTo: r.kind === 'client' ? '/portal' : '/dashboard' };
}

export async function setClientMember(memberId: string, input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_MANAGERS, client: true });
  if ('error' in auth) return auth.error;
  if (!idSchema.safeParse(memberId).success) return fail('Registro inválido.');
  const parsed = clientMemberSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { error } = await dbOf(auth.actor).rpc('pt_client_member_set', { p_member: memberId, p_status: parsed.data.status, p_role: parsed.data.role });
  if (error) return fail(dbMessage(error));
  bust('/clientes', '/portal/equipe');
  return succeed('Usuário atualizado.');
}

// ===================================================================== configurações do portal
export async function savePortalSettings(input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_ADMINS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  const parsed = portalSettingsSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { error } = await ctx.supabase.from('portal_settings').update(parsed.data).eq('organization_id', ctx.membership.organization_id);
  if (error) return fail(dbMessage(error));
  bustAll();
  bust('/configuracoes');
  return succeed('Configurações salvas.');
}

export async function saveCategory(id: string | null, input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_ADMINS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const org = ctx.membership.organization_id;
  const { error } = id
    ? await ctx.supabase.from('service_categories').update(parsed.data).eq('id', id).eq('organization_id', org)
    : await ctx.supabase.from('service_categories').insert({ organization_id: org, ...parsed.data });
  if (error) return fail(dbMessage(error, 'Já existe uma categoria com este nome.'));
  bust('/configuracoes');
  return succeed('Categoria salva.');
}

export async function saveSla(id: string, input: unknown): Promise<ActionState> {
  const auth = await actor({ staff: STAFF_ADMINS });
  if ('error' in auth) return auth.error;
  const { ctx } = auth.actor as Extract<Actor, { kind: 'staff' }>;
  if (!idSchema.safeParse(id).success) return fail('Registro inválido.');
  const parsed = slaSchema.safeParse(input);
  if (!parsed.success) return fail('Verifique os campos.', fieldErrorsFrom(parsed.error));
  const { error } = await ctx.supabase.from('service_level_policies').update(parsed.data).eq('id', id).eq('organization_id', ctx.membership.organization_id);
  if (error) return fail(dbMessage(error));
  bust('/configuracoes');
  return succeed('Prazo do nível de serviço atualizado. Vale para solicitações novas e para mudanças de prioridade.');
}

// ===================================================================== notificações e conta ativa
export async function markNotificationsRead(ids: string[] | 'all'): Promise<ActionState> {
  const auth = await actor({ staff: ['owner', 'admin', 'manager', 'member', 'viewer'], client: true });
  if ('error' in auth) return auth.error;
  const db = dbOf(auth.actor);
  let q = db.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids !== 'all') {
    const valid = z.array(z.uuid()).max(200).safeParse(ids);
    if (!valid.success) return fail('Registro inválido.');
    q = q.in('id', valid.data);
  }
  const { error } = await q;
  if (error) return fail(dbMessage(error));
  bustAll();
  bust('/notificacoes', '/portal/notificacoes');
  return succeed('Notificações marcadas como lidas.');
}

export async function saveNotificationPrefs(muted: string[]): Promise<ActionState> {
  const auth = await actor({ staff: ['owner', 'admin', 'manager', 'member', 'viewer'], client: true });
  if ('error' in auth) return auth.error;
  const valid = z.array(z.string().regex(/^[a-z_]{1,40}$/)).max(20).safeParse(muted);
  if (!valid.success) return fail('Preferências inválidas.');
  const userId = auth.actor.ctx.user.id;
  const { error } = await dbOf(auth.actor).from('notification_preferences').upsert({ user_id: userId, muted_types: valid.data }, { onConflict: 'user_id' });
  if (error) return fail(dbMessage(error));
  bust('/notificacoes', '/portal/notificacoes');
  return succeed('Preferências salvas.');
}

export async function switchClientAccount(formData: FormData): Promise<void> {
  const auth = await actionPortalContext();
  if (!('ctx' in auth)) return;
  const wanted = String(formData.get('client_account_id') ?? '');
  const account: ClientAccount | undefined = auth.ctx.accounts.find((a) => a.client_account_id === wanted); // só contas em que o usuário é membro ativo
  if (!account) return;
  (await cookies()).set(CLIENT_COOKIE, account.client_account_id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/portal', 'layout');
}

/** Rotina de avisos (prazo próximo/vencido, comunicados agendados). Idempotente; chamada ao abrir o painel. */
export async function runRefresh(): Promise<void> {
  const s = await actionContext(STAFF_MANAGERS);
  if (!('ctx' in s)) return;
  await s.ctx.supabase.rpc('pt_refresh', { p_org: s.ctx.membership.organization_id });
}
