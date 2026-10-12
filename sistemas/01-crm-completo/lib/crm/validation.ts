// Validação dos formulários do CRM (cliente e servidor usam o MESMO esquema).
// As entradas chegam como texto; a saída já vem normalizada para gravar no banco.
import { z } from 'zod';
import { localInputToIso, parseBRL } from './format';

const text = (min: number, max: number) =>
  z.string().trim().min(min, min <= 1 ? 'Campo obrigatório.' : `Informe ao menos ${min} caracteres.`).max(max, `Máximo de ${max} caracteres.`);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo de ${max} caracteres.`).transform((v) => (v === '' ? null : v));

const optionalUuid = z.union([z.literal(''), z.uuid('Seleção inválida.')]).transform((v) => (v === '' ? null : v));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo.')
  .refine((v) => v === '' || z.email().safeParse(v).success, 'E-mail inválido.')
  .transform((v) => (v === '' ? null : v));

function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}

const requiredDate = z.string().trim().refine(isRealDate, 'Data inválida.');
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === '' || isRealDate(v), 'Data inválida.')
  .transform((v) => (v === '' ? null : v));

const money = z
  .string()
  .trim()
  .refine((v) => parseBRL(v) !== null, 'Informe um valor válido (ex.: 1.500,00).')
  .transform((v) => parseBRL(v) as number)
  .refine((v) => v >= 0 && v < 1_000_000_000_000, 'Valor fora do limite.');

const website = z
  .string()
  .trim()
  .max(200, 'Máximo de 200 caracteres.')
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Use um endereço iniciado por http:// ou https://.')
  .transform((v) => (v === '' ? null : v));

const intInRange = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d{1,4}$/.test(v) && Number(v) >= min && Number(v) <= max, `${label}: informe um número entre ${min} e ${max}.`)
    .transform(Number);

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified'] as const;
export const TEMPERATURES = ['cold', 'warm', 'hot'] as const;
export const ACTIVITY_KINDS = ['task', 'call', 'meeting', 'email', 'note', 'follow_up'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', unqualified: 'Desqualificado', converted: 'Convertido',
};
export const TEMPERATURE_LABELS: Record<string, string> = { cold: 'Frio', warm: 'Morno', hot: 'Quente' };
export const ACTIVITY_KIND_LABELS: Record<string, string> = {
  task: 'Tarefa', call: 'Ligação', meeting: 'Reunião', email: 'E-mail', note: 'Nota', follow_up: 'Follow-up',
};
export const PRIORITY_LABELS: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };

export const leadSchema = z.object({
  name: text(2, 160),
  company_name: optionalText(160),
  email: optionalEmail,
  phone: optionalText(30),
  job_title: optionalText(80),
  source_id: optionalUuid,
  status: z.enum(LEAD_STATUSES, 'Status inválido.'),
  temperature: z.enum(TEMPERATURES, 'Classificação inválida.'),
  owner_id: optionalUuid,
  notes: optionalText(4000),
});

export const companySchema = z.object({
  name: text(2, 160),
  document: optionalText(20),
  website,
  segment: optionalText(80),
  phone: optionalText(30),
  notes: optionalText(4000),
  owner_id: optionalUuid,
});

export const contactSchema = z.object({
  company_id: optionalUuid,
  name: text(2, 160),
  email: optionalEmail,
  phone: optionalText(30),
  job_title: optionalText(80),
  notes: optionalText(4000),
  owner_id: optionalUuid,
});

export const opportunitySchema = z.object({
  title: text(2, 160),
  value: money,
  stage_id: z.uuid('Selecione a etapa.'),
  company_id: optionalUuid,
  contact_id: optionalUuid,
  source_id: optionalUuid,
  expected_close_date: optionalDate,
  probability: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 100), 'Probabilidade: informe de 0 a 100.')
    .transform((v) => (v === '' ? null : Number(v))),
  owner_id: optionalUuid,
  notes: optionalText(4000),
});

export const moveOpportunitySchema = z.object({
  id: z.uuid(),
  stage_id: z.uuid(),
  loss_reason_id: optionalUuid,
  loss_notes: optionalText(2000),
});

export const convertLeadSchema = z.object({
  lead_id: z.uuid(),
  title: text(2, 160),
  value: money,
  stage_id: z.uuid('Selecione a etapa.'),
  expected_close_date: optionalDate,
  company_id: optionalUuid,
  create_company: z.boolean(),
  create_contact: z.boolean(),
});

export const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS, 'Tipo inválido.'),
  title: text(2, 160),
  description: optionalText(4000),
  due_at: z
    .string()
    .trim()
    .refine((v) => v === '' || localInputToIso(v) !== null, 'Data e hora inválidas.')
    .transform((v) => (v === '' ? null : localInputToIso(v))),
  priority: z.enum(PRIORITIES, 'Prioridade inválida.'),
  owner_id: optionalUuid,
  lead_id: optionalUuid,
  contact_id: optionalUuid,
  company_id: optionalUuid,
  opportunity_id: optionalUuid,
});

export const goalSchema = z
  .object({
    scope: z.enum(['user', 'team'], 'Tipo de meta inválido.'),
    user_id: optionalUuid,
    team_id: optionalUuid,
    period_start: requiredDate,
    period_end: requiredDate,
    target_amount: money.refine((v) => v > 0, 'A meta deve ser maior que zero.'),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'user' && !v.user_id) ctx.addIssue({ code: 'custom', path: ['user_id'], message: 'Selecione o vendedor.' });
    if (v.scope === 'team' && !v.team_id) ctx.addIssue({ code: 'custom', path: ['team_id'], message: 'Selecione a equipe.' });
    if (v.period_end < v.period_start) ctx.addIssue({ code: 'custom', path: ['period_end'], message: 'O fim deve ser igual ou posterior ao início.' });
    const days = (Date.parse(`${v.period_end}T00:00:00Z`) - Date.parse(`${v.period_start}T00:00:00Z`)) / 86_400_000;
    if (days > 3660) ctx.addIssue({ code: 'custom', path: ['period_end'], message: 'Período máximo de 10 anos.' });
  });

export const stageSchema = z.object({
  name: text(2, 60),
  position: intInRange(0, 1000, 'Posição'),
  probability: intInRange(0, 100, 'Probabilidade'),
  kind: z.enum(['open', 'won', 'lost']),
  color: z
    .string()
    .trim()
    .refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), 'Cor no formato #RRGGBB.')
    .transform((v) => (v === '' ? null : v.toLowerCase())),
  is_active: z.boolean(),
});

export const nameSchema = z.object({ name: text(2, 80), is_active: z.boolean() });
export const teamSchema = z.object({ name: text(2, 80) });
export const teamMemberSchema = z.object({ team_id: z.uuid(), user_id: z.uuid() });

export const crmSettingsSchema = z.object({
  stale_days: intInRange(1, 365, 'Dias sem atividade'),
  closing_soon_days: intInRange(1, 365, 'Dias para o fechamento'),
});

export type LeadForm = z.input<typeof leadSchema>;
export type CompanyForm = z.input<typeof companySchema>;
export type ContactForm = z.input<typeof contactSchema>;
export type OpportunityForm = z.input<typeof opportunitySchema>;
export type ActivityForm = z.input<typeof activitySchema>;
export type GoalForm = z.input<typeof goalSchema>;
