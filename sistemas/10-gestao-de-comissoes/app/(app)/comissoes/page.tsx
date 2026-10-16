import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Pagination, Section, TableShell, TD, TH } from '@/components/cm/bits';
import { EntriesTable } from '@/components/cm/entries-table';
import { CalculateForm, CalculateGoalsButton } from '@/components/cm/forms-ledger';
import { FInput, FSelect, FilterForm } from '@/components/cm/page-bits';
import { loadOptions } from '@/lib/commissions/data';
import { loadEntries, loadOpenPendencies } from '@/lib/commissions/entries';
import { dateBR } from '@/lib/commissions/format';
import { APPROVAL_LABEL, ENTRY_TYPE_LABEL, PENDENCY_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { monthEnd, monthStart, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Extrato de comissões' };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const [list, opts, pend] = await Promise.all([loadEntries(ctx, sp), loadOptions(ctx), pc.perms.manager ? loadOpenPendencies(ctx) : Promise.resolve([])]);
  const sellerName = new Map(opts.sellers.map((s) => [s.value, s.label]));
  const crit = pend.filter((p) => p.severity === 'critical');

  return (
    <>
      <PageHeader title={pc.perms.seller ? 'Meu extrato de comissões' : 'Extrato de comissões'} description="Cada linha é um lançamento imutável: comissão, bônus, estorno ou ajuste. Calculado, aprovado e pago são estados diferentes; correções entram como novos lançamentos." />
      {pc.perms.runCalculation ? (
        <Section title="Calcular" description="Processa as vendas com movimento no período. Repetir o cálculo nunca duplica lançamentos.">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <CalculateForm from={monthStart(pc.today)} to={monthEnd(pc.today)} />
            <CalculateGoalsButton />
          </div>
        </Section>
      ) : null}
      {pc.perms.manager && pend.length > 0 ? (
        <Section title={`Pendências (${pend.length})`} description={crit.length ? `${crit.length} crítica(s) impedem o fechamento do período.` : 'Avisos do último cálculo.'}>
          <Disclosure summary={`${crit.length} crítica(s) · ${pend.length - crit.length} aviso(s)`} open={crit.length > 0}>
            <TableShell caption="Pendências de cálculo">
              <thead><tr><th className={TH}>Gravidade</th><th className={TH}>Pendência</th><th className={TH}>Detalhe</th><th className={TH}>Desde</th><th className={TH} /></tr></thead>
              <tbody className="divide-y divide-border">{pend.map((p) => (
                <tr key={p.id}><td className={TD}>{p.severity === 'critical' ? <Badge tone="danger">Crítica</Badge> : <Badge tone="warning">Aviso</Badge>}</td><td className={TD}>{PENDENCY_LABEL[p.code] ?? p.code}</td><td className={TD}>{p.message}</td><td className={TD}>{dateBR(p.created_at)}</td><td className={TD}>{p.sale_id ? <Link className="underline underline-offset-2" href={`/vendas/${p.sale_id}`}>Abrir venda</Link> : null}</td></tr>
              ))}</tbody>
            </TableShell>
          </Disclosure>
        </Section>
      ) : null}
      {pc.perms.seller ? <div className="mb-4"><Alert tone="info">Discordou de um valor? Abra o lançamento e use «Abrir contestação». O valor só muda por novo lançamento aprovado.</Alert></div> : null}
      <FilterForm clear="/comissoes">
        {!pc.perms.seller ? <FSelect name="seller" label="Vendedor" sp={sp} opts={opts.sellers} /> : null}
        <FSelect name="status" label="Status" sp={sp} opts={Object.entries(APPROVAL_LABEL).map(([value, label]) => ({ value, label }))} />
        <FSelect name="type" label="Tipo" sp={sp} opts={Object.entries(ENTRY_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <FInput name="from" label="De" sp={sp} type="date" /><FInput name="to" label="Até" sp={sp} type="date" />
      </FilterForm>
      <EntriesTable rows={list.rows} sellers={list.sellers.size ? list.sellers : sellerName} sales={list.sales} />
      <Pagination base="/comissoes" sp={sp} page={list.page} total={list.count} />
    </>
  );
}
