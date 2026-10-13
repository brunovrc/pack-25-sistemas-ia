// Preparação (pura e testável) dos dados dos gráficos: rótulos legíveis, números arredondados e nomes de pessoas.
import { bucketLabel, PRIORITIES, PRIORITY_LABELS, REQUEST_STATUSES, STATUS_LABELS, type Priority, type RequestStatus } from './format';
import type { AssigneeRow, ClientRank, PriorityRow, SeriesPoint, StatusRow } from './dashboard-types';

export type FlowRow = { label: string; created: number; completed: number };
export type SlaRow = { label: string; on_time: number; late: number };
export type HoursRow = { label: string; hours: number | null };
export type DeliveryRow = { label: string; published: number };
export type StatusChartRow = { key: string; name: string; value: number };
export type AssigneeChartRow = { name: string; open: number; completed: number };
export type ClientChartRow = { name: string; open: number; overdue: number; completed: number };

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

export const flowRows = (s: SeriesPoint[]): FlowRow[] => s.map((p) => ({ label: bucketLabel(p.bucket, p.granularity), created: p.created, completed: p.completed }));
export const slaRows = (s: SeriesPoint[]): SlaRow[] => s.map((p) => ({ label: bucketLabel(p.bucket, p.granularity), on_time: p.on_time, late: p.late }));
export const hoursRows = (s: SeriesPoint[]): HoursRow[] => s.map((p) => ({ label: bucketLabel(p.bucket, p.granularity), hours: round1(p.avg_resolution_hours) }));
export const deliveryRows = (s: SeriesPoint[]): DeliveryRow[] => s.map((p) => ({ label: bucketLabel(p.bucket, p.granularity), published: p.deliverables_published }));

/** Ordem fixa do fluxo (a função SQL já devolve todas as situações, inclusive as zeradas). */
export function statusRows(rows: StatusRow[], labels: Record<string, string> = STATUS_LABELS): StatusChartRow[] {
  const by = new Map(rows.map((r) => [r.status, r.requests]));
  return REQUEST_STATUSES.map((s: RequestStatus) => ({ key: s, name: labels[s] ?? s, value: by.get(s) ?? 0 }));
}
export function priorityRows(rows: PriorityRow[]): StatusChartRow[] {
  const by = new Map(rows.map((r) => [r.priority, r.requests]));
  return PRIORITIES.map((p: Priority) => ({ key: p, name: PRIORITY_LABELS[p], value: by.get(p) ?? 0 }));
}
export function assigneeRows(rows: AssigneeRow[], labels: Map<string, string>): AssigneeChartRow[] {
  return rows.slice(0, 12).map((r) => ({ name: r.assignee_id ? labels.get(r.assignee_id) ?? 'Usuário' : 'Sem responsável', open: r.open_requests, completed: r.completed }));
}
export function clientRows(rows: ClientRank[]): ClientChartRow[] {
  return rows.slice(0, 12).map((r) => ({ name: r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, open: r.open_requests, overdue: r.overdue, completed: r.completed }));
}

export const ALERT_TITLES = {
  overdue: 'Solicitações atrasadas',
  due_soon: 'Solicitações que vencem em breve',
  awaiting_provider: 'Solicitações aguardando a prestadora',
  unassigned: 'Solicitações em aberto sem responsável',
  stale: 'Solicitações paradas (sem atividade há dias)',
  deliverables_pending: 'Entregas ainda não publicadas',
} as const;
export const ALERT_LINKS: Record<keyof typeof ALERT_TITLES, string> = {
  overdue: '/solicitacoes?view=atrasadas',
  due_soon: '/solicitacoes?view=vencendo',
  awaiting_provider: '/solicitacoes?view=aguardando_prestadora',
  unassigned: '/solicitacoes?view=sem_responsavel',
  stale: '/solicitacoes?view=paradas',
  deliverables_pending: '/entregas',
};
