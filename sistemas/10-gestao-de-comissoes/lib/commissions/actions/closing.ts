'use server';

import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { bustAll, dbMessage, formObject, guarded, parse } from '../action-kit';
import { cancelPeriodSchema, payoutSchema, periodIdSchema, periodSchema, reopenSchema, reversePayoutSchema } from '../schemas';

export async function openPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(periodSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'openPeriod', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_open_period', { p_org: org, p_start: p.data.start, p_end: p.data.end });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Período aberto.');
  });
}

export async function prepareClosings(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(periodIdSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'prepareClosings', async ({ ctx, org }) => {
    const { data, error } = await ctx.supabase.rpc('cm_prepare_closings', { p_org: org, p_period: p.data.id });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    const n = (data as { closings: number }).closings;
    return succeed(n === 0 ? 'Nenhum lançamento aprovado a incluir neste período.' : `Conferência montada: ${n} fechamento(s) individual(is). Revise cada vendedor antes de enviar para aprovação.`);
  });
}

export async function submitPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(periodIdSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'submitPeriod', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_submit_period', { p_org: org, p_period: p.data.id });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Período enviado para aprovação.');
  });
}

export async function closePeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(periodIdSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'closePeriod', async ({ ctx, org }) => {
    const { data, error } = await ctx.supabase.rpc('cm_close_period', { p_org: org, p_period: p.data.id });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed(`Período fechado (${(data as { closed: number }).closed} fechamento(s)). Valores e itens ficam imutáveis; gere os demonstrativos.`);
  });
}

export async function reopenPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(reopenSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'reopenPeriod', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_reopen_period', { p_org: org, p_period: p.data.id, p_reason: p.data.reason });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Período reaberto por procedimento formal (registrado na auditoria).');
  });
}

export async function cancelPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(cancelPeriodSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'cancelPeriod', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_cancel_period', { p_org: org, p_period: p.data.id, p_reason: p.data.reason });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Período cancelado.');
  });
}

// ----------------------------------------------------------------------------- pagamentos registrados (nada é transferido pelo sistema)
export async function recordPayout(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(payoutSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'recordPayout', async ({ ctx, org }) => {
    const v = p.data;
    const { error } = await ctx.supabase.rpc('cm_record_payout', {
      p_org: org, p_seller: v.seller_id, p_date: v.date, p_method: v.method, p_ref: v.reference, p_notes: v.notes, p_alloc: [{ closing_id: v.closing_id, amount_cents: v.amount }],
    });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Pagamento registrado. O sistema apenas registra: a transferência é feita fora dele.');
  });
}

export async function reversePayout(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(reversePayoutSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'reversePayout', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_reverse_payout', { p_org: org, p_payout: p.data.id, p_reason: p.data.reason });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Registro de pagamento estornado (o histórico permanece).');
  });
}
