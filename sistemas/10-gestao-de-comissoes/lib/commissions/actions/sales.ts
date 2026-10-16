'use server';

import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { logEvent } from '@/lib/log';
import { allocateByWeights, parseMoneyToCents } from '../engine';
import { bustAll, dbMessage, formObject, guarded, parse, type ActionCtx, type SaveResult } from '../action-kit';
import { centsToInput } from '../format';
import { civilDateIn } from '../query';
import { runCalculation } from '../run';
import { cancelSaleSchema, idSchema, receiptSchema, returnSchema, reverseReceiptSchema, saleDraftSchema } from '../schemas';
import { nowMs } from '@/lib/time';

/** Administrador/financeiro calculam na hora; gestor registra e a venda fica «aguardando cálculo» até o financeiro rodar. */
async function recalcSale(a: ActionCtx, saleId: string): Promise<string> {
  if (a.access.profile !== 'admin' && a.access.profile !== 'finance') return ' O cálculo das comissões será feito pelo financeiro.';
  try {
    const { data } = await a.ctx.supabase.from('commission_settings').select('timezone').eq('organization_id', a.org).maybeSingle();
    const today = civilDateIn(new Date(nowMs()), (data as { timezone?: string } | null)?.timezone ?? 'America/Sao_Paulo');
    const r = await runCalculation(a.ctx, a.org, { runType: 'sale', saleIds: [saleId], from: today, to: today });
    return r.entriesNew > 0 ? ` ${r.entriesNew} lançamento(s) de comissão gerado(s).` : ' Nenhum lançamento novo foi necessário.';
  } catch (e) {
    logEvent('error', 'cm_recalc_failed', { name: e instanceof Error ? e.name : 'unknown' });
    return ' A venda foi registrada, mas o cálculo falhou: veja as pendências e rode o cálculo novamente.';
  }
}

// ----------------------------------------------------------------------------- venda (rascunho → confirmada)
export async function saveSale(_: ActionState, fd: FormData): Promise<SaveResult> {
  const raw = formObject(fd);
  let json: unknown;
  try { json = JSON.parse(raw.payload ?? ''); } catch { return fail('Não foi possível ler os dados da venda.'); }
  const p = parse(saleDraftSchema, json);
  if (!p.ok) return p.state;
  return guarded('manager', 'saveSale', async (a) => {
    const v = p.data;
    const { ctx, org } = a;
    const prim = v.participants.filter((x) => x.primary).length;
    if (prim !== 1) return fail('Marque exatamente um vendedor como principal.');
    const { data, error } = await ctx.supabase.rpc('cm_save_sale_draft', {
      p_org: org, p_id: v.id,
      p_header: { sale_number: v.sale_number, external_reference: v.external_reference, sale_date: v.sale_date, channel: v.channel, customer_id: v.customer_id, split_model: v.split_model },
      p_items: v.items.map((i) => ({ product_id: i.product_id, description: i.description, quantity: i.quantity, unit_price_cents: i.unit_price, discount_cents: i.discount ?? 0, commissionable_amount_cents: i.commissionable, cost_cents: i.cost })),
      p_participants: v.participants.map((x) => ({ seller_id: x.seller_id, allocation_percentage: x.allocation, participation_type: x.primary ? 'primary' : 'secondary' })),
    });
    if (error) return fail(dbMessage(error, 'Já existe uma venda com este número ou referência externa.'));
    const id = data as string;
    if (!v.confirm) {
      bustAll();
      return { ...succeed('Rascunho salvo.'), id, redirectTo: `/vendas/${id}` };
    }
    const c = await ctx.supabase.rpc('cm_confirm_sale', { p_org: org, p_id: id });
    if (c.error) {
      bustAll();
      return { ...fail(`Rascunho salvo, mas a venda não foi confirmada: ${dbMessage(c.error)}`), id, redirectTo: `/vendas/${id}` };
    }
    const extra = await recalcSale(a, id);
    bustAll();
    return { ...succeed(`Venda confirmada.${extra}`), id, redirectTo: `/vendas/${id}` };
  });
}

export async function discardSaleDraft(_: ActionState, fd: FormData): Promise<SaveResult> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'discardSaleDraft', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_discard_sale_draft', { p_org: org, p_id: p.data.id });
    if (error) return fail(dbMessage(error));
    bustAll();
    return { ...succeed('Rascunho descartado.'), redirectTo: '/vendas' };
  });
}

export async function confirmSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'confirmSale', async (a) => {
    const { error } = await a.ctx.supabase.rpc('cm_confirm_sale', { p_org: a.org, p_id: p.data.id });
    if (error) return fail(dbMessage(error));
    const extra = await recalcSale(a, p.data.id);
    bustAll();
    return succeed(`Venda confirmada.${extra}`);
  });
}

export async function cancelSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(cancelSaleSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'cancelSale', async (a) => {
    const { error } = await a.ctx.supabase.rpc('cm_cancel_sale', { p_org: a.org, p_id: p.data.id, p_reason: p.data.reason, p_date: p.data.date, p_event_id: null });
    if (error) return fail(dbMessage(error), undefined, raw);
    const extra = await recalcSale(a, p.data.id);
    bustAll();
    return succeed(`Venda cancelada.${extra}`);
  });
}

// ----------------------------------------------------------------------------- devolução
type ItemRow = { id: string; commissionable_amount_cents: number };
/** Rateia o valor devolvido entre os itens pelo saldo comissionável de cada um (maior resto: soma exata). */
async function proportionalItems(a: ActionCtx, saleId: string, amount: number): Promise<Record<string, number> | string> {
  const { data: items } = await a.ctx.supabase.from('sale_items').select('id, commissionable_amount_cents').eq('sale_id', saleId).order('position');
  const { data: events } = await a.ctx.supabase.from('sale_events').select('metadata_json').eq('sale_id', saleId).in('event_type', ['partially_returned', 'totally_returned']);
  const rows = (items ?? []) as ItemRow[];
  if (!rows.length) return 'Venda sem itens.';
  const returned = new Map<string, number>();
  for (const e of (events ?? []) as Array<{ metadata_json: { itemAmounts?: Record<string, number> } | null }>) {
    for (const [k, v] of Object.entries(e.metadata_json?.itemAmounts ?? {})) returned.set(k, (returned.get(k) ?? 0) + Number(v));
  }
  const room = rows.map((r) => Math.max(0, r.commissionable_amount_cents - (returned.get(r.id) ?? 0)));
  if (room.reduce((x, y) => x + y, 0) < amount) return 'A devolução excede o saldo comissionável da venda.';
  const alloc = allocateByWeights(amount, room.map(String));
  const out: Record<string, number> = {};
  rows.forEach((r, i) => { if ((alloc[i] ?? 0) > 0) out[r.id] = alloc[i]!; });
  // o rateio proporcional nunca pode passar do saldo de um item
  for (const [i, r] of rows.entries()) if ((out[r.id] ?? 0) > (room[i] ?? 0)) return 'Informe a devolução por item (o rateio proporcional passaria do saldo de um item).';
  return out;
}

export async function registerReturn(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  // valores por item (campos item_<uuid>) têm prioridade; sem eles, rateio proporcional do valor total
  const perItem: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('item_') || v.trim() === '') continue;
    try { const c = parseMoneyToCents(v); if (c > 0) perItem[k.slice(5)] = c; } catch { return fail('Valor devolvido por item inválido (use 1.234,56).', undefined, raw); }
  }
  const hasItems = Object.keys(perItem).length > 0;
  const p = parse(returnSchema, hasItems ? { ...raw, amount: centsToInput(Object.values(perItem).reduce((x, y) => x + y, 0)) } : raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'registerReturn', async (a) => {
    const v = p.data;
    const items = hasItems ? perItem : await proportionalItems(a, v.sale_id, v.amount);
    if (typeof items === 'string') return fail(items, undefined, raw);
    const { error } = await a.ctx.supabase.rpc('cm_register_return', { p_org: a.org, p_sale: v.sale_id, p_amount: Object.values(items).reduce((x, y) => x + y, 0), p_date: v.date, p_items: items, p_reason: v.reason, p_event_id: v.event_id });
    if (error) return fail(dbMessage(error), undefined, raw);
    const extra = await recalcSale(a, v.sale_id);
    bustAll();
    return succeed(`Devolução registrada.${extra}`);
  });
}

// ----------------------------------------------------------------------------- recebimentos
export async function registerReceipt(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(receiptSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'registerReceipt', async (a) => {
    const v = p.data;
    const { error } = await a.ctx.supabase.rpc('cm_register_receipt', { p_org: a.org, p_sale: v.sale_id, p_amount: v.amount, p_date: v.date, p_reference: v.reference, p_notes: v.notes });
    if (error) return fail(dbMessage(error), undefined, raw);
    const extra = await recalcSale(a, v.sale_id);
    bustAll();
    return succeed(`Recebimento registrado (controle gerencial, não é conciliação bancária).${extra}`);
  });
}

export async function reverseReceipt(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(reverseReceiptSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'reverseReceipt', async (a) => {
    const { data: r } = await a.ctx.supabase.from('customer_receipts').select('sale_id').eq('id', p.data.id).maybeSingle();
    const { error } = await a.ctx.supabase.rpc('cm_reverse_receipt', { p_org: a.org, p_receipt: p.data.id, p_reason: p.data.reason });
    if (error) return fail(dbMessage(error), undefined, raw);
    const saleId = (r as { sale_id?: string } | null)?.sale_id;
    const extra = saleId ? await recalcSale(a, saleId) : '';
    bustAll();
    return succeed(`Recebimento estornado.${extra}`);
  });
}
