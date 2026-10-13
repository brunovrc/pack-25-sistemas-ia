import type { Metadata } from 'next';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/app/list-bits';
import { requirePortalContext } from '@/lib/auth/session';
import type { SearchParams } from '@/lib/portal/access';
import { listAnnouncements, loadSettings, parsePage } from '@/lib/portal/data';
import { formatDateTime } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Comunicados' };

export default async function PortalAnnouncements({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePortalContext();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const [{ rows, total }, settings] = await Promise.all([listAnnouncements(ctx, ctx.account.organization_id, { page, includeArchived: false }), loadSettings(ctx, ctx.account.organization_id)]);
  return (
    <>
      <PageHeader title="Comunicados" description="Avisos da equipe para você." />
      {rows.length === 0 ? <EmptyState title="Nenhum comunicado" /> : (
        <ul className="space-y-3">
          {rows.map((a) => <li key={a.id}><Card><h2 className="text-base font-semibold">{a.title}</h2><p className="text-xs text-muted">{formatDateTime(a.published_at, settings.timezone)}</p><p className="mt-3 whitespace-pre-wrap text-sm">{a.body}</p></Card></li>)}
        </ul>
      )}
      <Pagination basePath="/portal/comunicados" page={page} total={total} params={{}} />
    </>
  );
}
