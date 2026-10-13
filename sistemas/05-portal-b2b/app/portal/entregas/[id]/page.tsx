import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { DeliverableBadge } from '@/components/portal/badges';
import { AcknowledgeButton } from '@/components/portal/deliverable-forms';
import { DocLinks } from '@/components/portal/document-bits';
import { requirePortalContext } from '@/lib/auth/session';
import { uuidOrEmpty } from '@/lib/portal/access';
import { getDeliverable, labelMap, loadPeople, loadSettings } from '@/lib/portal/data';
import { formatBytes, formatDateTime } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Entrega' };

export default async function PortalDeliverable({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalContext();
  const { id } = await params;
  if (!uuidOrEmpty(id)) notFound();
  const org = ctx.account.organization_id;
  const found = await getDeliverable(ctx, org, id);
  if (!found || found.deliverable.client_account_id !== ctx.account.client_account_id) notFound();
  const { deliverable: d, documents } = found;
  const [settings, people] = await Promise.all([loadSettings(ctx, org), loadPeople(ctx, org)]);
  const names = labelMap(people);
  const tz = settings.timezone;
  return (
    <>
      <PageHeader title={d.title}>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/portal/entregas">Voltar à lista</Link>
      </PageHeader>
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center gap-3"><DeliverableBadge status={d.status} />{d.request_id ? <Link className="text-sm underline" href={`/portal/solicitacoes/${d.request_id}`}>Ver solicitação relacionada</Link> : null}</div>
          {d.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{d.description}</p> : null}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Publicada em</dt><dd>{formatDateTime(d.delivered_at, tz)}{d.published_by ? ` · ${names.get(d.published_by) ?? 'Equipe'}` : ''}</dd></div>
            <div><dt className="text-xs text-muted">Recebimento confirmado</dt><dd>{d.acknowledged_at ? `${formatDateTime(d.acknowledged_at, tz)} · ${d.acknowledged_by ? names.get(d.acknowledged_by) ?? 'Você' : ''}` : 'Ainda não'}</dd></div>
          </dl>
        </Card>
        <Card title="Arquivos">
          {documents.length === 0 ? <p className="text-sm text-muted">Esta entrega não tem arquivos: veja a descrição acima.</p> : (
            <ul className="divide-y divide-border">
              {documents.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{x.title} <span className="text-xs text-muted">({formatBytes(x.size_bytes)})</span></span><DocLinks id={x.id} mime={x.mime_type} /></li>)}
            </ul>
          )}
        </Card>
        {d.status === 'published' ? (
          <Card title="Conferiu tudo?" description="Confirmar avisa a equipe e registra quem recebeu e quando.">
            <AcknowledgeButton id={id} />
          </Card>
        ) : d.status === 'acknowledged' ? <Alert tone="success">Recebimento confirmado. Obrigado!</Alert> : null}
      </div>
    </>
  );
}
