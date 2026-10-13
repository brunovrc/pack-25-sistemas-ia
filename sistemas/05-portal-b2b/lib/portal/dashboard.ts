import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, daysBetween, rpcArgs, type PtFilters } from './filters';

export type * from './dashboard-types';
import type { AlertCount, AssigneeRow, ClientRank, DashboardData, Kpis, PriorityRow, SeriesPoint, StatusRow } from './dashboard-types';

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
type Rec = Record<string, unknown>;
const rows = (d: unknown): Rec[] => (Array.isArray(d) ? (d as Rec[]) : []);

export function toKpis(row: Rec | undefined): Kpis | null {
  return row ? {
    open_now: num(row.open_now), completed: num(row.completed), overdue: num(row.overdue), due_soon: num(row.due_soon), stale: num(row.stale), on_time_pct: numOrNull(row.on_time_pct),
    avg_resolution_hours: numOrNull(row.avg_resolution_hours), active_clients: num(row.active_clients), deliverables_pending: num(row.deliverables_pending),
    deliverables_published: num(row.deliverables_published), unassigned: num(row.unassigned), created: num(row.created), docs_shared: num(row.docs_shared), awaiting_provider: num(row.awaiting_provider),
  } : null;
}

/** O RLS decide o que cada papel enxerga: o mesmo painel serve à equipe (por escopo) e ao cliente (só a própria conta). */
export async function loadDashboard(db: SupabaseClient, org: string, f: PtFilters): Promise<DashboardData> {
  const base = rpcArgs(org, f);
  const len = daysBetween(f.from, f.to) + 1;
  const prevTo = addDays(f.from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  const common = { p_org: org, p_client: f.client, p_assignee: f.assignee, p_category: f.category };
  const [k, pk, se, st, pr, as, cl, al] = await Promise.all([
    db.rpc('pt_kpis', base),
    db.rpc('pt_kpis', { ...base, p_from: prevFrom, p_to: prevTo }),
    db.rpc('pt_series', base),
    db.rpc('pt_status_distribution', { ...common, p_priority: f.priority }),
    db.rpc('pt_priority_distribution', { ...common, p_status: f.status }),
    db.rpc('pt_by_assignee', { p_org: org, p_from: f.from, p_to: f.to, p_client: f.client }),
    db.rpc('pt_by_client', { p_org: org, p_from: f.from, p_to: f.to }),
    db.rpc('pt_alerts', { p_org: org }),
  ]);
  // rankings são complementares (o cliente pode não ter acesso a «por responsável»); qualquer outro erro é mostrado
  const error = Boolean(k.error || se.error || st.error || pr.error || al.error);
  return {
    error,
    kpis: toKpis(rows(k.data)[0]),
    previous: pk.error ? null : toKpis(rows(pk.data)[0]),
    series: rows(se.data).map((p): SeriesPoint => ({
      bucket: String(p.bucket), granularity: String(p.granularity), created: num(p.created), completed: num(p.completed), on_time: num(p.on_time), late: num(p.late),
      avg_resolution_hours: numOrNull(p.avg_resolution_hours), deliverables_published: num(p.deliverables_published),
    })),
    statuses: rows(st.data).map((p): StatusRow => ({ status: String(p.status), requests: num(p.requests) })),
    priorities: rows(pr.data).map((p): PriorityRow => ({ priority: String(p.priority), requests: num(p.requests) })),
    assignees: as.error ? [] : rows(as.data).map((p): AssigneeRow => ({
      assignee_id: (p.assignee_id as string | null) ?? null, open_requests: num(p.open_requests), completed: num(p.completed), avg_resolution_hours: numOrNull(p.avg_resolution_hours), on_time_pct: numOrNull(p.on_time_pct),
    })),
    clients: cl.error ? [] : rows(cl.data).map((p): ClientRank => ({ client_id: String(p.client_id), name: String(p.name), created: num(p.created), open_requests: num(p.open_requests), overdue: num(p.overdue), completed: num(p.completed) })),
    alerts: rows(al.data).map((p): AlertCount => ({ key: p.key as AlertCount['key'], requests: num(p.requests) })),
  };
}
