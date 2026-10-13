'use client';

import { useState } from 'react';
import { CheckField, FormShell, TextAreaField, TextField, useActionForm } from '@/components/app/form-kit';
import { ActionButton } from '@/components/app/form-kit';
import { Button } from '@/components/ui/primitives';
import { markNotificationsRead, saveCategory, saveNotificationPrefs, savePortalSettings, saveSla } from '@/lib/portal/actions';
import type { Settings } from '@/lib/portal/data';
import { NOTIFICATION_TYPE_LABELS } from '@/lib/portal/format';
import { categorySchema, portalSettingsSchema, slaSchema } from '@/lib/portal/validation';

type SettingsInput = {
  portal_name: string; welcome_message: string; footer_text: string; contact_email: string; contact_phone: string; primary_color: string; secondary_color: string; timezone: string;
  business_days: number[]; business_start: string; business_end: string; alert_due_soon_hours: string; alert_stale_days: string; reopen_window_days: string; doc_max_mb: string;
};
export const settingsToInput = (s: Settings): SettingsInput => ({
  portal_name: s.portal_name, welcome_message: s.welcome_message ?? '', footer_text: s.footer_text ?? '', contact_email: s.contact_email ?? '', contact_phone: s.contact_phone ?? '',
  primary_color: s.primary_color, secondary_color: s.secondary_color, timezone: s.timezone, business_days: s.business_days, business_start: s.business_start, business_end: s.business_end,
  alert_due_soon_hours: String(s.alert_due_soon_hours), alert_stale_days: String(s.alert_stale_days), reopen_window_days: String(s.reopen_window_days), doc_max_mb: String(s.doc_max_mb),
});

const DAYS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']] as const;

export function PortalSettingsForm({ initial }: { initial: SettingsInput }) {
  const { form, state, pending, submit } = useActionForm<SettingsInput, unknown>({ schema: portalSettingsSchema as never, defaultValues: initial, action: savePortalSettings });
  const days = form.watch('business_days') ?? [];
  const toggle = (d: number) => form.setValue('business_days', days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort(), { shouldValidate: true });
  const dayErr = (form.formState.errors as Record<string, { message?: string } | undefined>).business_days?.message;
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Salvar configurações">
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold">Identidade do portal (white-label)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="portal_name" label="Nome do portal" maxLength={80} hint="Aparece no topo do portal do cliente." />
          <TextField form={form} name="contact_email" label="E-mail de contato" type="email" maxLength={254} />
          <TextField form={form} name="contact_phone" label="Telefone de contato" type="tel" maxLength={30} />
          <TextField form={form} name="primary_color" label="Cor principal" placeholder="#162A43" maxLength={7} hint="Formato #RRGGBB. O texto sobre ela é ajustado para manter o contraste." />
          <TextField form={form} name="secondary_color" label="Cor de apoio" placeholder="#22D3EE" maxLength={7} />
        </div>
        <TextAreaField form={form} name="welcome_message" label="Mensagem de boas-vindas" maxLength={600} />
        <TextAreaField form={form} name="footer_text" label="Texto do rodapé" maxLength={300} />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold">Prazos e alertas</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="timezone" label="Fuso horário" maxLength={60} hint="Ex.: America/Sao_Paulo. Define o «dia» dos relatórios e o expediente." />
          <TextField form={form} name="alert_due_soon_hours" label="Alertar prazo a vencer (horas)" inputMode="numeric" />
          <TextField form={form} name="alert_stale_days" label="Solicitação parada após (dias)" inputMode="numeric" />
          <TextField form={form} name="reopen_window_days" label="Janela para o cliente reabrir (dias)" inputMode="numeric" hint="0 = o cliente não reabre; abre uma nova." />
          <TextField form={form} name="business_start" label="Início do expediente" type="time" />
          <TextField form={form} name="business_end" label="Fim do expediente" type="time" />
        </div>
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Dias úteis (contam no prazo do nível de serviço)</legend>
          <div className="flex flex-wrap gap-4">
            {DAYS.map(([d, l]) => (
              <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={days.includes(d)} onChange={() => toggle(d)} />{l}</label>
            ))}
          </div>
          {dayErr ? <p role="alert" className="mt-1 text-xs text-danger">{dayErr}</p> : null}
          <p className="mt-2 text-xs text-muted">Feriados não são considerados: o prazo do nível de serviço conta apenas dias úteis e horário comercial. Para um feriado, use um prazo combinado.</p>
        </fieldset>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Documentos</legend>
        <TextField form={form} name="doc_max_mb" label="Tamanho máximo por arquivo (MB)" inputMode="numeric" hint="De 1 a 50." />
      </fieldset>
    </FormShell>
  );
}

export function CategoryForm({ id, initial }: { id?: string; initial?: { name: string; description: string; active: boolean } }) {
  const { form, state, pending, submit } = useActionForm<{ name: string; description: string; active: boolean }, unknown>({
    schema: categorySchema as never, defaultValues: initial ?? { name: '', description: '', active: true }, action: (v) => saveCategory(id ?? null, v), resetOnSuccess: !id,
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel={id ? 'Salvar' : 'Adicionar categoria'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField form={form} name="name" label="Nome" maxLength={80} />
        <TextField form={form} name="description" label="Descrição" maxLength={300} />
      </div>
      <CheckField form={form} name="active" label="Ativa (aparece ao abrir solicitações)" />
    </FormShell>
  );
}

export function SlaForm({ id, hours, active, label }: { id: string; hours: number; active: boolean; label: string }) {
  const { form, state, pending, submit } = useActionForm<{ target_hours: string; active: boolean }, unknown>({
    schema: slaSchema as never, defaultValues: { target_hours: String(hours), active }, action: (v) => saveSla(id, v),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Salvar">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField form={form} name="target_hours" label={`${label} — horas úteis`} inputMode="numeric" hint="Contadas só em dias úteis e no horário comercial." />
        <div className="self-end"><CheckField form={form} name="active" label="Política ativa" /></div>
      </div>
    </FormShell>
  );
}

// ------------------------------------------------------------------ notificações
export const MarkAllReadButton = () => <ActionButton label="Marcar todas como lidas" action={() => markNotificationsRead('all')} />;
export const MarkReadButton = ({ id }: { id: string }) => <ActionButton label="Marcar como lida" variant="ghost" action={() => markNotificationsRead([id])} />;

export function NotificationPrefs({ muted, types }: { muted: string[]; types: string[] }) {
  const [value, setValue] = useState<string[]>(muted);
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Avisos que você NÃO quer receber</legend>
        {types.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={value.includes(t)} onChange={() => setValue(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])} />
            {NOTIFICATION_TYPE_LABELS[t] ?? t}
          </label>
        ))}
      </fieldset>
      <ActionButton label="Salvar preferências" action={() => saveNotificationPrefs(value)} />
      <Button type="button" variant="ghost" onClick={() => setValue([])}>Limpar seleção</Button>
    </div>
  );
}
