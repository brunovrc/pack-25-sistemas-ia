import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { PayoutForm, ReversePayoutForm } from '@/components/cm/forms-closing';
import { FSelect, FilterForm, Money, StatusPill } from '@/components/cm/page-bits';
import { brl, dateBR } from '@/lib/commissions/format';
import { PAYMENT_METHOD_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { one, uuidOrNull, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Pagamentos' };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const seller = uuidOrNull(one(sp.seller));
  let bq = ctx.supabase.from('commission_closing_balances').select('closing_id, seller_id, period_id, payable_amount_cents, paid_cents').order('period_id', { ascending: false }).limit(200);
  if (seller) bq = bq.eq('seller_id', seller);
  const { data: bal } = await bq;
  const balances = (bal ?? []) as Array<{ closing_id: string; seller_id: string; period_id: string; payable_amount_cents: number; paid_cents: number }>;
  let pq = ctx.supabase.from('payout_records').select('id, seller_id, amount_cents, payment_date, payment_method, external_reference, status, reversal_reason').order('payment_date', { ascending: false }).limit(100);
  if (seller) pq = pq.eq('seller_id', seller);
  const { data: pay } = await pq;
  const payouts = (pay ?? []) as Array<{ id: string; seller_id: string; amount_cents: number; payment_date: string; payment_method: string; external_reference: string | null; status: string; reversal_reason: string | null }>;
  const periodIds = [...new Set(balances.map((b) => b.period_id))];
  const sellerIds = [...new Set([...balances.map((b) => b.seller_id), ...payouts.map((p) => p.seller_id)])];
  const [{ data: ps }, { data: ss }] = await Promise.all([
    periodIds.length ? ctx.supabase.from('commission_periods').select('id, period_start, period_end').in('id', periodIds) : Promise.resolve({ data: [] }),
    sellerIds.length ? ctx.supabase.from('sellers').select('id, name').in('id', sellerIds) : Promise.resolve({ data: [] }),
  ]);
  const per = new Map(((ps ?? []) as Array<{ id: string; period_start: string; period_end: string }>).map((p) => [p.id, `${dateBR(p.period_start)} a ${dateBR(p.period_end)}`]));
  const names = new Map(((ss ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
  const totalPending = balances.reduce((a, b) => a + Math.max(0, b.payable_amount_cents - b.paid_cents), 0);

  return (
    <>
      <PageHeader title="Pagamentos" description="Registro dos pagamentos de comissão feitos FORA do sistema (PIX, TED, folha externa…). O sistema não transfere dinheiro. Registros não são apagados: erros são estornados e ficam no histórico." />
      <Alert tone="info">Valor total aprovado e ainda não registrado como pago nesta lista: <strong>{brl(totalPending)}</strong>.</Alert>
      <div className="mt-4"><FilterForm clear="/pagamentos">{!pc.perms.seller ? <FSelect name="seller" label="Vendedor" sp={sp} opts={[...names].map(([value, label]) => ({ value, label }))} /> : null}</FilterForm></div>
      <Section title="Saldos por fechamento">
        <TableShell caption="Saldos a pagar por fechamento" empty={balances.length === 0} emptyText="Nenhum fechamento concluído ainda.">
          <thead><tr><th className={TH}>Período</th><th className={TH}>Vendedor</th><th className={THR}>A pagar</th><th className={THR}>Registrado como pago</th><th className={THR}>Pendente</th><th className={TH}>Situação</th><th className={TH} /></tr></thead>
          <tbody className="divide-y divide-border">{balances.map((b) => {
            const pending = b.payable_amount_cents - b.paid_cents;
            return (
              <tr key={b.closing_id}>
                <td className={TD}>{per.get(b.period_id) ?? '—'}</td><td className={TD}>{names.get(b.seller_id) ?? '—'}</td><td className={TDR}>{brl(b.payable_amount_cents)}</td><td className={TDR}>{brl(b.paid_cents)}</td><td className={TDR}><Money cents={pending} strong /></td>
                <td className={TD}>{pending <= 0 ? 'Quitado' : b.paid_cents > 0 ? 'Pago parcialmente' : 'Em aberto'}</td>
                <td className={TD}>{pc.perms.payouts && pending > 0 ? <Disclosure summary="Registrar pagamento"><PayoutForm sellerId={b.seller_id} closingId={b.closing_id} pending={brl(pending)} today={pc.today} /></Disclosure> : null}</td>
              </tr>
            );
          })}</tbody>
        </TableShell>
        <p className="mt-2 text-xs text-muted">Pagamento parcial é permitido; o total registrado nunca passa do saldo aprovado (a menos que a empresa habilite essa política em Configurações).</p>
      </Section>
      <Section title="Histórico de registros">
        <TableShell caption="Pagamentos registrados" empty={payouts.length === 0}>
          <thead><tr><th className={TH}>Data</th><th className={TH}>Vendedor</th><th className={TH}>Forma</th><th className={TH}>Referência</th><th className={TH}>Situação</th><th className={THR}>Valor</th><th className={TH} /></tr></thead>
          <tbody className="divide-y divide-border">{payouts.map((p) => (
            <tr key={p.id}>
              <td className={TD}>{dateBR(p.payment_date)}</td><td className={TD}>{names.get(p.seller_id) ?? '—'}</td><td className={TD}>{PAYMENT_METHOD_LABEL[p.payment_method]}</td><td className={TD}>{p.external_reference ?? '—'}</td>
              <td className={TD}><StatusPill kind="payout" status={p.status} />{p.reversal_reason ? <span className="block text-xs text-muted">{p.reversal_reason}</span> : null}</td><td className={TDR}><Money cents={p.amount_cents} /></td>
              <td className={TD}>{pc.perms.payouts && p.status === 'recorded' ? <Disclosure summary="Estornar"><ReversePayoutForm id={p.id} /></Disclosure> : null}</td>
            </tr>
          ))}</tbody>
        </TableShell>
      </Section>
    </>
  );
}
