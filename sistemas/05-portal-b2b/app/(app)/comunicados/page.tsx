import type { Metadata } from 'next';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/app/list-bits';
import { AnnouncementForm, ArchiveAnnouncementButton } from '@/components/portal/announcement-forms';
import { requireContext } from '@/lib/auth/session';
import { isManager, type SearchParams } from '@/lib/portal/access';
import { listAnnouncementRecipients, listAnnouncements, loadClientOptions, loadSettings, parsePage } from '@/lib/portal/data';
import { formatDateTime } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Comunicados' };

export default async function AnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const manager = isManager(ctx.membership.role);
  const [{ rows, total }, clients, settings] = await Promise.all([listAnnouncements(ctx, org, { page, includeArchived: false }), loadClientOptions(ctx, org, true), loadSettings(ctx, org)]);
  const recipients = await listAnnouncementRecipients(ctx, rows.filter((r) => r.audience === 'selected').map((r) => r.id));
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const now = nowMs();
  const state = (a: (typeof rows)[number]) => {
    if (a.expires_at && Date.parse(a.expires_at) <= now) return <Badge tone="neutral">Expirado</Badge>;
    if (!a.published_at || Date.parse(a.published_at) > now) return <Badge tone="warning">Agendado</Badge>;
    return <Badge tone="success">No ar</Badge>;
  };
  return (
    <>
      <PageHeader title="Comunicados" description="Avisos da prestadora para todos os clientes ou só para os escolhidos. Aparecem no portal e geram uma notificação." />
      <div className="grid gap-6">
        {rows.length === 0 ? <EmptyState title="Nenhum comunicado" description={manager ? 'Publique o primeiro abaixo.' : 'Quando a gestão publicar, ele aparece aqui.'} /> : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li key={a.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h2 className="text-base font-semibold">{a.title}</h2><p className="text-xs text-muted">{a.published_at ? `Publicação: ${formatDateTime(a.published_at, settings.timezone)}` : 'Não publicado'}{a.expires_at ? ` · expira ${formatDateTime(a.expires_at, settings.timezone)}` : ''}</p></div>
                    <div className="flex items-center gap-2">{state(a)}<Badge tone="neutral">{a.audience === 'all' ? 'Todos os clientes' : `${recipients.get(a.id)?.length ?? 0} cliente(s)`}</Badge>{manager ? <ArchiveAnnouncementButton id={a.id} /> : null}</div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm">{a.body}</p>
                  {a.audience === 'selected' ? <p className="mt-2 text-xs text-muted">Para: {(recipients.get(a.id) ?? []).map((id) => names.get(id) ?? '—').join(', ')}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/comunicados" page={page} total={total} params={{}} />
        {manager ? <Card title="Novo comunicado"><AnnouncementForm clients={clients.map((c) => ({ value: c.id, label: c.name }))} /></Card> : null}
      </div>
    </>
  );
}
