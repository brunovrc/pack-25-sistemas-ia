import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/primitives';
import { TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { ActionButton } from '@/components/cm/fields';
import { FSelect, FilterForm, Money } from '@/components/cm/page-bits';
import { generateStatement } from '@/lib/commissions/actions/statements';
import { dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { one, uuidOrNull, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Demonstrativos' };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const period = uuidOrNull(one(sp.period));
  let q = ctx.supabase.from('commission_closings').select('id, period_id, seller_id, payable_amount_cents, status').eq('status', 'closed').order('created_at', { ascending: false }).limit(200);
  if (period) q = q.eq('period_id', period);
  const { data } = await q;
  const closings = (data ?? []) as Array<{ id: string; period_id: string; seller_id: string; payable_amount_cents: number }>;
  const ids = closings.map((c) => c.id);
  const [{ data: st }, { data: pr }, { data: sl }] = await Promise.all([
    ids.length ? ctx.supabase.from('commission_statements').select('closing_id, version_number, generated_at').in('closing_id', ids) : Promise.resolve({ data: [] }),
    ctx.supabase.from('commission_periods').select('id, period_start, period_end').order('period_start', { ascending: false }).limit(60),
    ids.length ? ctx.supabase.from('sellers').select('id, name').in('id', [...new Set(closings.map((c) => c.seller_id))]) : Promise.resolve({ data: [] }),
  ]);
  const stmts = (st ?? []) as Array<{ closing_id: string; version_number: number; generated_at: string }>;
  const periods = (pr ?? []) as Array<{ id: string; period_start: string; period_end: string }>;
  const pname = new Map(periods.map((p) => [p.id, `${dateBR(p.period_start)} a ${dateBR(p.period_end)}`]));
  const sname = new Map(((sl ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Demonstrativos" description="Demonstrativo individual de cada fechamento: vendas, taxas, bônus, ajustes, estornos, total aprovado, valor registrado como pago e saldo. PDF armazenado em área privada; cada emissão é uma versão nova." />
      <FilterForm clear="/demonstrativos"><FSelect name="period" label="Período" sp={sp} opts={periods.map((p) => ({ value: p.id, label: pname.get(p.id)! }))} /></FilterForm>
      <TableShell caption="Demonstrativos por fechamento" empty={closings.length === 0} emptyText="Nenhum fechamento concluído ainda.">
        <thead><tr><th className={TH}>Período</th><th className={TH}>Vendedor</th><th className={THR}>A pagar</th><th className={TH}>PDF</th><th className={TH} /></tr></thead>
        <tbody className="divide-y divide-border">{closings.map((c) => {
          const mine = stmts.filter((x) => x.closing_id === c.id).sort((a, b) => b.version_number - a.version_number);
          return (
            <tr key={c.id}>
              <td className={TD}>{pname.get(c.period_id) ?? '—'}</td><td className={TD}>{sname.get(c.seller_id) ?? '—'}</td><td className={TDR}><Money cents={c.payable_amount_cents} /></td>
              <td className={TD}>{mine[0] ? <span className="flex items-center gap-3">v{mine[0].version_number} · {dateBR(mine[0].generated_at)} <a className="underline underline-offset-2" href={`/api/demonstrativos/${c.id}`}>Baixar PDF</a></span> : <span className="text-muted">ainda não gerado</span>}</td>
              <td className={TD}><div className="flex flex-wrap items-center gap-3"><Link className="underline underline-offset-2" href={`/demonstrativos/${c.id}`}>Ver</Link><a className="underline underline-offset-2" href={`/api/demonstrativos/${c.id}?fmt=csv`}>CSV</a>{pc.perms.payouts ? <ActionButton action={generateStatement} fields={{ id: c.id }} label={mine[0] ? 'Gerar nova versão' : 'Gerar PDF'} /> : null}</div></td>
            </tr>
          );
        })}</tbody>
      </TableShell>
    </>
  );
}
