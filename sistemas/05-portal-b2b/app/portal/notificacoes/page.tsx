import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { NotificationList } from '@/components/portal/notification-list';
import { requirePortalContext } from '@/lib/auth/session';
import { one, type SearchParams } from '@/lib/portal/access';
import { listNotifications, loadMutedTypes, loadSettings, parsePage } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Notificações' };
const CLIENT_TYPES = ['request_status', 'request_comment', 'deliverable_published', 'document_shared', 'announcement'];

export default async function PortalNotifications({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePortalContext();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const onlyUnread = one(sp.unread) === '1';
  const [list, settings, muted] = await Promise.all([listNotifications(ctx, { onlyUnread, page }), loadSettings(ctx, ctx.account.organization_id), loadMutedTypes(ctx, ctx.user.id)]);
  return (
    <>
      <PageHeader title="Notificações" description="Avisos sobre suas solicitações, entregas e comunicados." />
      <NotificationList rows={list.rows} total={list.total} page={page} tz={settings.timezone} portal muted={muted} mutableTypes={CLIENT_TYPES} onlyUnread={onlyUnread} basePath="/portal/notificacoes" />
    </>
  );
}
