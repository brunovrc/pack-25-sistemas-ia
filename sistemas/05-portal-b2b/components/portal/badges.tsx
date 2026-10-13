import { Badge } from '@/components/ui/primitives';
import {
  CLIENT_STATUS_LABELS, DELIVERABLE_LABELS, deliverableTone, dueInfo, PRIORITY_LABELS, priorityTone, STATUS_LABELS, statusTone, type DeliverableStatus, type Priority, type RequestStatus,
} from '@/lib/portal/format';

// O texto sempre acompanha a cor: nada depende só de cor.
export function StatusBadge({ status, client = false }: { status: string; client?: boolean }) {
  const labels = client ? CLIENT_STATUS_LABELS : STATUS_LABELS;
  return <Badge tone={statusTone(status)}>{labels[status as RequestStatus] ?? status}</Badge>;
}
export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={priorityTone(priority)}>{PRIORITY_LABELS[priority as Priority] ?? priority}</Badge>;
}
export function DeliverableBadge({ status }: { status: string }) {
  return <Badge tone={deliverableTone(status)}>{DELIVERABLE_LABELS[status as DeliverableStatus] ?? status}</Badge>;
}
export function DueBadge({ request, now, soonHours, tz }: { request: { status: string; due_at: string | null }; now: number; soonHours: number; tz: string }) {
  const d = dueInfo(request, now, soonHours, tz);
  if (d.label === '—') return <span className="text-xs text-muted">—</span>;
  return d.tone === 'neutral' ? <span className="text-xs">{d.label}</span> : <Badge tone={d.tone}>{d.label}</Badge>;
}
export function VisibilityBadge({ visibility }: { visibility: string }) {
  return visibility === 'client' ? <Badge tone="success">Compartilhado</Badge> : <Badge tone="warning">Interno</Badge>;
}
