import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { InviteForm, RevokeInviteButton } from '@/components/portal/invite-forms';
import { requireContext } from '@/lib/auth/session';
import { ADMIN_ROLES } from '@/lib/portal/access';
import { listInvites, loadSettings } from '@/lib/portal/data';
import { formatDateTime, STAFF_ROLE_LABELS } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Convites da equipe' };

export default async function StaffInvitesPage() {
  const ctx = await requireContext(ADMIN_ROLES);
  const org = ctx.membership.organization_id;
  const [invites, settings] = await Promise.all([listInvites(ctx, org, { kind: 'staff' }), loadSettings(ctx, org)]);
  const now = nowMs();
  const state = (i: (typeof invites)[number]) => (i.accepted_at ? 'Aceito' : i.revoked_at ? 'Revogado' : Date.parse(i.expires_at) <= now ? 'Expirado' : 'Pendente');
  return (
    <>
      <PageHeader title="Convites da equipe" description="Convide colegas da prestadora. O convite é pessoal: vale para o e-mail informado, por 7 dias, uma única vez." />
      <div className="grid gap-6">
        <Card title="Novo convite">
          <InviteForm kind="staff" roles={[{ value: 'member', label: 'Colaborador' }, { value: 'manager', label: 'Gestor' }, { value: 'viewer', label: 'Leitor' }, { value: 'admin', label: 'Administrador' }]} />
        </Card>
        <Card title="Histórico de convites" description="Apenas administradores veem esta lista. O link original não pode ser recuperado: o sistema guarda só uma impressão digital dele.">
          {invites.length === 0 ? <p className="text-sm text-muted">Nenhum convite ainda.</p> : (
            <ul className="divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{i.invited_email} · {STAFF_ROLE_LABELS[i.invited_role as keyof typeof STAFF_ROLE_LABELS] ?? i.invited_role} · <strong>{state(i)}</strong> · enviado {formatDateTime(i.created_at, settings.timezone)}</span>
                  {state(i) === 'Pendente' ? <RevokeInviteButton id={i.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
