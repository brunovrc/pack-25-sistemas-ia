import Link from 'next/link';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { Pagination } from '@/components/app/list-bits';
import { MarkAllReadButton, MarkReadButton, NotificationPrefs } from '@/components/portal/settings-forms';
import { notificationHref, type NotificationRow } from '@/lib/portal/data';
import { formatDateTime, NOTIFICATION_TYPE_LABELS } from '@/lib/portal/format';

/** Lista de notificações internas (a mesma para equipe e cliente). Os tipos silenciáveis variam por painel. */
export function NotificationList({ rows, total, page, tz, portal, muted, mutableTypes, onlyUnread, basePath }: {
  rows: NotificationRow[]; total: number; page: number; tz: string; portal: boolean; muted: string[]; mutableTypes: string[]; onlyUnread: boolean; basePath: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtro" className="flex gap-2 text-sm">
          <Link href={basePath} aria-current={!onlyUnread ? 'page' : undefined} className={`rounded-full border px-3 py-1 ${!onlyUnread ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>Todas</Link>
          <Link href={`${basePath}?unread=1`} aria-current={onlyUnread ? 'page' : undefined} className={`rounded-full border px-3 py-1 ${onlyUnread ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>Não lidas</Link>
        </nav>
        <MarkAllReadButton />
      </div>
      {rows.length === 0 ? <EmptyState title={onlyUnread ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'} description="Avisos de prazo, mudanças e entregas aparecem aqui." /> : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm ${n.read_at ? 'border-border' : 'border-primary'}`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><Link className="font-medium underline-offset-2 hover:underline" href={notificationHref(n, portal)}>{n.title}</Link>{!n.read_at ? <Badge tone="warning">Nova</Badge> : null}</p>
                {n.body ? <p className="text-muted">{n.body}</p> : null}
                <p className="text-xs text-muted">{NOTIFICATION_TYPE_LABELS[n.type] ?? n.type} · {formatDateTime(n.created_at, tz)}</p>
              </div>
              {!n.read_at ? <MarkReadButton id={n.id} /> : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath={basePath} page={page} total={total} params={{ unread: onlyUnread ? '1' : '' }} />
      <Card title="Preferências" description="Escolha avisos para silenciar. Avisos críticos de prazo vencido continuam chegando para a equipe.">
        <NotificationPrefs muted={muted} types={mutableTypes} />
      </Card>
    </div>
  );
}
