import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { DeliverableBadge, VisibilityBadge } from '@/components/portal/badges';
import { AttachFile, DetachButton, DeliverableStatusControl, EditDeliverableForm } from '@/components/portal/deliverable-forms';
import { DocLinks, UploadForm } from '@/components/portal/document-bits';
import { requireContext } from '@/lib/auth/session';
import { canWrite, uuidOrEmpty } from '@/lib/portal/access';
import { getClient, getDeliverable, labelMap, listDocuments, loadPeople, loadSettings } from '@/lib/portal/data';
import { formatBytes, formatDateTime } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Entrega' };

export default async function DeliverablePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  if (!uuidOrEmpty(id)) notFound();
  const org = ctx.membership.organization_id;
  const found = await getDeliverable(ctx, org, id);
  if (!found) notFound();
  const { deliverable: d, documents } = found;
  const writer = canWrite(ctx.membership.role);
  const editable = d.status !== 'acknowledged' && d.status !== 'cancelled' && d.status !== 'published';
  const [settings, people, client, available] = await Promise.all([
    loadSettings(ctx, org), loadPeople(ctx, org), getClient(ctx, org, d.client_account_id),
    listDocuments(ctx, { org, clientId: d.client_account_id, folder: 'any', q: '', page: 1 }),
  ]);
  const names = labelMap(people);
  const attached = new Set(documents.map((x) => x.id));
  const tz = settings.timezone;
  return (
    <>
      <PageHeader title={d.title} description={client ? `Empresa: ${client.name}` : undefined}>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/entregas">Voltar à lista</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-3"><DeliverableBadge status={d.status} />{d.request_id ? <Link className="text-sm underline" href={`/solicitacoes/${d.request_id}`}>Ver solicitação relacionada</Link> : null}</div>
            {d.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{d.description}</p> : <p className="mt-3 text-sm text-muted">Sem descrição.</p>}
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Criada em</dt><dd>{formatDateTime(d.created_at, tz)}</dd></div>
              <div><dt className="text-xs text-muted">Publicada em</dt><dd>{formatDateTime(d.delivered_at, tz)}{d.published_by ? ` · ${names.get(d.published_by) ?? 'Equipe'}` : ''}</dd></div>
              <div><dt className="text-xs text-muted">Recebimento confirmado</dt><dd>{d.acknowledged_at ? `${formatDateTime(d.acknowledged_at, tz)} · ${d.acknowledged_by ? names.get(d.acknowledged_by) ?? 'Cliente' : 'Cliente'}` : 'Ainda não'}</dd></div>
            </dl>
            {d.status === 'draft' || d.status === 'in_preparation' || d.status === 'ready' ? <div className="mt-4"><Alert tone="info">Rascunho: o cliente ainda não vê esta entrega nem os arquivos. Ao publicar, os arquivos vinculados são compartilhados.</Alert></div> : null}
          </Card>

          <Card title="Arquivos da entrega">
            {documents.length === 0 ? <p className="text-sm text-muted">Nenhum arquivo vinculado. Uma entrega precisa de ao menos um arquivo ou de uma descrição para ser publicada.</p> : (
              <ul className="divide-y divide-border">
                {documents.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{x.title} <span className="text-xs text-muted">({formatBytes(x.size_bytes)})</span> <VisibilityBadge visibility={x.visibility} /></span>
                    <span className="flex flex-wrap items-center gap-2"><DocLinks id={x.id} mime={x.mime_type} />{writer && editable ? <DetachButton deliverableId={id} documentId={x.id} /> : null}</span>
                  </li>
                ))}
              </ul>
            )}
            {writer && editable ? (
              <div className="mt-5 space-y-5 border-t border-border pt-4">
                <AttachFile deliverableId={id} options={available.rows.filter((x) => !attached.has(x.id)).map((x) => ({ value: x.id, label: x.title }))} />
                <div><h3 className="mb-2 text-sm font-semibold">Ou envie um arquivo novo</h3><UploadForm clientId={d.client_account_id} maxMb={settings.doc_max_mb} staff deliverableId={id} label="Enviar e vincular" /></div>
              </div>
            ) : null}
          </Card>
        </div>
        {writer ? (
          <aside className="space-y-6" aria-label="Gestão da entrega">
            <Card title="Situação"><DeliverableStatusControl id={id} status={d.status} /></Card>
            {editable ? <Card title="Editar"><EditDeliverableForm id={id} initial={{ title: d.title, description: d.description ?? '' }} /></Card> : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
