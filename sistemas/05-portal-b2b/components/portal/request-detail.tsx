import Link from 'next/link';
import { Alert, Badge, Card } from '@/components/ui/primitives';
import { getRequestThread, type CommentRow, type DeadlineEvent, type HistoryRow, type RequestRow, type Settings } from '@/lib/portal/data';
import {
  CLIENT_STATUS_LABELS, DUE_KIND_LABELS, formatBytes, formatDateTime, isFinal, STATUS_LABELS, requestCode, type RequestStatus,
} from '@/lib/portal/format';
import { DocLinks } from './document-bits';
import { DueBadge, PriorityBadge, StatusBadge } from './badges';

type Thread = Awaited<ReturnType<typeof getRequestThread>>;
type Event =
  | { at: string; kind: 'comment'; c: CommentRow }
  | { at: string; kind: 'status'; h: HistoryRow }
  | { at: string; kind: 'deadline'; d: DeadlineEvent };

/** Linha do tempo única: comentários (compartilhados e, para a equipe, internos), mudanças de situação e de prazo, em ordem cronológica. */
function timeline(t: Thread): Event[] {
  return [
    ...t.comments.map((c): Event => ({ at: c.created_at, kind: 'comment', c })),
    ...t.history.map((h): Event => ({ at: h.changed_at, kind: 'status', h })),
    ...t.deadlines.map((d): Event => ({ at: d.calculated_at, kind: 'deadline', d })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

export function RequestSummary({ r, settings, names, clientName, category, now, client }: {
  r: RequestRow; settings: Settings; names: Map<string, string>; clientName?: string; category?: string; now: number; client: boolean;
}) {
  const tz = settings.timezone;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{requestCode(r.number)}{clientName && !client ? ` · ${clientName}` : ''}</p>
          <h2 className="text-lg font-semibold">{r.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} client={client} />
          <PriorityBadge priority={r.priority} />
        </div>
      </div>
      {r.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{r.description}</p> : null}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-muted">Aberta em</dt><dd>{formatDateTime(r.created_at, tz)}{r.created_by ? ` · ${names.get(r.created_by) ?? 'Usuário'}` : ''}</dd></div>
        <div><dt className="text-xs text-muted">Responsável</dt><dd>{r.assigned_to ? names.get(r.assigned_to) ?? 'Equipe' : <span className="text-warning">Ainda sem responsável</span>}</dd></div>
        <div><dt className="text-xs text-muted">Categoria</dt><dd>{category ?? '—'}</dd></div>
        <div>
          <dt className="text-xs text-muted">Prazo {r.due_kind ? `(${DUE_KIND_LABELS[r.due_kind as keyof typeof DUE_KIND_LABELS]})` : ''}</dt>
          <dd><DueBadge request={r} now={now} soonHours={settings.alert_due_soon_hours} tz={tz} />{isFinal(r.status) && r.due_at ? <span className="text-xs text-muted">Era {formatDateTime(r.due_at, tz)}</span> : null}</dd>
        </div>
        <div><dt className="text-xs text-muted">Última atividade</dt><dd>{formatDateTime(r.last_activity_at, tz)}</dd></div>
        {r.completed_at ? <div><dt className="text-xs text-muted">Concluída em</dt><dd>{formatDateTime(r.completed_at, tz)}{r.reopened_count > 0 ? ` · reaberta ${r.reopened_count}×` : ''}</dd></div> : null}
      </dl>
    </Card>
  );
}

export function RequestThread({ thread, names, tz, client }: { thread: Thread; names: Map<string, string>; tz: string; client: boolean }) {
  const events = timeline(thread);
  const attachmentsByComment = new Map<string, Thread['attachments']>();
  for (const a of thread.attachments) if (a.comment_id) attachmentsByComment.set(a.comment_id, [...(attachmentsByComment.get(a.comment_id) ?? []), a]);
  const labels = client ? CLIENT_STATUS_LABELS : STATUS_LABELS;
  const who = (id: string | null) => (id ? names.get(id) ?? 'Usuário' : 'Sistema');
  return (
    <Card title="Conversa e histórico" description={client ? 'Tudo o que foi dito e todas as mudanças desta solicitação, em ordem.' : 'Comentários compartilhados, notas internas e mudanças, em ordem. Notas internas nunca aparecem para o cliente.'}>
      {events.length === 0 ? <p className="text-sm text-muted">Nada por aqui ainda.</p> : (
        <ol className="space-y-3" aria-label="Linha do tempo">
          {events.map((e, i) => {
            if (e.kind === 'comment') {
              const internal = e.c.visibility === 'internal';
              const atts = attachmentsByComment.get(e.c.id) ?? [];
              return (
                <li key={`c-${e.c.id}`} className={`rounded-md border p-3 text-sm ${internal ? 'border-warning bg-warning/5' : 'border-border'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span className="font-medium text-foreground">{who(e.c.author_id)}</span>
                    <span className="flex items-center gap-2">{internal ? <Badge tone="warning">Nota interna</Badge> : null}{formatDateTime(e.c.created_at, tz)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{e.c.body}</p>
                  {atts.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {atts.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs"><span>📎 {a.document.title} ({formatBytes(a.document.size_bytes)})</span><DocLinks id={a.document.id} mime={a.document.mime_type} /></li>)}
                    </ul>
                  ) : null}
                </li>
              );
            }
            if (e.kind === 'status') {
              const h = e.h;
              return (
                <li key={`s-${h.id}`} className="border-l-2 border-border pl-3 text-sm">
                  <p>
                    <span className="font-medium">{who(h.changed_by)}</span>{' '}
                    {h.previous_status === null ? 'abriu a solicitação' : <>mudou a situação de <strong>{labels[h.previous_status as RequestStatus] ?? h.previous_status}</strong> para <strong>{labels[h.new_status as RequestStatus] ?? h.new_status}</strong></>}
                    <span className="text-xs text-muted"> · {formatDateTime(h.changed_at, tz)}</span>
                  </p>
                  {h.reason ? <p className="text-xs text-muted">Motivo: {h.reason}</p> : null}
                </li>
              );
            }
            const d = e.d;
            return (
              <li key={`d-${d.id}-${i}`} className="border-l-2 border-border pl-3 text-sm">
                <p>
                  <span className="font-medium">{who(d.changed_by)}</span> definiu o prazo: <strong>{d.target_at ? formatDateTime(d.target_at, tz) : 'sem prazo'}</strong> ({DUE_KIND_LABELS[d.due_kind as keyof typeof DUE_KIND_LABELS] ?? d.due_kind})
                  <span className="text-xs text-muted"> · {formatDateTime(d.calculated_at, tz)}</span>
                </p>
                {d.reason ? <p className="text-xs text-muted">Motivo: {d.reason}</p> : null}
                {d.breached_at ? <p className="text-xs text-danger">Este prazo foi ultrapassado.</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function RequestAttachments({ thread, base = '' }: { thread: Thread; base?: string }) {
  const loose = thread.attachments.filter((a) => !a.comment_id);
  if (loose.length === 0 && thread.deliverables.length === 0) return null;
  return (
    <Card title="Arquivos e entregas">
      {loose.length > 0 ? (
        <ul className="space-y-2">
          {loose.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>📎 {a.document.title} <span className="text-xs text-muted">({formatBytes(a.document.size_bytes)})</span></span><DocLinks id={a.document.id} mime={a.document.mime_type} /></li>)}
        </ul>
      ) : null}
      {thread.deliverables.length > 0 ? (
        <p className="mt-3 text-sm">Entregas relacionadas: {thread.deliverables.map((d, i) => <span key={d.id}>{i ? ', ' : ''}<Link className="underline" href={`${base}/entregas/${d.id}`}>{d.title}</Link></span>)}</p>
      ) : null}
    </Card>
  );
}

export function FinalNote({ status }: { status: string }) {
  return status === 'cancelled' ? <Alert tone="info">Esta solicitação foi cancelada. Cancelamentos são definitivos: abra uma nova solicitação se precisar.</Alert> : null;
}
