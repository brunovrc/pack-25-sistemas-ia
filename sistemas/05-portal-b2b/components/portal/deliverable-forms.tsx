'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionButton, FormShell, SelectField, TextAreaField, TextField, useActionForm, type Opt } from '@/components/app/form-kit';
import { Select } from '@/components/ui/primitives';
import { acknowledgeDeliverable, attachDeliverableFile, createDeliverable, setDeliverableStatus, updateDeliverable } from '@/lib/portal/actions';
import { DELIVERABLE_LABELS, type DeliverableStatus } from '@/lib/portal/format';
import { deliverableSchema, deliverableUpdateSchema, type DeliverableInput } from '@/lib/portal/validation';

export function NewDeliverableForm({ clients, clientId, requests }: { clients?: Opt[]; clientId?: string; requests: Opt[] }) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<DeliverableInput, unknown>({
    schema: deliverableSchema as never,
    defaultValues: { client: clientId ?? clients?.[0]?.value ?? '', request: '', title: '', description: '' },
    action: createDeliverable,
    onSuccess: (r) => router.push(`/entregas/${r.id}`),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Criar entrega (rascunho)">
      {clients ? <SelectField form={form} name="client" label="Empresa cliente" options={clients} /> : null}
      <TextField form={form} name="title" label="Título da entrega" maxLength={160} />
      <TextAreaField form={form} name="description" label="Descrição" maxLength={4000} hint="O que está sendo entregue e como usar. Será lida pelo cliente quando você publicar." />
      <SelectField form={form} name="request" label="Solicitação relacionada" options={requests} empty="Nenhuma" />
    </FormShell>
  );
}

export function EditDeliverableForm({ id, initial }: { id: string; initial: { title: string; description: string } }) {
  const { form, state, pending, submit } = useActionForm<{ title: string; description: string }, unknown>({
    schema: deliverableUpdateSchema as never, defaultValues: initial, action: (v) => updateDeliverable(id, v),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Salvar">
      <TextField form={form} name="title" label="Título" maxLength={160} />
      <TextAreaField form={form} name="description" label="Descrição" maxLength={4000} />
    </FormShell>
  );
}

// Espelha private.pt_deliverable_ok: só se publica a partir de «Pronta para publicar».
const NEXT: Record<string, DeliverableStatus[]> = {
  draft: ['in_preparation', 'ready', 'cancelled'],
  in_preparation: ['draft', 'ready', 'cancelled'],
  ready: ['in_preparation', 'published', 'cancelled'],
  published: ['cancelled'],
  acknowledged: [],
  cancelled: [],
};

/** Mudança de situação da entrega pela equipe. «Publicada» avisa o cliente e libera os arquivos vinculados. */
export function DeliverableStatusControl({ id, status }: { id: string; status: string }) {
  const options = NEXT[status] ?? [];
  const [value, setValue] = useState<string>(options[0] ?? '');
  if (options.length === 0) return <p className="text-sm text-muted">Esta entrega não aceita mais mudanças de situação.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48">
        <label htmlFor="dl-status" className="mb-1 block text-sm font-medium">Mudar situação para</label>
        <Select id="dl-status" value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map((s) => <option key={s} value={s}>{DELIVERABLE_LABELS[s]}</option>)}
        </Select>
      </div>
      <ActionButton
        label="Atualizar"
        variant={value === 'published' ? 'primary' : 'secondary'}
        confirm={value === 'published' ? 'Publicar esta entrega? O cliente será avisado e passará a ver os arquivos vinculados.' : value === 'cancelled' ? 'Cancelar esta entrega?' : undefined}
        action={() => setDeliverableStatus(id, value)}
      />
    </div>
  );
}

export function AttachFile({ deliverableId, options }: { deliverableId: string; options: Opt[] }) {
  const [value, setValue] = useState(options[0]?.value ?? '');
  if (options.length === 0) return <p className="text-xs text-muted">Envie um documento da empresa para poder vinculá-lo a esta entrega.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <label htmlFor="dl-attach" className="mb-1 block text-sm font-medium">Vincular documento existente</label>
        <Select id="dl-attach" value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>
      <ActionButton label="Vincular" action={() => attachDeliverableFile(deliverableId, value, true)} />
    </div>
  );
}

export const DetachButton = ({ deliverableId, documentId }: { deliverableId: string; documentId: string }) => (
  <ActionButton label="Remover" variant="ghost" confirm="Remover este arquivo da entrega?" action={() => attachDeliverableFile(deliverableId, documentId, false)} />
);

export const AcknowledgeButton = ({ id }: { id: string }) => (
  <ActionButton label="Confirmar recebimento" variant="primary" confirm="Confirmar que você recebeu esta entrega? A equipe será avisada." action={() => acknowledgeDeliverable(id)} />
);
