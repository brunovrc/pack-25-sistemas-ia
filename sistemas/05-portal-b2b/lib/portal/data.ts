import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeTimezone } from './filters';

// Leituras do Portal B2B. Servem à equipe E ao cliente: quem decide o que cada um enxerga é o RLS do banco
// (nunca um filtro daqui). Os filtros abaixo são de UX; um ID de outra empresa simplesmente devolve vazio.
type Db = { supabase: SupabaseClient };

export const PAGE_SIZE = 20;
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}
/** Termo de busca seguro para filtros PostgREST: só letras, números, espaço e . _ - @. */
export function searchToken(q: string | string[] | undefined): string {
  const v = (Array.isArray(q) ? q[0] : q) ?? '';
  return v.normalize('NFC').replace(/[^\p{L}\p{N} ._@-]/gu, '').trim().slice(0, 60);
}

// ------------------------------------------------------------------ tipos
export type Settings = {
  organization_id: string; portal_name: string; welcome_message: string | null; footer_text: string | null; contact_email: string | null; contact_phone: string | null;
  primary_color: string; secondary_color: string; timezone: string; business_days: number[]; business_start: string; business_end: string;
  alert_due_soon_hours: number; alert_stale_days: number; reopen_window_days: number; doc_max_mb: number;
};
export const SETTINGS_COLUMNS = 'organization_id, portal_name, welcome_message, footer_text, contact_email, contact_phone, primary_color, secondary_color, timezone, business_days, business_start, business_end, alert_due_soon_hours, alert_stale_days, reopen_window_days, doc_max_mb';
export type Person = { user_id: string; label: string; kind: string };
export type Category = { id: string; name: string; description: string | null; active: boolean };
export type Policy = { id: string; name: string; priority: string; target_hours: number; active: boolean };
export type ClientRow = {
  id: string; name: string; legal_name: string | null; document_number: string | null; email: string | null; phone: string | null; status: 'active' | 'inactive';
  assigned_manager_id: string | null; created_at: string; archived_at: string | null;
};
export const CLIENT_COLUMNS = 'id, name, legal_name, document_number, email, phone, status, assigned_manager_id, created_at, archived_at';
export type RequestRow = {
  id: string; client_account_id: string; number: number; category_id: string | null; title: string; description: string | null; status: string; priority: string;
  created_by: string | null; assigned_to: string | null; due_at: string | null; due_kind: string | null; started_at: string | null; completed_at: string | null;
  closed_at: string | null; reopened_count: number; last_activity_at: string; created_at: string;
};
export const REQUEST_COLUMNS = 'id, client_account_id, number, category_id, title, description, status, priority, created_by, assigned_to, due_at, due_kind, started_at, completed_at, closed_at, reopened_count, last_activity_at, created_at';
export type CommentRow = { id: string; author_id: string | null; body: string; visibility: 'shared' | 'internal'; created_at: string };
export type HistoryRow = { id: number; previous_status: string | null; new_status: string; changed_by: string | null; reason: string | null; changed_at: string };
export type DeadlineEvent = { id: number; due_kind: string; target_at: string | null; reason: string | null; breached_at: string | null; changed_by: string | null; calculated_at: string };
export type DocumentRow = {
  id: string; client_account_id: string; folder_id: string | null; title: string; description: string | null; original_file_name: string; mime_type: string; size_bytes: number;
  visibility: 'internal' | 'client'; uploaded_by: string | null; created_at: string; archived_at: string | null;
};
export const DOCUMENT_COLUMNS = 'id, client_account_id, folder_id, title, description, original_file_name, mime_type, size_bytes, visibility, uploaded_by, created_at, archived_at';
export type FolderRow = { id: string; client_account_id: string; parent_folder_id: string | null; name: string; visibility: 'internal' | 'client'; created_at: string; archived_at: string | null };
export type DeliverableRow = {
  id: string; client_account_id: string; request_id: string | null; title: string; description: string | null; status: string; delivered_at: string | null;
  acknowledged_at: string | null; acknowledged_by: string | null; published_by: string | null; created_at: string;
};
export const DELIVERABLE_COLUMNS = 'id, client_account_id, request_id, title, description, status, delivered_at, acknowledged_at, acknowledged_by, published_by, created_at';
export type AnnouncementRow = {
  id: string; title: string; body: string; audience: 'all' | 'selected'; published_at: string | null; expires_at: string | null; archived_at: string | null; created_at: string;
};
export const ANNOUNCEMENT_COLUMNS = 'id, title, body, audience, published_at, expires_at, archived_at, created_at';
export type NotificationRow = {
  id: string; type: string; title: string; body: string | null; resource_type: string | null; resource_id: string | null; read_at: string | null; created_at: string;
};
export type MemberRow = { id: string; client_account_id: string; user_id: string; role: 'client_admin' | 'client_user'; status: 'active' | 'inactive'; joined_at: string };
export type InviteRow = {
  id: string; kind: 'client' | 'staff'; client_account_id: string | null; invited_email: string; invited_role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string;
};
export const INVITE_COLUMNS = 'id, kind, client_account_id, invited_email, invited_role, expires_at, accepted_at, revoked_at, created_at';
export type AccessLogRow = { id: number; document_id: string; user_id: string | null; action: string; occurred_at: string };

export const labelMap = (people: Person[]) => new Map(people.map((p) => [p.user_id, p.label]));
export const personOptions = (people: Person[], kinds?: string[]) => people.filter((p) => !kinds || kinds.includes(p.kind)).map((p) => ({ value: p.user_id, label: p.label }));

// ------------------------------------------------------------------ configuração e cadastros de apoio
const DEFAULT_SETTINGS: Omit<Settings, 'organization_id'> = {
  portal_name: 'Portal do Cliente', welcome_message: null, footer_text: null, contact_email: null, contact_phone: null, primary_color: '#162A43', secondary_color: '#22D3EE',
  timezone: 'America/Sao_Paulo', business_days: [1, 2, 3, 4, 5], business_start: '09:00', business_end: '18:00', alert_due_soon_hours: 24, alert_stale_days: 7,
  reopen_window_days: 15, doc_max_mb: 20,
};

export async function loadSettings(db: Db, org: string): Promise<Settings> {
  const { data } = await db.supabase.from('portal_settings').select(SETTINGS_COLUMNS).eq('organization_id', org).maybeSingle();
  const s = { ...DEFAULT_SETTINGS, organization_id: org, ...((data as Partial<Settings> | null) ?? {}) } as Settings;
  s.timezone = safeTimezone(s.timezone);
  s.business_start = String(s.business_start).slice(0, 5);
  s.business_end = String(s.business_end).slice(0, 5);
  return s;
}

/** Nomes de pessoas: equipe e usuários das contas visíveis ao chamador (a função SQL já filtra pelo papel). */
export async function loadPeople(db: Db, org: string): Promise<Person[]> {
  const { data } = await db.supabase.rpc('pt_user_labels', { p_org: org });
  return ((data ?? []) as Person[]).map((p) => ({ user_id: p.user_id, label: p.label, kind: p.kind }));
}
export async function loadCategories(db: Db, org: string, onlyActive = true): Promise<Category[]> {
  let q = db.supabase.from('service_categories').select('id, name, description, active').eq('organization_id', org).order('name');
  if (onlyActive) q = q.eq('active', true);
  return ((await q).data ?? []) as Category[];
}
export async function loadPolicies(db: Db, org: string): Promise<Policy[]> {
  const { data } = await db.supabase.from('service_level_policies').select('id, name, priority, target_hours, active').eq('organization_id', org).order('target_hours');
  return (data ?? []) as Policy[];
}
export async function loadClientOptions(db: Db, org: string, includeInactive = false): Promise<Array<{ id: string; name: string }>> {
  let q = db.supabase.from('client_accounts').select('id, name').eq('organization_id', org).is('archived_at', null).order('name');
  if (!includeInactive) q = q.eq('status', 'active');
  return ((await q).data ?? []) as Array<{ id: string; name: string }>;
}

// ------------------------------------------------------------------ clientes (empresas)
export async function listClients(db: Db, org: string, o: { q: string; status: string; page: number }) {
  let q = db.supabase.from('client_accounts').select(CLIENT_COLUMNS, { count: 'exact' }).eq('organization_id', org).is('archived_at', null).order('name');
  if (o.q) q = q.ilike('name', `%${o.q}%`);
  if (o.status === 'active' || o.status === 'inactive') q = q.eq('status', o.status);
  const from = (o.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as ClientRow[], total: count ?? 0, error: Boolean(error) };
}
export async function getClient(db: Db, org: string, id: string): Promise<ClientRow | null> {
  const { data } = await db.supabase.from('client_accounts').select(CLIENT_COLUMNS).eq('organization_id', org).eq('id', id).maybeSingle();
  return (data as ClientRow | null) ?? null;
}
export async function getInternalNotes(db: Db, id: string): Promise<string> {
  const { data } = await db.supabase.from('client_internal_notes').select('notes').eq('client_account_id', id).maybeSingle();
  return ((data as { notes: string | null } | null)?.notes) ?? '';
}
export async function listMembers(db: Db, clientId: string): Promise<MemberRow[]> {
  const { data } = await db.supabase.from('client_members').select('id, client_account_id, user_id, role, status, joined_at').eq('client_account_id', clientId).order('joined_at');
  return (data ?? []) as MemberRow[];
}
export async function listInvites(db: Db, org: string, o: { clientId?: string; kind?: 'client' | 'staff' }): Promise<InviteRow[]> {
  let q = db.supabase.from('invitation_tokens').select(INVITE_COLUMNS).eq('organization_id', org).order('created_at', { ascending: false }).limit(100);
  if (o.clientId) q = q.eq('client_account_id', o.clientId);
  if (o.kind) q = q.eq('kind', o.kind);
  return ((await q).data ?? []) as InviteRow[];
}

// ------------------------------------------------------------------ solicitações
export type RequestListOptions = {
  q: string; status: string; priority: string; client: string; assignee: string; category: string; view: string; page: number; today?: number; soonHours?: number; staleDays?: number;
};
/** `view`: atrasadas | vencendo | paradas | sem_responsavel | minhas (a partir do usuário). */
export async function listRequests(db: Db, org: string, o: RequestListOptions, userId?: string) {
  let q = db.supabase.from('requests').select(REQUEST_COLUMNS, { count: 'exact' }).eq('organization_id', org);
  const m = /^(?:sol-?)?(\d{1,9})$/i.exec(o.q.trim());
  if (o.q) q = m ? q.eq('number', Number(m[1])) : q.ilike('title', `%${o.q}%`);
  if (o.status) q = q.eq('status', o.status);
  if (o.priority) q = q.eq('priority', o.priority);
  if (o.client) q = q.eq('client_account_id', o.client);
  if (o.category) q = q.eq('category_id', o.category);
  if (o.assignee === 'none') q = q.is('assigned_to', null);
  else if (o.assignee) q = q.eq('assigned_to', o.assignee);
  const now = o.today ?? Date.now();
  const open = '(completed,cancelled)';
  if (o.view === 'atrasadas') q = q.not('status', 'in', open).lt('due_at', new Date(now).toISOString());
  if (o.view === 'vencendo') q = q.not('status', 'in', open).gte('due_at', new Date(now).toISOString()).lte('due_at', new Date(now + (o.soonHours ?? 24) * 3_600_000).toISOString());
  if (o.view === 'paradas') q = q.not('status', 'in', open).lt('last_activity_at', new Date(now - (o.staleDays ?? 7) * 86_400_000).toISOString());
  if (o.view === 'sem_responsavel') q = q.not('status', 'in', open).is('assigned_to', null);
  if (o.view === 'aguardando_prestadora') q = q.eq('status', 'waiting_provider');
  if (o.view === 'minhas' && userId) q = q.eq('assigned_to', userId).not('status', 'in', open);
  const from = (o.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.order('last_activity_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as RequestRow[], total: count ?? 0, error: Boolean(error) };
}

export async function getRequest(db: Db, org: string, id: string): Promise<RequestRow | null> {
  const { data } = await db.supabase.from('requests').select(REQUEST_COLUMNS).eq('organization_id', org).eq('id', id).maybeSingle();
  return (data as RequestRow | null) ?? null;
}
export async function getRequestThread(db: Db, id: string) {
  const [c, h, d, a, dl] = await Promise.all([
    db.supabase.from('request_comments').select('id, author_id, body, visibility, created_at').eq('request_id', id).order('created_at'),
    db.supabase.from('request_status_history').select('id, previous_status, new_status, changed_by, reason, changed_at').eq('request_id', id).order('changed_at'),
    db.supabase.from('request_deadline_events').select('id, due_kind, target_at, reason, breached_at, changed_by, calculated_at').eq('request_id', id).order('calculated_at'),
    db.supabase.from('request_attachments').select('id, comment_id, document_id, documents(id, title, original_file_name, mime_type, size_bytes, visibility)').eq('request_id', id),
    db.supabase.from('deliverables').select('id, title, status').eq('request_id', id),
  ]);
  type Att = { id: string; comment_id: string | null; document_id: string; documents: { id: string; title: string; original_file_name: string; mime_type: string; size_bytes: number; visibility: string } | { id: string; title: string; original_file_name: string; mime_type: string; size_bytes: number; visibility: string }[] | null };
  const attachments = ((a.data ?? []) as unknown as Att[]).flatMap((x) => {
    const doc = Array.isArray(x.documents) ? x.documents[0] : x.documents;
    return doc ? [{ id: x.id, comment_id: x.comment_id, document: doc }] : [];
  });
  return {
    comments: (c.data ?? []) as CommentRow[],
    history: (h.data ?? []) as HistoryRow[],
    deadlines: (d.data ?? []) as DeadlineEvent[],
    attachments,
    deliverables: (dl.data ?? []) as Array<{ id: string; title: string; status: string }>,
  };
}

/** Solicitações em aberto de uma empresa (para vincular entregas e documentos). */
export async function requestOptions(db: Db, clientId: string): Promise<Array<{ value: string; label: string }>> {
  const { data } = await db.supabase.from('requests').select('id, number, title').eq('client_account_id', clientId).order('number', { ascending: false }).limit(100);
  return ((data ?? []) as Array<{ id: string; number: number; title: string }>).map((r) => ({ value: r.id, label: `SOL-${String(r.number).padStart(4, '0')} · ${r.title}` }));
}

// ------------------------------------------------------------------ documentos
export async function listFolders(db: Db, clientId: string): Promise<FolderRow[]> {
  const { data } = await db.supabase.from('document_folders').select('id, client_account_id, parent_folder_id, name, visibility, created_at, archived_at').eq('client_account_id', clientId).is('archived_at', null).order('name');
  return (data ?? []) as FolderRow[];
}
export async function listDocuments(db: Db, o: { clientId?: string; org: string; folder: string | null | 'any'; q: string; page: number; includeArchived?: boolean }) {
  let q = db.supabase.from('documents').select(DOCUMENT_COLUMNS, { count: 'exact' }).eq('organization_id', o.org);
  if (o.clientId) q = q.eq('client_account_id', o.clientId);
  if (!o.includeArchived) q = q.is('archived_at', null);
  if (o.folder === null) q = q.is('folder_id', null);
  else if (o.folder !== 'any') q = q.eq('folder_id', o.folder);
  if (o.q) q = q.ilike('title', `%${o.q}%`);
  const from = (o.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as DocumentRow[], total: count ?? 0, error: Boolean(error) };
}
export async function listAccessLogs(db: Db, clientId: string, limit = 50): Promise<AccessLogRow[]> {
  const { data } = await db.supabase.from('document_access_logs').select('id, document_id, user_id, action, occurred_at').eq('client_account_id', clientId).order('occurred_at', { ascending: false }).limit(limit);
  return (data ?? []) as AccessLogRow[];
}

// ------------------------------------------------------------------ entregas, comunicados, notificações
export async function listDeliverables(db: Db, org: string, o: { client: string; status: string; page: number }) {
  let q = db.supabase.from('deliverables').select(DELIVERABLE_COLUMNS, { count: 'exact' }).eq('organization_id', org);
  if (o.client) q = q.eq('client_account_id', o.client);
  if (o.status) q = q.eq('status', o.status);
  const from = (o.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as DeliverableRow[], total: count ?? 0, error: Boolean(error) };
}
export async function getDeliverable(db: Db, org: string, id: string) {
  const { data } = await db.supabase.from('deliverables').select(DELIVERABLE_COLUMNS).eq('organization_id', org).eq('id', id).maybeSingle();
  if (!data) return null;
  const { data: files } = await db.supabase.from('deliverable_files').select('document_id, documents(id, title, original_file_name, mime_type, size_bytes, visibility)').eq('deliverable_id', id);
  type F = { document_id: string; documents: DocLite | DocLite[] | null };
  type DocLite = { id: string; title: string; original_file_name: string; mime_type: string; size_bytes: number; visibility: string };
  const docs = ((files ?? []) as unknown as F[]).flatMap((f) => { const d = Array.isArray(f.documents) ? f.documents[0] : f.documents; return d ? [d] : []; });
  return { deliverable: data as DeliverableRow, documents: docs };
}
export async function listAnnouncements(db: Db, org: string, o: { page: number; includeArchived: boolean }) {
  let q = db.supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS, { count: 'exact' }).eq('organization_id', org);
  if (!o.includeArchived) q = q.is('archived_at', null);
  const from = (o.page - 1) * PAGE_SIZE;
  const { data, count } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as AnnouncementRow[], total: count ?? 0 };
}
export async function listAnnouncementRecipients(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const { data } = await db.supabase.from('announcement_recipients').select('announcement_id, client_account_id').in('announcement_id', ids);
  for (const r of (data ?? []) as Array<{ announcement_id: string; client_account_id: string }>) map.set(r.announcement_id, [...(map.get(r.announcement_id) ?? []), r.client_account_id]);
  return map;
}
export async function listNotifications(db: Db, o: { onlyUnread: boolean; page: number }) {
  let q = db.supabase.from('notifications').select('id, type, title, body, resource_type, resource_id, read_at, created_at', { count: 'exact' });
  if (o.onlyUnread) q = q.is('read_at', null);
  const from = (o.page - 1) * PAGE_SIZE;
  const { data, count } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as NotificationRow[], total: count ?? 0 };
}
export async function countUnread(db: Db): Promise<number> {
  const { count } = await db.supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}
export async function loadMutedTypes(db: Db, userId: string): Promise<string[]> {
  const { data } = await db.supabase.from('notification_preferences').select('muted_types').eq('user_id', userId).maybeSingle();
  return ((data as { muted_types: string[] } | null)?.muted_types) ?? [];
}

/** Link interno para o recurso de uma notificação (conforme o painel de origem). */
export function notificationHref(n: { resource_type: string | null; resource_id: string | null }, portal: boolean): string {
  const base = portal ? '/portal' : '';
  if (!n.resource_id) return portal ? '/portal' : '/dashboard';
  switch (n.resource_type) {
    case 'request': return `${base}/solicitacoes/${n.resource_id}`;
    case 'deliverable': return `${base}/entregas/${n.resource_id}`;
    case 'client': return portal ? '/portal' : `/clientes/${n.resource_id}`;
    case 'document': return portal ? '/portal/documentos' : '/documentos';
    case 'announcement': return portal ? '/portal/comunicados' : '/comunicados';
    default: return portal ? '/portal' : '/dashboard';
  }
}
