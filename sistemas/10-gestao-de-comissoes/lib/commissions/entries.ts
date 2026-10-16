import 'server-only';
import type { Context } from '@/lib/auth/session';
import type { EntryRow } from '@/components/cm/entries-table';
import { APPROVAL_LABEL, ENTRY_TYPE_LABEL } from './labels';
import { PAGE_SIZE, isIsoDate, one, pageFrom, uuidOrNull, type SearchParams } from './query';

/** Extrato filtrado pela URL (sempre pelo RLS do usuário) + nomes de vendedores/vendas para exibir. */
export async function loadEntries(ctx: Context, sp: SearchParams, forceStatuses?: string[]) {
  const page = pageFrom(one(sp.page));
  const seller = uuidOrNull(one(sp.seller));
  const sale = uuidOrNull(one(sp.sale));
  const status = one(sp.status);
  const type = one(sp.type);
  const from = one(sp.from);
  const to = one(sp.to);
  let q = ctx.supabase.from('commission_entries').select('id, seller_id, sale_id, entry_type, amount_cents, approval_status, effective_at, eligible_at, cause', { count: 'exact' }).order('effective_at', { ascending: false }).order('created_at', { ascending: false });
  if (seller) q = q.eq('seller_id', seller);
  if (sale) q = q.eq('sale_id', sale);
  if (forceStatuses) q = q.in('approval_status', forceStatuses);
  else if (status && Object.keys(APPROVAL_LABEL).includes(status)) q = q.eq('approval_status', status);
  if (type && Object.keys(ENTRY_TYPE_LABEL).includes(type)) q = q.eq('entry_type', type);
  if (isIsoDate(from)) q = q.gte('effective_at', from);
  if (isIsoDate(to)) q = q.lte('effective_at', to);
  const { data, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as EntryRow[];
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const saleIds = [...new Set(rows.map((r) => r.sale_id).filter((x): x is string => !!x))];
  const [s, v] = await Promise.all([
    sellerIds.length ? ctx.supabase.from('sellers').select('id, name').in('id', sellerIds) : Promise.resolve({ data: [] }),
    saleIds.length ? ctx.supabase.from('sales').select('id, sale_number').in('id', saleIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    rows, count: count ?? 0, page,
    sellers: new Map(((s.data ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name])),
    sales: new Map(((v.data ?? []) as Array<{ id: string; sale_number: string }>).map((x) => [x.id, x.sale_number])),
  };
}

export type PendencyRow = { id: string; code: string; severity: 'critical' | 'warning'; message: string; sale_id: string | null; seller_id: string | null; created_at: string };
export async function loadOpenPendencies(ctx: Context): Promise<PendencyRow[]> {
  const { data } = await ctx.supabase.from('commission_pendencies').select('id, code, severity, message, sale_id, seller_id, created_at').eq('status', 'open').order('severity').order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as PendencyRow[];
}
