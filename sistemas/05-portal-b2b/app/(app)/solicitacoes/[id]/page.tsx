import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/primitives';
import { FinalNote, RequestAttachments, RequestSummary, RequestThread } from '@/components/portal/request-detail';
import { AssignControl, CommentForm, DueForm, EditRequestForm, StatusForm } from '@/components/portal/request-forms';
import { UploadForm } from '@/components/portal/document-bits';
import { requireContext } from '@/lib/auth/session';
import { canWrite, isManager, uuidOrEmpty } from '@/lib/portal/access';
import { getClient, getRequest, getRequestThread, labelMap, loadCategories, loadPeople, loadSettings, personOptions } from '@/lib/portal/data';
import { isFinal, type RequestStatus } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Solicitação' };

/** «2026-10-13T15:30:00Z» -> data e hora no fuso do portal, para preencher o formulário de prazo. */
function localParts(iso: string | null, tz: string): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date(nowMs() + 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  if (!uuidOrEmpty(id)) notFound();
  const org = ctx.membership.organization_id;
  const r = await getRequest(ctx, org, id);
  if (!r) notFound();
  const role = ctx.membership.role;
  const writer = canWrite(role);
  const [settings, people, categories, thread, client] = await Promise.all([loadSettings(ctx, org), loadPeople(ctx, org), loadCategories(ctx, org, false), getRequestThread(ctx, id), getClient(ctx, org, r.client_account_id)]);
  const names = labelMap(people);
  const final = isFinal(r.status);
  const due = localParts(r.due_at, settings.timezone);
  const catName = categories.find((c) => c.id === r.category_id)?.name;
  return (
    <>
      <PageHeader title="Solicitação" description="Situação, prazo, responsável e toda a conversa em um só lugar.">
        <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href="/solicitacoes">Voltar à lista</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <RequestSummary r={r} settings={settings} names={names} clientName={client?.name} category={catName} now={nowMs()} client={false} />
          <FinalNote status={r.status} />
          <RequestThread thread={thread} names={names} tz={settings.timezone} client={false} />
          <RequestAttachments thread={thread} />
          {writer && r.status !== 'cancelled' ? (
            <Card title="Comentar">
              <CommentForm requestId={id} staff />
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-semibold">Anexar arquivo à solicitação</h3>
                <UploadForm clientId={r.client_account_id} maxMb={settings.doc_max_mb} staff requestId={id} label="Enviar e anexar" />
              </div>
            </Card>
          ) : null}
        </div>
        {writer ? (
          <aside className="space-y-6" aria-label="Gestão da solicitação">
            <Card title="Situação"><StatusForm id={id} current={r.status as RequestStatus} who="staff" /></Card>
            <Card title="Responsável"><AssignControl id={id} current={r.assigned_to} options={personOptions(people, ['staff']).filter((o) => o.value)} /></Card>
            {isManager(role) && !final ? <Card title="Prazo"><DueForm id={id} initialDate={due.date} initialTime={due.time} /></Card> : null}
            {!final ? <Card title="Editar"><EditRequestForm id={id} categories={categories.filter((c) => c.active || c.id === r.category_id).map((c) => ({ value: c.id, label: c.name }))} initial={{ title: r.title, description: r.description ?? '', category: r.category_id ?? '', priority: r.priority as 'low' | 'normal' | 'high' | 'urgent' }} /></Card> : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
