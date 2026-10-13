import type { Metadata } from 'next';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { InviteForm, MemberControl, RevokeInviteButton } from '@/components/portal/invite-forms';
import { requirePortalContext } from '@/lib/auth/session';
import { labelMap, listInvites, listMembers, loadPeople, loadSettings } from '@/lib/portal/data';
import { CLIENT_ROLE_LABELS, formatDateTime } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Usuários da empresa' };

/** Só o administrador do cliente chega aqui (o usuário comum recebe 404). O banco também restringe a lista de membros e os convites. */
export default async function PortalTeam() {
  const ctx = await requirePortalContext(['client_admin']);
  const { account } = ctx;
  const org = account.organization_id;
  const [members, invites, people, settings] = await Promise.all([listMembers(ctx, account.client_account_id), listInvites(ctx, org, { clientId: account.client_account_id, kind: 'client' }), loadPeople(ctx, org), loadSettings(ctx, org)]);
  const names = labelMap(people);
  const now = nowMs();
  const pending = invites.filter((i) => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > now);
  return (
    <>
      <PageHeader title="Usuários da empresa" description="Quem da sua empresa acessa este portal. Convide colegas e gerencie o acesso." />
      <div className="grid gap-6">
        <Card title="Usuários">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><p className="font-medium">{names.get(m.user_id) ?? 'Usuário'}</p><p className="text-xs text-muted">{CLIENT_ROLE_LABELS[m.role]} · desde {formatDateTime(m.joined_at, settings.timezone)} {m.status === 'inactive' ? <Badge tone="warning">Inativo</Badge> : null}</p></div>
                <MemberControl id={m.id} role={m.role} status={m.status} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">A empresa precisa manter ao menos um administrador ativo.</p>
        </Card>
        <Card title="Convidar colega" description="O convite vale para o e-mail informado, por 7 dias, uma única vez.">
          <InviteForm kind="client" clientId={account.client_account_id} roles={[{ value: 'client_user', label: 'Usuário' }, { value: 'client_admin', label: 'Administrador' }]} />
          {pending.length > 0 ? (
            <div className="mt-6"><h3 className="mb-2 text-sm font-semibold">Convites pendentes</h3>
              <ul className="divide-y divide-border">{pending.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{i.invited_email} · expira {formatDateTime(i.expires_at, settings.timezone)}</span><RevokeInviteButton id={i.id} /></li>)}</ul></div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
