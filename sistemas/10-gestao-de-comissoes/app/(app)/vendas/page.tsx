import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/primitives';
import { Pagination, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { FInput, FSelect, FilterForm, Money, StatusPill } from '@/components/cm/page-bits';
import { loadOptions } from '@/lib/commissions/data';
import { dateBR } from '@/lib/commissions/format';
import { SALE_STATUS_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { PAGE_SIZE, isIsoDate, one, pageFrom, safeSearch, uuidOrNull, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Vendas' };

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const page = pageFrom(one(sp.page));
  const q = safeSearch(one(sp.q));
  const status = one(sp.status);
  const seller = uuidOrNull(one(sp.seller));
  const customer = uuidOrNull(one(sp.customer));
  const from = one(sp.from);
  const to = one(sp.to);
  const opts = await loadOptions(ctx);

  let ids: string[] | null = null;
  if (seller) {
    const { data } = await ctx.supabase.from('sale_participants').select('sale_id').eq('seller_id', seller).limit(5000);
    ids = ((data ?? []) as Array<{ sale_id: string }>).map((r) => r.sale_id);
  }
  let query = ctx.supabase.from('sales').select('id, sale_number, external_reference, sale_date, status, channel, customer_id, net_amount_cents, commissionable_amount_cents, split_model', { count: 'exact' }).order('sale_date', { ascending: false }).order('sale_number', { ascending: false });
  if (q) query = query.or(`sale_number.ilike.%${q}%,external_reference.ilike.%${q}%`);
  if (status && Object.keys(SALE_STATUS_LABEL).includes(status)) query = query.eq('status', status);
  if (customer) query = query.eq('customer_id', customer);
  if (isIsoDate(from)) query = query.gte('sale_date', from);
  if (isIsoDate(to)) query = query.lte('sale_date', to);
  if (ids) query = ids.length ? query.in('id', ids.slice(0, 1000)) : query.in('id', ['00000000-0000-0000-0000-000000000000']);
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Array<{ id: string; sale_number: string; external_reference: string | null; sale_date: string; status: string; channel: string | null; customer_id: string | null; net_amount_cents: number; commissionable_amount_cents: number; split_model: string }>;
  const custName = new Map(opts.customers.map((c) => [c.value, c.label]));

  // vendas confirmadas ainda sem lançamento: aguardando cálculo
  const confirmed = rows.filter((r) => r.status === 'confirmed' || r.status === 'partially_returned').map((r) => r.id);
  const withEntries = new Set<string>();
  if (confirmed.length) {
    const { data: es } = await ctx.supabase.from('commission_entries').select('sale_id').in('sale_id', confirmed);
    for (const e of (es ?? []) as Array<{ sale_id: string }>) withEntries.add(e.sale_id);
  }

  return (
    <>
      <PageHeader title="Vendas" description="Vendas e devoluções que originam comissões. Venda confirmada é imutável; correções são cancelamento, devolução ou lançamentos compensatórios.">
        {pc.perms.manageSales ? <Link href="/vendas/nova" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Nova venda</Link> : null}
      </PageHeader>
      <FilterForm clear="/vendas">
        <FInput name="q" label="Número ou referência" sp={sp} />
        <FSelect name="status" label="Status" sp={sp} opts={Object.entries(SALE_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        {!pc.perms.seller ? <FSelect name="seller" label="Vendedor" sp={sp} opts={opts.sellers} /> : null}
        <FSelect name="customer" label="Cliente" sp={sp} opts={opts.customers} />
        <FInput name="from" label="De" sp={sp} type="date" /><FInput name="to" label="Até" sp={sp} type="date" />
      </FilterForm>
      <TableShell caption="Vendas" empty={rows.length === 0} emptyText="Nenhuma venda encontrada com estes filtros.">
        <thead><tr><th className={TH}>Número</th><th className={TH}>Data</th><th className={TH}>Cliente</th><th className={TH}>Canal</th><th className={TH}>Status</th><th className={THR}>Líquido</th><th className={THR}>Base comissionável</th><th className={TH}>Cálculo</th></tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={TD}><Link className="font-medium underline underline-offset-2" href={`/vendas/${r.id}`}>{r.sale_number}</Link>{r.external_reference ? <span className="block text-xs text-muted">{r.external_reference}</span> : null}</td>
              <td className={TD}>{dateBR(r.sale_date)}</td><td className={TD}>{r.customer_id ? custName.get(r.customer_id) ?? '—' : '—'}</td><td className={TD}>{r.channel ?? '—'}</td>
              <td className={TD}><StatusPill kind="sale" status={r.status} /></td><td className={TDR}><Money cents={r.net_amount_cents} /></td><td className={TDR}><Money cents={r.commissionable_amount_cents} /></td>
              <td className={TD}>{confirmed.includes(r.id) ? (withEntries.has(r.id) ? 'calculada' : <span className="text-warning">aguardando cálculo</span>) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <Pagination base="/vendas" sp={sp} page={page} total={count ?? 0} />
    </>
  );
}
