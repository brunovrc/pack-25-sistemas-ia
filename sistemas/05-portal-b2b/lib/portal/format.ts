// Rótulos, formatação e tons do Portal B2B (pt-BR). Datas de calendário ('YYYY-MM-DD') nunca passam por fuso;
// instantes usam o fuso configurado do portal. Nenhum estado é comunicado só por cor: o texto sempre acompanha.
import { safeTimezone } from './filters';

export type Tone = 'success' | 'danger' | 'warning' | 'neutral';

export const REQUEST_STATUSES = ['open', 'in_review', 'in_progress', 'waiting_client', 'waiting_provider', 'completed', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Aberta', in_review: 'Em análise', in_progress: 'Em andamento', waiting_client: 'Aguardando cliente',
  waiting_provider: 'Aguardando prestadora', completed: 'Concluída', cancelled: 'Cancelada',
};
export const CLIENT_STATUS_LABELS: Record<RequestStatus, string> = { ...STATUS_LABELS, waiting_client: 'Aguardando você', waiting_provider: 'Aguardando a equipe' };
export const FINAL_STATUSES: readonly RequestStatus[] = ['completed', 'cancelled'];
export const isFinal = (s: string) => (FINAL_STATUSES as readonly string[]).includes(s);

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

export const DELIVERABLE_STATUSES = ['draft', 'in_preparation', 'ready', 'published', 'acknowledged', 'cancelled'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const DELIVERABLE_LABELS: Record<DeliverableStatus, string> = {
  draft: 'Rascunho', in_preparation: 'Em preparação', ready: 'Pronta para publicar', published: 'Publicada', acknowledged: 'Recebimento confirmado', cancelled: 'Cancelada',
};

export const VISIBILITY_LABELS = { internal: 'Interno (só a equipe)', client: 'Compartilhado com o cliente' } as const;
export const COMMENT_VISIBILITY_LABELS = { shared: 'Compartilhado com o cliente', internal: 'Interno (só a equipe)' } as const;
export const STAFF_ROLE_LABELS = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gestor', member: 'Colaborador', viewer: 'Leitor' } as const;
export const CLIENT_ROLE_LABELS = { client_admin: 'Administrador do cliente', client_user: 'Usuário do cliente' } as const;
export const DUE_KIND_LABELS = { policy: 'Prazo do nível de serviço', agreed: 'Prazo combinado', estimate: 'Estimativa da equipe' } as const;
export const CLIENT_ACCOUNT_STATUS_LABELS = { active: 'Ativa', inactive: 'Inativa' } as const;

export function statusTone(s: string): Tone {
  return s === 'completed' ? 'success' : s === 'cancelled' ? 'neutral' : s === 'waiting_client' || s === 'waiting_provider' ? 'warning' : 'neutral';
}
export function priorityTone(p: string): Tone {
  return p === 'urgent' ? 'danger' : p === 'high' ? 'warning' : 'neutral';
}
export function deliverableTone(s: string): Tone {
  return s === 'acknowledged' ? 'success' : s === 'published' ? 'warning' : 'neutral';
}

const int = new Intl.NumberFormat('pt-BR');
const dec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatInt(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : int.format(v);
}
/** Percentual com uma casa; sem dados vira "—", nunca "0%". */
export function formatPct(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${dec.format(v)}%`;
}
/** Horas -> "3,5 h", ou "2 d 4 h" a partir de 48 h. Sem dados: "—". */
export function formatHours(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v >= 48) {
    const d = Math.floor(v / 24);
    const h = Math.round(v - d * 24);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  return `${dec.format(v)} h`;
}
export function formatDateTime(value: string | null | undefined, tz?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: safeTimezone(tz) }).format(d);
}
export function formatDay(value: string | null | undefined, tz?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: safeTimezone(tz) }).format(d);
}
/** 'YYYY-MM-DD' -> 'DD/MM/AAAA' sem deslocamento de fuso. */
export function formatDate(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${dec.format(n / 1024)} KB`;
  return `${dec.format(n / 1048576)} MB`;
}
export function formatDocument(value: string | null | undefined): string {
  const d = (value ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/** Número da solicitação como o usuário vê: SOL-0042. */
export const requestCode = (n: number) => `SOL-${String(n).padStart(4, '0')}`;

export type DueInfo = { label: string; tone: Tone; late: boolean };
/** Situação do prazo de uma solicitação ABERTA (concluída/cancelada não têm prazo corrente). `soonHours` vem das configurações. */
export function dueInfo(r: { status: string; due_at: string | null }, nowMs: number, soonHours = 24, tz?: string): DueInfo {
  if (isFinal(r.status)) return { label: '—', tone: 'neutral', late: false };
  if (!r.due_at) return { label: 'Sem prazo', tone: 'neutral', late: false };
  const diff = Date.parse(r.due_at) - nowMs;
  if (diff < 0) return { label: `Atrasada (${formatDateTime(r.due_at, tz)})`, tone: 'danger', late: true };
  if (diff <= soonHours * 3_600_000) return { label: `Vence em breve (${formatDateTime(r.due_at, tz)})`, tone: 'warning', late: false };
  return { label: formatDateTime(r.due_at, tz), tone: 'neutral', late: false };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Rótulo do ponto da série: dia/semana -> "31/08"; mês -> "set/26". */
export function bucketLabel(bucket: string, granularity: string): string {
  const [y, m, d] = bucket.split('-');
  if (!y || !m || !d) return bucket;
  return granularity === 'month' ? `${MONTHS[Number(m) - 1] ?? m}/${y.slice(2)}` : `${d}/${m}`;
}

export function variationPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  request_created: 'Nova solicitação', request_assigned: 'Solicitação atribuída', request_status: 'Mudança de situação', request_comment: 'Novo comentário',
  request_reopened: 'Solicitação reaberta', deadline_soon: 'Prazo próximo', deadline_breached: 'Prazo vencido', deliverable_published: 'Entrega publicada',
  deliverable_acknowledged: 'Recebimento confirmado', document_shared: 'Documento compartilhado', announcement: 'Comunicado', invitation_accepted: 'Convite aceito',
  client_waiting: 'Cliente respondeu',
};
