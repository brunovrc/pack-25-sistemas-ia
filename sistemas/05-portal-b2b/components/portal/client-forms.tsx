'use client';

import { useRouter } from 'next/navigation';
import { ActionButton, FormShell, SelectField, TextAreaField, TextField, useActionForm, type Opt } from '@/components/app/form-kit';
import { archiveClientAccount, createClientAccount, saveInternalNotes, updateClientAccount } from '@/lib/portal/actions';
import { clientAccountSchema, internalNotesSchema, type ClientAccountInput } from '@/lib/portal/validation';

export const EMPTY_CLIENT: ClientAccountInput = { name: '', legal_name: '', document_number: '', email: '', phone: '', status: 'active', assigned_manager_id: '' };

export function ClientAccountForm({ id, initial, managers }: { id?: string; initial?: ClientAccountInput; managers: Opt[] }) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<ClientAccountInput, unknown>({
    schema: clientAccountSchema as never,
    defaultValues: initial ?? EMPTY_CLIENT,
    action: (v) => (id ? updateClientAccount(id, v) : createClientAccount(v)),
    onSuccess: (r) => { if (!id && r.id) router.push(`/clientes/${r.id}`); },
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={id ? 'Salvar alterações' : 'Cadastrar empresa'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="name" label="Nome da empresa" maxLength={120} />
        <TextField form={form} name="legal_name" label="Razão social" maxLength={160} />
        <TextField form={form} name="document_number" label="CNPJ (ou CPF)" inputMode="numeric" maxLength={24} hint="Opcional. Só números ou com pontuação." />
        <TextField form={form} name="email" label="E-mail de contato" type="email" inputMode="email" maxLength={254} />
        <TextField form={form} name="phone" label="Telefone" type="tel" inputMode="tel" maxLength={30} />
        <SelectField form={form} name="assigned_manager_id" label="Gestor da conta" options={managers} empty="Sem gestor" hint="O gestor da conta e quem tem solicitações nela enxergam esta empresa." />
        {id ? <SelectField form={form} name="status" label="Situação" options={[{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa (usuários sem acesso)' }]} /> : null}
      </div>
    </FormShell>
  );
}

export function InternalNotesForm({ id, initial }: { id: string; initial: string }) {
  const { form, state, pending, submit } = useActionForm<{ notes: string }, unknown>({
    schema: internalNotesSchema as never, defaultValues: { notes: initial }, action: (v) => saveInternalNotes(id, v),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Salvar observações">
      <TextAreaField form={form} name="notes" label="Observações internas" maxLength={4000} hint="Só a equipe lê. O cliente nunca vê este texto." />
    </FormShell>
  );
}

export function ArchiveClientButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  return (
    <ActionButton
      label={archived ? 'Restaurar empresa' : 'Arquivar empresa'}
      variant={archived ? 'secondary' : 'danger'}
      confirm={archived ? undefined : 'Arquivar esta empresa? Os usuários dela perdem o acesso ao portal imediatamente. Os dados são mantidos.'}
      action={() => archiveClientAccount(id, !archived)}
      onDone={() => { if (!archived) router.push('/clientes'); }}
    />
  );
}
