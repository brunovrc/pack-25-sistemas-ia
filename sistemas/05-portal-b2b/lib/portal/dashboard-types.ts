// Leitura dos indicadores (todos calculados em funções SQL; ver docs/METRICS.md). Nenhum número é fixo.
export type Kpis = {
  open_now: number; completed: number; overdue: number; due_soon: number; stale: number; on_time_pct: number | null; avg_resolution_hours: number | null;
  active_clients: number; deliverables_pending: number; deliverables_published: number; unassigned: number; created: number; docs_shared: number; awaiting_provider: number;
};
export type SeriesPoint = {
  bucket: string; granularity: string; created: number; completed: number; on_time: number; late: number; avg_resolution_hours: number | null; deliverables_published: number;
};
export type StatusRow = { status: string; requests: number };
export type PriorityRow = { priority: string; requests: number };
export type AssigneeRow = { assignee_id: string | null; open_requests: number; completed: number; avg_resolution_hours: number | null; on_time_pct: number | null };
export type ClientRank = { client_id: string; name: string; created: number; open_requests: number; overdue: number; completed: number };
export type AlertCount = { key: 'overdue' | 'due_soon' | 'awaiting_provider' | 'unassigned' | 'stale' | 'deliverables_pending'; requests: number };

export type DashboardData = {
  error: boolean;
  kpis: Kpis | null;
  /** mesmos indicadores no período imediatamente anterior, de igual duração (para a variação) */
  previous: Kpis | null;
  series: SeriesPoint[];
  statuses: StatusRow[];
  priorities: PriorityRow[];
  assignees: AssigneeRow[];
  clients: ClientRank[];
  alerts: AlertCount[];
};
