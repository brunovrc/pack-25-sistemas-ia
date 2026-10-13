import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { NotificationList } from '@/components/portal/notification-list';
import { requireContext } from '@/lib/auth/session';
import { one, type SearchParams } from '@/lib/portal/access';
import { listNotifications, loadMutedTypes, loadSettings, parsePage } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Notificações' };
const STAFF_TYPES = ['request_created', 'request_assigned', 'request_status', 'request_comment', 'request_reopened', 'deadline_soon', 'deliverable_acknowledged', 'invitation_accepted'];

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const onlyUnread = one(sp.unread) === '1';
  const [list, settings, muted] = await Promise.all([listNotifications(ctx, { onlyUnread, page }), loadSettings(ctx, ctx.membership.organization_id), loadMutedTypes(ctx, ctx.user.id)]);
  return (
    <>
      <PageHeader title="Notificações" description="Avisos internos do sistema: novas solicitações, respostas de clientes, prazos e entregas confirmadas." />
      <NotificationList rows={list.rows} total={list.total} page={page} tz={settings.timezone} portal={false} muted={muted} mutableTypes={STAFF_TYPES} onlyUnread={onlyUnread} basePath="/notificacoes" />
    </>
  );
}
