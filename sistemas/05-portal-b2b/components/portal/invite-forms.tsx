'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ActionButton, FormShell, SelectField, TextField, useActionForm, type Opt } from '@/components/app/form-kit';
import { Alert, Button, Select } from '@/components/ui/primitives';
import { acceptInvite, createInvite, revokeInvite, setClientMember } from '@/lib/portal/actions';
import { inviteSchema, type InviteInput } from '@/lib/portal/validation';

/** Mostra o link do convite UMA vez: o banco guarda só o hash do token, então ele não pode ser recuperado depois. */
function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-warning p-3" role="status">
      <p className="text-sm font-medium">Copie o link agora — ele não será exibido novamente.</p>
      <input readOnly value={link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} className="min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm" />
      <Button type="button" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>
        {copied ? 'Copiado!' : 'Copiar link'}
      </Button>
      <p className="text-xs text-muted">Envie ao convidado por um canal seguro. O convite vale 7 dias, só pode ser usado uma vez e só funciona para o e-mail informado.</p>
    </div>
  );
}

export function InviteForm({ kind, clientId, roles, clients }: { kind: 'client' | 'staff'; clientId?: string; roles: Opt[]; clients?: Opt[] }) {
  const [link, setLink] = useState<string | null>(null);
  const { form, state, pending, submit } = useActionForm<InviteInput, unknown>({
    schema: inviteSchema as never,
    defaultValues: { kind, client: clientId ?? clients?.[0]?.value ?? '', email: '', role: roles[0]?.value as InviteInput['role'] },
    action: createInvite,
    onSuccess: (r) => setLink(r.link ?? null),
    resetOnSuccess: true,
  });
  return (
    <div className="space-y-4">
      <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Gerar convite">
        {kind === 'client' && clients && !clientId ? <SelectField form={form} name="client" label="Empresa" options={clients} /> : null}
        <TextField form={form} name="email" label="E-mail do convidado" type="email" inputMode="email" maxLength={254} />
        <SelectField form={form} name="role" label="Papel" options={roles} />
      </FormShell>
      {link ? <InviteLink link={link} /> : null}
    </div>
  );
}

export const RevokeInviteButton = ({ id }: { id: string }) => (
  <ActionButton label="Revogar" variant="ghost" confirm="Revogar este convite? O link deixa de funcionar." action={() => revokeInvite(id)} />
);

/** Papel e situação de um usuário da empresa cliente. O banco impede remover/rebaixar o último administrador. */
export function MemberControl({ id, role, status }: { id: string; role: 'client_admin' | 'client_user'; status: 'active' | 'inactive' }) {
  const router = useRouter();
  const [r, setR] = useState(role);
  const [s, setS] = useState(status);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select aria-label="Papel" value={r} onChange={(e) => setR(e.target.value as typeof r)} className="w-52">
        <option value="client_admin">Administrador do cliente</option>
        <option value="client_user">Usuário do cliente</option>
      </Select>
      <Select aria-label="Situação" value={s} onChange={(e) => setS(e.target.value as typeof s)} className="w-32">
        <option value="active">Ativo</option>
        <option value="inactive">Inativo</option>
      </Select>
      <Button type="button" variant="secondary" disabled={pending || (r === role && s === status)} onClick={() => start(async () => {
        const res = await setClientMember(id, { role: r, status: s });
        setMsg(res.ok ? null : (res.message ?? 'Não foi possível salvar.'));
        if (res.ok) router.refresh();
      })}>Salvar</Button>
      {msg ? <span role="alert" className="w-full text-xs text-danger">{msg}</span> : null}
    </div>
  );
}

/** Aceite do convite pelo usuário logado. A mensagem de erro é uniforme: não revela se o token existe, expirou ou é de outro e-mail. */
export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button type="button" disabled={pending} aria-busy={pending} onClick={() => start(async () => {
        const r = await acceptInvite(token);
        setMsg({ ok: Boolean(r.ok), text: r.message ?? '' });
        if (r.ok && r.redirectTo) router.push(r.redirectTo);
      })}>{pending ? 'Aceitando…' : 'Aceitar convite'}</Button>
      {msg && !msg.ok ? <Alert tone="error">{msg.text}</Alert> : null}
    </div>
  );
}
