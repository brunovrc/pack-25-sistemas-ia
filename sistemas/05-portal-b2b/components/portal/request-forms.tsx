'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionButton, FormShell, SelectField, TextAreaField, TextField, useActionForm, type Opt } from '@/components/app/form-kit';
import { Alert, Button } from '@/components/ui/primitives';
import { addComment, assignRequest, changeRequestStatus, createRequest, editRequest, setRequestDue } from '@/lib/portal/actions';
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, CLIENT_STATUS_LABELS, type RequestStatus } from '@/lib/portal/format';
import { commentSchema, dueSchema, requestCreateSchema, requestEditSchema, statusChangeSchema, type CommentInput, type DueInput, type RequestCreateInput, type RequestEditInput, type StatusChangeInput } from '@/lib/portal/validation';
import { needsReason, nextStatuses, type Who } from '@/lib/portal/workflow';

const PRIORITY_OPTS: Opt[] = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

/** Nova solicitação. A equipe escolhe a empresa e o responsável; o cliente abre na própria conta (sem prioridade «urgente»: o banco também recusa). */
export function NewRequestForm({ clients, categories, assignees, clientId, portal }: {
  clients?: Opt[]; categories: Opt[]; assignees?: Opt[]; clientId?: string; portal: boolean;
}) {
  const router = useRouter();
  const { form, state, pending, submit } = useActionForm<RequestCreateInput, unknown>({
    schema: requestCreateSchema as never,
    defaultValues: { client: clientId ?? clients?.[0]?.value ?? '', title: '', description: '', category: '', priority: 'normal', assigned_to: '' },
    action: createRequest,
    onSuccess: (r) => router.push(`${portal ? '/portal' : ''}/solicitacoes/${r.id}`),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Abrir solicitação">
      {!portal && clients ? <SelectField form={form} name="client" label="Empresa cliente" options={clients} /> : null}
      <TextField form={form} name="title" label="Título" maxLength={160} hint="Resuma o pedido em uma frase." />
      <TextAreaField form={form} name="description" label="Descrição" maxLength={8000} hint="Conte o contexto, o resultado esperado e qualquer prazo importante." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField form={form} name="category" label="Categoria" options={categories} empty="Sem categoria" />
        <SelectField form={form} name="priority" label="Prioridade" options={portal ? PRIORITY_OPTS.filter((o) => o.value !== 'urgent') : PRIORITY_OPTS} hint={portal ? 'Para urgências, fale com a equipe.' : 'O prazo do nível de serviço é calculado pela prioridade.'} />
      </div>
      {!portal && assignees ? <SelectField form={form} name="assigned_to" label="Responsável" options={assignees} empty="Definir depois" /> : null}
    </FormShell>
  );
}

export function EditRequestForm({ id, initial, categories, canEditPriority = true }: { id: string; initial: RequestEditInput; categories: Opt[]; canEditPriority?: boolean }) {
  const { form, state, pending, submit } = useActionForm<RequestEditInput, unknown>({
    schema: requestEditSchema as never, defaultValues: initial, action: (v) => editRequest(id, v),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Salvar alterações">
      <TextField form={form} name="title" label="Título" maxLength={160} />
      <TextAreaField form={form} name="description" label="Descrição" maxLength={8000} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField form={form} name="category" label="Categoria" options={categories} empty="Sem categoria" />
        {canEditPriority ? <SelectField form={form} name="priority" label="Prioridade" options={PRIORITY_OPTS} hint="Mudar a prioridade recalcula o prazo do nível de serviço (prazos combinados não mudam)." /> : null}
      </div>
    </FormShell>
  );
}

/** Comentário. A equipe escolhe entre compartilhado e INTERNO (o cliente nunca vê o interno); o cliente só comenta de forma compartilhada. */
export function CommentForm({ requestId, staff, disabledReason }: { requestId: string; staff: boolean; disabledReason?: string }) {
  const { form, state, pending, submit } = useActionForm<CommentInput, unknown>({
    schema: commentSchema as never, defaultValues: { body: '', visibility: 'shared' }, action: (v) => addComment(requestId, v), resetOnSuccess: true,
  });
  if (disabledReason) return <Alert tone="info">{disabledReason}</Alert>;
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Enviar comentário">
      <TextAreaField form={form} name="body" label={staff ? 'Novo comentário' : 'Responder ou comentar'} maxLength={5000} />
      {staff ? (
        <SelectField form={form} name="visibility" label="Visibilidade" options={[{ value: 'shared', label: 'Compartilhado com o cliente' }, { value: 'internal', label: 'Interno (só a equipe)' }]} hint="Notas internas nunca aparecem no portal do cliente." />
      ) : null}
    </FormShell>
  );
}

/** Troca de situação, mostrando só as transições permitidas ao papel. */
export function StatusForm({ id, current, who, reopenAllowed = true }: { id: string; current: RequestStatus; who: Who; reopenAllowed?: boolean }) {
  const options = nextStatuses(who, current).filter((s) => !(who === 'client' && current === 'completed' && s === 'open' && !reopenAllowed));
  const labels = who === 'client' ? CLIENT_STATUS_LABELS : STATUS_LABELS;
  const { form, state, pending, submit } = useActionForm<StatusChangeInput, unknown>({
    schema: statusChangeSchema as never, defaultValues: { status: options[0] ?? current, reason: '' }, action: (v) => changeRequestStatus(id, v),
  });
  const to = form.watch('status') as RequestStatus;
  if (options.length === 0) return <p className="text-sm text-muted">Nenhuma mudança de situação disponível para você agora.</p>;
  const reasonNeeded = needsReason(current, to);
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Atualizar situação">
      <SelectField form={form} name="status" label="Nova situação" options={options.map((s) => ({ value: s, label: s === 'open' && current === 'completed' ? 'Reabrir solicitação' : labels[s] }))} />
      <TextField form={form} name="reason" label={reasonNeeded ? 'Motivo (obrigatório)' : 'Motivo (opcional)'} maxLength={500} hint="Fica registrado no histórico da solicitação." />
    </FormShell>
  );
}

export function AssignControl({ id, current, options }: { id: string; current: string | null; options: Opt[] }) {
  const [value, setValue] = useState(current ?? '');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <label htmlFor="assign" className="mb-1 block text-sm font-medium">Responsável</label>
        <select id="assign" value={value} onChange={(e) => setValue(e.target.value)} className="min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm">
          <option value="">Sem responsável</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <ActionButton label="Atribuir" pendingLabel="Atribuindo…" action={() => assignRequest(id, value || null)} />
    </div>
  );
}

export function DueForm({ id, initialDate, initialTime }: { id: string; initialDate: string; initialTime: string }) {
  const { form, state, pending, submit } = useActionForm<DueInput, unknown>({
    schema: dueSchema as never, defaultValues: { date: initialDate, time: initialTime, kind: 'agreed', reason: '' }, action: (v) => setRequestDue(id, v),
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Definir prazo">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="date" label="Data" type="date" />
        <TextField form={form} name="time" label="Hora" type="time" />
      </div>
      <SelectField form={form} name="kind" label="Tipo de prazo" options={[{ value: 'agreed', label: 'Prazo combinado com o cliente' }, { value: 'estimate', label: 'Estimativa da equipe' }]} hint="A data e a hora são no fuso do portal. Alterações ficam no histórico de prazos." />
      <TextField form={form} name="reason" label="Motivo" maxLength={300} />
    </FormShell>
  );
}

/** Botões rápidos do cliente (cancelar / reabrir), com confirmação. */
export function ClientQuickActions({ id, status, canReopen }: { id: string; status: RequestStatus; canReopen: boolean }) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<'cancelled' | 'open' | null>(null);
  const cancel = status === 'open' || status === 'in_review';
  const reopen = status === 'completed' && canReopen;
  if (!cancel && !reopen) return null;
  const target = cancel ? 'cancelled' : 'open';
  return (
    <div className="space-y-2">
      {open ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <label htmlFor="quick-reason" className="block text-sm font-medium">{target === 'cancelled' ? 'Motivo do cancelamento (obrigatório)' : 'Por que está reabrindo? (obrigatório)'}</label>
          <textarea id="quick-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <ActionButton label={target === 'cancelled' ? 'Confirmar cancelamento' : 'Confirmar reabertura'} variant={target === 'cancelled' ? 'danger' : 'primary'} action={() => changeRequestStatus(id, { status: target, reason })} onDone={() => setOpen(null)} />
            <Button type="button" variant="secondary" onClick={() => setOpen(null)}>Voltar</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant={target === 'cancelled' ? 'secondary' : 'primary'} onClick={() => setOpen(target)}>{target === 'cancelled' ? 'Cancelar solicitação' : 'Reabrir solicitação'}</Button>
      )}
    </div>
  );
}
