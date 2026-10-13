// Esquemas Zod do Portal B2B. O MESMO esquema valida no navegador (conforto) e no servidor (barreira); o banco repete as regras.
import { z } from 'zod';
import { DELIVERABLE_STATUSES, PRIORITIES, REQUEST_STATUSES } from './format';

const text = (label: string, min: number, max: number) =>
  z.string().trim().min(min, min === 1 ? `Informe ${label}.` : `${label}: mínimo de ${min} caracteres.`).max(max, `${label}: máximo de ${max} caracteres.`);
const optText = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`).transform((v) => (v === '' ? null : v)).nullable().optional();
const id = z.uuid('Registro inválido.');
const optId = z.union([z.literal('').transform(() => null), id]).nullable().optional().transform((v) => v ?? null);

const digits = (v: string) => v.replace(/\D/g, '');
function validCpf(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}
function validCnpj(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  for (const n of [12, 13]) {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * w[i]!;
    const r = sum % 11;
    if ((r < 2 ? 0 : 11 - r) !== Number(d[n])) return false;
  }
  return true;
}
export const documentNumberSchema = z.string().trim().transform(digits).refine((d) => d === '' || validCpf(d) || validCnpj(d), 'CPF ou CNPJ inválido.').transform((d) => (d === '' ? null : d)).nullable().optional();

export const clientAccountSchema = z.object({
  name: text('o nome da empresa', 2, 120),
  legal_name: optText(160),
  document_number: documentNumberSchema,
  email: z.string().trim().toLowerCase().max(254).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'E-mail inválido.').transform((v) => (v === '' ? null : v)).nullable().optional(),
  phone: optText(30),
  status: z.enum(['active', 'inactive']).default('active'),
  assigned_manager_id: optId,
});
export type ClientAccountInput = z.input<typeof clientAccountSchema>;

export const internalNotesSchema = z.object({ notes: z.string().trim().max(4000, 'Máximo de 4000 caracteres.') });

// ----------------------------------------------------------------------------------------------- solicitações
export const requestCreateSchema = z.object({
  client: id,
  title: text('o título', 3, 160),
  description: z.string().trim().max(8000, 'Máximo de 8000 caracteres.').default(''),
  category: optId,
  priority: z.enum(PRIORITIES).default('normal'),
  assigned_to: optId,
});
export type RequestCreateInput = z.input<typeof requestCreateSchema>;

export const requestEditSchema = z.object({
  title: text('o título', 3, 160),
  description: z.string().trim().max(8000, 'Máximo de 8000 caracteres.').default(''),
  category: optId,
  priority: z.enum(PRIORITIES),
});
export type RequestEditInput = z.input<typeof requestEditSchema>;

export const commentSchema = z.object({
  body: text('o comentário', 1, 5000),
  visibility: z.enum(['shared', 'internal']).default('shared'),
});
export type CommentInput = z.input<typeof commentSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  reason: z.string().trim().max(500, 'Máximo de 500 caracteres.').default(''),
});
export type StatusChangeInput = z.input<typeof statusChangeSchema>;

export const dueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe a hora.'),
  kind: z.enum(['agreed', 'estimate']),
  reason: text('o motivo', 3, 300),
});
export type DueInput = z.input<typeof dueSchema>;

// ----------------------------------------------------------------------------------------------- documentos
export const folderSchema = z.object({
  name: text('o nome da pasta', 1, 80).refine((v) => !/[\\/]/.test(v), 'O nome não pode ter barras.'),
  parent: optId,
  visibility: z.enum(['internal', 'client']).default('client'),
});
export type FolderInput = z.input<typeof folderSchema>;

export const uploadMetaSchema = z.object({
  client: id,
  folder: optId,
  title: z.string().trim().max(160).default(''),
  description: z.string().trim().max(600).default(''),
  visibility: z.enum(['internal', 'client']).default('client'),
  request: optId,
  comment: optId,
  deliverable: optId,
});

// ----------------------------------------------------------------------------------------------- entregas e comunicados
export const deliverableSchema = z.object({
  client: id,
  request: optId,
  title: text('o título', 3, 160),
  description: z.string().trim().max(4000, 'Máximo de 4000 caracteres.').default(''),
});
export type DeliverableInput = z.input<typeof deliverableSchema>;
export const deliverableUpdateSchema = deliverableSchema.pick({ title: true, description: true });
export const deliverableStatusSchema = z.enum(DELIVERABLE_STATUSES);

export const announcementSchema = z.object({
  title: text('o título', 3, 160),
  body: text('a mensagem', 1, 8000),
  audience: z.enum(['all', 'selected']),
  recipients: z.array(id).default([]),
  publish_at: z.string().default(''),
  expires_at: z.string().default(''),
}).refine((v) => v.audience === 'all' || v.recipients.length > 0, { path: ['recipients'], message: 'Escolha ao menos um cliente.' });
export type AnnouncementInput = z.input<typeof announcementSchema>;

// ----------------------------------------------------------------------------------------------- convites e equipe
export const inviteSchema = z.object({
  kind: z.enum(['client', 'staff']),
  client: optId,
  email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'E-mail inválido.'),
  role: z.enum(['client_admin', 'client_user', 'admin', 'manager', 'member', 'viewer']),
}).refine((v) => (v.kind === 'client') === (v.role === 'client_admin' || v.role === 'client_user'), { path: ['role'], message: 'Papel incompatível com o tipo de convite.' })
  .refine((v) => v.kind === 'staff' || v.client !== null, { path: ['client'], message: 'Escolha a empresa.' });
export type InviteInput = z.input<typeof inviteSchema>;

export const inviteTokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{20,128}$/, 'Convite inválido ou expirado.');

export const clientMemberSchema = z.object({ status: z.enum(['active', 'inactive']), role: z.enum(['client_admin', 'client_user']) });

// ----------------------------------------------------------------------------------------------- configurações
const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.');
export const portalSettingsSchema = z.object({
  portal_name: text('o nome do portal', 2, 80),
  welcome_message: optText(600),
  footer_text: optText(300),
  contact_email: z.string().trim().toLowerCase().max(254).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'E-mail inválido.').transform((v) => (v === '' ? null : v)).nullable().optional(),
  contact_phone: optText(30),
  primary_color: hex,
  secondary_color: hex,
  timezone: z.string().trim().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; } }, 'Fuso horário inválido.'),
  business_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia útil.').max(7),
  business_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.'),
  business_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.'),
  alert_due_soon_hours: z.coerce.number().int().min(1).max(720),
  alert_stale_days: z.coerce.number().int().min(1).max(90),
  reopen_window_days: z.coerce.number().int().min(0).max(365),
  doc_max_mb: z.coerce.number().int().min(1).max(50),
}).refine((v) => v.business_start < v.business_end, { path: ['business_end'], message: 'O fim do expediente deve ser depois do início.' });
export type PortalSettingsInput = z.input<typeof portalSettingsSchema>;

export const categorySchema = z.object({ name: text('o nome', 2, 80), description: optText(300), active: z.boolean().default(true) });
export const slaSchema = z.object({ target_hours: z.coerce.number().int().min(1, 'Mínimo de 1 hora.').max(2000, 'Máximo de 2000 horas.'), active: z.boolean().default(true) });
export type CategoryInput = z.input<typeof categorySchema>;
export type SlaInput = z.input<typeof slaSchema>;

export const notificationPrefsSchema = z.object({ muted: z.array(z.string().regex(/^[a-z_]{1,40}$/)).max(20) });
