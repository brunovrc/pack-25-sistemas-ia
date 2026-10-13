import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { ArchiveClientButton, ClientAccountForm, InternalNotesForm } from '@/components/portal/client-forms';
import { InviteForm, MemberControl, RevokeInviteButton } from '@/components/portal/invite-forms';
import { requireContext } from '@/lib/auth/session';
import { isManager, uuidOrEmpty } from '@/lib/portal/access';
import { getClient, getInternalNotes, labelMap, listInvites, listMembers, loadPeople, loadSettings, personOptions } from '@/lib/portal/data';
import { CLIENT_ROLE_LABELS, formatDateTime } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Empresa cliente' };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  if (!uuidOrEmpty(id)) notFound();
  const org = ctx.membership.organization_id;
  const client = await getClient(ctx, org, id);
  if (!client) notFound(); // sem acesso (RLS) ou inexistente: mesma resposta
  const role = ctx.membership.role;
  const manager = isManager(role);
  const [people, settings, members, invites, notes] = await Promise.all([loadPeople(ctx, org), loadSettings(ctx, org), listMembers(ctx, id), listInvites(ctx, org, { clientId: id, kind: 'client' }), getInternalNotes(ctx, id)]);
  const names = labelMap(people);
  const now = nowMs();
  const pending = invites.filter((i) => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > now);
  return (
    <>
      <PageHeader title={client.name} description={client.legal_name ?? undefined}>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href={`/solicitacoes?client=${id}`}>Solicitações</Link>
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5" href={`/documentos?client=${id}`}>Documentos</Link>
          {manager ? <ArchiveClientButton id={id} archived={client.archived_at !== null} /> : null}
        </div>
      </PageHeader>

      <div className="grid gap-6">
        {manager ? <Card title="Dados da empresa"><ClientAccountForm id={id} managers={personOptions(people, ['staff'])} initial={{ name: client.name, legal_name: client.legal_name ?? '', document_number: client.document_number ?? '', email: client.email ?? '', phone: client.phone ?? '', status: client.status, assigned_manager_id: client.assigned_manager_id ?? '' }} /></Card> : null}

        <Card title="Usuários da empresa" description="Pessoas da empresa cliente com acesso ao portal. Elas só enxergam os dados desta empresa.">
          {members.length === 0 ? <p className="text-sm text-muted">Ainda não há usuários. Convide alguém abaixo.</p> : (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{names.get(m.user_id) ?? 'Usuário'}</p>
                    <p className="text-xs text-muted">{CLIENT_ROLE_LABELS[m.role]} · desde {formatDateTime(m.joined_at, settings.timezone)} {m.status === 'inactive' ? <Badge tone="warning">Inativo</Badge> : null}</p>
                  </div>
                  {manager ? <MemberControl id={m.id} role={m.role} status={m.status} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {manager ? (
          <Card title="Convidar usuário da empresa" description="O convite é pessoal: vale para o e-mail informado, 7 dias e um único uso.">
            <InviteForm kind="client" clientId={id} roles={[{ value: 'client_user', label: 'Usuário do cliente' }, { value: 'client_admin', label: 'Administrador do cliente' }]} />
            {pending.length > 0 ? (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold">Convites pendentes</h3>
                <ul className="divide-y divide-border">
                  {pending.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{i.invited_email} · {CLIENT_ROLE_LABELS[i.invited_role as keyof typeof CLIENT_ROLE_LABELS]} · expira {formatDateTime(i.expires_at, settings.timezone)}</span><RevokeInviteButton id={i.id} /></li>)}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card title="Observações internas" description="Visíveis só à equipe.">
          <InternalNotesForm id={id} initial={notes} />
        </Card>
      </div>
    </>
  );
}
