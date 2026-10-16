import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { DefinitionList, Money } from '@/components/cm/page-bits';
import { brl, dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';
import { loadStatement, statementSummary } from '@/lib/commissions/statement';

export const metadata: Metadata = { title: 'Demonstrativo' };

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const s = await loadStatement(pc.ctx, pc.org, id);
  if (!s) notFound();
  return (
    <>
      <PageHeader title={`Demonstrativo — ${s.sellerName}`} description={`${dateBR(s.periodStart)} a ${dateBR(s.periodEnd)}`}>
        <div className="flex items-center gap-4 print:hidden"><Link href="/demonstrativos" className="text-sm underline underline-offset-2">← Demonstrativos</Link><a className="text-sm underline underline-offset-2" href={`/api/demonstrativos/${id}?fmt=csv`}>CSV</a><a className="text-sm underline underline-offset-2" href={`/api/demonstrativos/${id}`}>PDF</a></div>
      </PageHeader>
      <Card><DefinitionList items={statementSummary(s).map(([k, v]) => [k, v] as [string, string])} /></Card>
      <Section title="Detalhamento" description="Cada linha é um lançamento do fechamento, com venda, base, plano/versão, regra, taxa e valor.">
        <TableShell caption="Lançamentos do demonstrativo" empty={s.lines.length === 0}>
          <thead><tr><th className={TH}>Data</th><th className={TH}>Venda</th><th className={TH}>Cliente</th><th className={TH}>Tipo</th><th className={THR}>Base</th><th className={TH}>Plano</th><th className={TH}>Regra</th><th className={THR}>Taxa</th><th className={THR}>Valor</th><th className={TH}>Status</th></tr></thead>
          <tbody className="divide-y divide-border">{s.lines.map((l, i) => (
            <tr key={i}><td className={TD}>{dateBR(l.date)}</td><td className={TD}>{l.sale || '—'}</td><td className={TD}>{l.customer || '—'}</td><td className={TD}>{l.type}</td><td className={TDR}>{l.base === null ? '—' : brl(l.base)}</td><td className={TD}>{l.plan || '—'}</td><td className={TD}>{l.rule || '—'}</td><td className={TDR}>{l.rate || '—'}</td><td className={TDR}><Money cents={l.amount} /></td><td className={TD}>{l.status}</td></tr>
          ))}</tbody>
        </TableShell>
      </Section>
      <div className="mt-4"><Alert tone="info">Controle gerencial de comissões. Não substitui folha de pagamento nem recibo salarial, não calcula encargos trabalhistas ou fiscais e não afirma conformidade jurídica.</Alert></div>
      {s.footer ? <p className="mt-3 text-xs text-muted">{s.footer}</p> : null}
    </>
  );
}
