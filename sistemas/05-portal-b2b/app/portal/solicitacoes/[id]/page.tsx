import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { UploadForm } from '@/components/portal/document-bits';
import { FinalNote, RequestAttachments, RequestSummary, RequestThread } from '@/components/portal/request-detail';
import { ClientQuickActions, CommentForm } from '@/components/portal/request-forms';
import { requirePortalContext } from '@/lib/auth/session';
import { uuidOrEmpty } from '@/lib/portal/access';
import { getRequest, getRequestThread, labelMap, loadCategories, loadPeople, loadSettings } from '@/lib/portal/data';
import type { RequestStatus } from '@/lib/portal/format';
import { canReopen } from '@/lib/portal/workflow';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Solicitação' };

export default async function PortalRequest({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalContext();
  const { id } = await params;
  if (!uuidOrEmpty(id)) notFound();
  const org = ctx.account.organization_id;
  const r = await getRequest(ctx, org, id);
  // Solicitação de outra empresa não passa pelo RLS: mesma resposta de «não existe».
  if (!r || r.client_account_id !== ctx.account.client_account_id) notFound();
  const [settings, people, categories, thread] = await Promise.all([loadSettings(ctx, org), loadPeople(ctx, org), loadCategories(ctx, org, false), getRequestThread(ctx, id)]);
  const now = nowMs();
  const status = r.status as RequestStatus;
  return (
    <>
      <PageHeader title="Solicitação" description="Acompanhe a situação, o prazo e converse com a equipe.">
        <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/portal/solicitacoes">Voltar à lista</Link>
      </PageHeader>
      <div className="space-y-6">
        {status === 'waiting_client' ? <Alert tone="warning">A equipe está aguardando uma resposta sua. Escreva abaixo para continuar.</Alert> : null}
        <RequestSummary r={r} settings={settings} names={labelMap(people)} category={categories.find((c) => c.id === r.category_id)?.name} now={now} client />
        <FinalNote status={r.status} />
        <RequestThread thread={thread} names={labelMap(people)} tz={settings.timezone} client />
        <RequestAttachments thread={thread} base="/portal" />
        <ClientQuickActions id={id} status={status} canReopen={canReopen(r.completed_at, settings.reopen_window_days, now)} />
        {status !== 'cancelled' ? (
          <Card title="Responder">
            <CommentForm requestId={id} staff={false} />
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-semibold">Anexar arquivo</h3>
              <UploadForm clientId={ctx.account.client_account_id} maxMb={settings.doc_max_mb} staff={false} requestId={id} label="Enviar e anexar" />
            </div>
          </Card>
        ) : null}
        {status === 'completed' && !canReopen(r.completed_at, settings.reopen_window_days, now) ? <Alert tone="info">O prazo para reabrir esta solicitação terminou. Se ainda precisar de algo, abra uma nova.</Alert> : null}
      </div>
    </>
  );
}
