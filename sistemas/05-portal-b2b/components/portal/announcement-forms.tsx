'use client';

import { ActionButton, FormShell, SelectField, TextAreaField, TextField, useActionForm, type Opt } from '@/components/app/form-kit';
import { archiveAnnouncement, publishAnnouncement } from '@/lib/portal/actions';
import { announcementSchema, type AnnouncementInput } from '@/lib/portal/validation';

export function AnnouncementForm({ clients }: { clients: Opt[] }) {
  const { form, state, pending, submit } = useActionForm<AnnouncementInput, unknown>({
    schema: announcementSchema as never,
    defaultValues: { title: '', body: '', audience: 'all', recipients: [], publish_at: '', expires_at: '' },
    action: publishAnnouncement,
    resetOnSuccess: true,
  });
  const audience = form.watch('audience');
  const picked = form.watch('recipients') ?? [];
  const toggle = (id: string) => form.setValue('recipients', picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id], { shouldValidate: true });
  const err = (form.formState.errors as Record<string, { message?: string } | undefined>).recipients?.message;
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Publicar comunicado">
      <TextField form={form} name="title" label="Título" maxLength={160} />
      <TextAreaField form={form} name="body" label="Mensagem" maxLength={8000} />
      <SelectField form={form} name="audience" label="Quem recebe" options={[{ value: 'all', label: 'Todos os clientes' }, { value: 'selected', label: 'Clientes selecionados' }]} />
      {audience === 'selected' ? (
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Escolha os clientes</legend>
          {clients.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={picked.includes(c.value)} onChange={() => toggle(c.value)} />
              <span>{c.label}</span>
            </label>
          ))}
          {err ? <p role="alert" className="text-xs text-danger">{err}</p> : null}
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="publish_at" label="Agendar para (opcional)" type="datetime-local" hint="Vazio = publicar agora. No fuso do portal." />
        <TextField form={form} name="expires_at" label="Expira em (opcional)" type="datetime-local" hint="Depois disso o comunicado some do portal." />
      </div>
    </FormShell>
  );
}

export const ArchiveAnnouncementButton = ({ id }: { id: string }) => (
  <ActionButton label="Arquivar" variant="ghost" confirm="Arquivar este comunicado? Ele some do portal." action={() => archiveAnnouncement(id)} />
);
