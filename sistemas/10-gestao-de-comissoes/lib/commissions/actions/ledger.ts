'use server';

/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor de consultas do PostgREST não tem tipos gerados neste projeto */

import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { civilDateIn, monthEnd, monthStart } from '../query';
import { bustAll, dbMessage, formObject, guarded, parse } from '../action-kit';
import { runCalculation, runGoals } from '../run';
import { adjustmentDecisionSchema, adjustmentSchema, disputeOpenSchema, disputeRespondSchema, isoDate, periodSchema, reviewSchema } from '../schemas';
import { nowMs } from '@/lib/time';
import { z } from 'zod';

const today = async (a: { ctx: { supabase: any }; org: string }): Promise<string> => {
  const { data } = await a.ctx.supabase.from('commission_settings').select('timezone').eq('organization_id', a.org).maybeSingle();
  return civilDateIn(new Date(nowMs()), (data as { timezone?: string } | null)?.timezone ?? 'America/Sao_Paulo');
};

// ----------------------------------------------------------------------------- cálculo por período
export async function calculatePeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(periodSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'calculatePeriod', async (a) => {
    const r = await runCalculation(a.ctx, a.org, { runType: 'period', from: p.data.start, to: p.data.end });
    bustAll();
    if (r.sales === 0) return succeed('Nenhuma venda com movimento no período.');
    const parts = [`${r.sales} venda(s) processada(s)`, `${r.entriesNew} lançamento(s) novo(s)`, `${r.entriesSkipped} já existente(s) (sem duplicar)`];
    if (r.criticalPendencies > 0) return { ...succeed(`${parts.join(' · ')}.`), message: `${parts.join(' · ')}. Atenção: ${r.criticalPendencies} pendência(s) crítica(s) impedem o fechamento.` };
    return succeed(`${parts.join(' · ')}.`);
  });
}

export async function calculateGoals(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return guarded('finance', 'calculateGoals', async (a) => {
    const r = await runGoals(a.ctx, a.org, await today(a));
    bustAll();
    return succeed(r.entriesNew > 0 ? `${r.entriesNew} bônus lançado(s).` : 'Nenhum bônus novo (o mesmo bônus nunca é lançado duas vezes).');
  });
}

/** Atalho do mês corrente para quem não quer digitar datas. */
export async function calculateCurrentMonth(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(z.object({ ref: isoDate('Data') }), raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'calculateCurrentMonth', async (a) => {
    const r = await runCalculation(a.ctx, a.org, { runType: 'period', from: monthStart(p.data.ref), to: monthEnd(p.data.ref) });
    bustAll();
    return succeed(r.sales === 0 ? 'Nenhuma venda com movimento no mês.' : `${r.sales} venda(s) processada(s) · ${r.entriesNew} lançamento(s) novo(s) · ${r.entriesSkipped} já existente(s).`);
  });
}

// ----------------------------------------------------------------------------- revisão e aprovação
export async function reviewEntries(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const ids = fd.getAll('ids').filter((x): x is string => typeof x === 'string');
  const p = parse(reviewSchema, { ids, decision: raw.decision, justification: raw.justification }, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'reviewEntries', async ({ ctx, org }) => {
    const { data, error } = await ctx.supabase.rpc('cm_review_entries', { p_org: org, p_ids: p.data.ids, p_decision: p.data.decision, p_justification: p.data.justification });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    const n = (data as { changed: number }).changed;
    const verb = { submit: 'enviado(s) para revisão', approve: 'aprovado(s)', reject: 'rejeitado(s)', reopen: 'reabertos para revisão' }[p.data.decision];
    return succeed(`${n} lançamento(s) ${verb}.`);
  });
}

// ----------------------------------------------------------------------------- contestações
export async function openDispute(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(disputeOpenSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('seller', 'openDispute', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_open_dispute', { p_org: org, p_entry: p.data.entry_id, p_description: p.data.description });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Contestação registrada. O valor não muda até a análise do gestor ou do financeiro.');
  });
}

export async function respondDispute(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(disputeRespondSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'respondDispute', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_respond_dispute', { p_org: org, p_dispute: p.data.id, p_status: p.data.status, p_resolution: p.data.resolution, p_adjustment_entry: p.data.adjustment_entry });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed(p.data.status === 'in_review' ? 'Contestação em análise.' : 'Resposta registrada.');
  });
}

// ----------------------------------------------------------------------------- ajustes
export async function createAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(adjustmentSchema, raw, raw);
  if (!p.ok) return p.state;
  const v = p.data;
  const direction = v.type === 'positive' || v.type === 'exceptional_bonus' ? 'credit' : v.type === 'negative' || v.type === 'administrative_reversal' ? 'debit' : v.direction;
  if (!direction) return fail('Informe se a correção é um crédito ou um débito.', { direction: ['Escolha crédito ou débito.'] }, raw);
  return guarded('finance', 'createAdjustment', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_create_adjustment', {
      p_org: org, p_seller: v.seller_id, p_type: v.type, p_direction: direction, p_amount: v.amount, p_reason: v.reason, p_reference: v.reference, p_related: v.related_entry, p_effective: v.effective_at,
    });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Ajuste registrado.');
  });
}

export async function decideAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(adjustmentDecisionSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'decideAdjustment', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_decide_adjustment', { p_org: org, p_adj: p.data.id, p_decision: p.data.decision, p_note: p.data.note });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed(p.data.decision === 'approve' ? 'Ajuste aprovado e lançado no extrato.' : 'Ajuste rejeitado.');
  });
}
