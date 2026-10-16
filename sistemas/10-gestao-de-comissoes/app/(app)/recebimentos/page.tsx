import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { Pagination, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { FInput, FSelect, FilterForm, Money } from '@/components/cm/page-bits';
import { dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { PAGE_SIZE, isIsoDate, one, pageFrom, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Recebimentos' };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const page = pageFrom(one(sp.page));
  const status = one(sp.status);
  const from = one(sp.from);
  const to = one(sp.to);
  let q = pc.ctx.supabase.from('customer_receipts').select('id, sale_id, amount_cents, received_at, external_reference, status', { count: 'exact' }).order('received_at', { ascending: false });
  if (status === 'confirmed' || status === 'reversed') q = q.eq('status', status);
  if (isIsoDate(from)) q = q.gte('received_at', from);
  if (isIsoDate(to)) q = q.lte('received_at', to);
  const { data, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Array<{ id: string; sale_id: string; amount_cents: number; received_at: string; external_reference: string | null; status: string }>;
  const ids = [...new Set(rows.map((r) => r.sale_id))];
  const { data: sales } = ids.length ? await pc.ctx.supabase.from('sales').select('id, sale_number').in('id', ids) : { data: [] };
  const no = new Map(((sales ?? []) as Array<{ id: string; sale_number: string }>).map((s) => [s.id, s.sale_number]));
  return (
    <>
      <PageHeader title="Recebimentos" description="Pagamentos de clientes registrados manualmente. Servem para planos com elegibilidade por recebimento e não representam conciliação bancária." />
      {pc.perms.manageReceipts ? <div className="mb-4"><Alert tone="info">Para registrar um recebimento, abra a venda e use «Registrar recebimento».</Alert></div> : null}
      <FilterForm clear="/recebimentos">
        <FSelect name="status" label="Situação" sp={sp} opts={[{ value: 'confirmed', label: 'Confirmados' }, { value: 'reversed', label: 'Estornados' }]} />
        <FInput name="from" label="De" sp={sp} type="date" /><FInput name="to" label="Até" sp={sp} type="date" />
      </FilterForm>
      <TableShell caption="Recebimentos" empty={rows.length === 0}>
        <thead><tr><th className={TH}>Data</th><th className={TH}>Venda</th><th className={TH}>Referência</th><th className={TH}>Situação</th><th className={THR}>Valor</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((r) => (
          <tr key={r.id}><td className={TD}>{dateBR(r.received_at)}</td><td className={TD}><Link className="underline underline-offset-2" href={`/vendas/${r.sale_id}`}>{no.get(r.sale_id) ?? 'ver'}</Link></td><td className={TD}>{r.external_reference ?? '—'}</td><td className={TD}>{r.status === 'confirmed' ? 'Confirmado' : 'Estornado'}</td><td className={TDR}><Money cents={r.amount_cents} /></td></tr>
        ))}</tbody>
      </TableShell>
      <Pagination base="/recebimentos" sp={sp} page={page} total={count ?? 0} />
    </>
  );
}
