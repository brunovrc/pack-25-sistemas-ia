import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { CalcMemory } from '@/components/cm/calc-memory';
import { SaveSimulationForm } from '@/components/cm/forms-goals';
import { FInput, FSelect, Money } from '@/components/cm/page-bits';
import { deleteSimulation } from '@/lib/commissions/actions/goals';
import { loadOptions } from '@/lib/commissions/data';
import { BASIS_LABEL } from '@/lib/commissions/labels';
import { dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { one, type SearchParams } from '@/lib/commissions/query';
import { simulate, type SimInput, type SimResult } from '@/lib/commissions/simulate';
import { ActionButton } from '@/components/cm/fields';

export const metadata: Metadata = { title: 'Simulador de comissões' };

const read = (sp: SearchParams, p: string): SimInput => ({
  sellerId: one(sp[`${p}seller`]) ?? '', date: one(sp[`${p}date`]) ?? '', amount: one(sp[`${p}amount`]) ?? '', discount: one(sp[`${p}discount`]) ?? '', productId: one(sp[`${p}product`]) ?? '', channel: one(sp[`${p}channel`]) ?? '',
  secondSellerId: one(sp[`${p}seller2`]) ?? '', secondPct: one(sp[`${p}pct2`]) ?? '', received: one(sp[`${p}received`]) ?? '', accumulated: one(sp[`${p}accum`]) ?? '', returned: one(sp[`${p}returned`]) ?? '',
});

function Fields({ p, sp, opts, today }: { p: string; sp: SearchParams; opts: Awaited<ReturnType<typeof loadOptions>>; today: string }) {
  const k = (n: string) => `${p}${n}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FSelect name={k('seller')} label="Vendedor" sp={sp} opts={opts.sellers} placeholder="Escolha…" />
      <FInput name={k('date')} label="Data da venda" sp={{ ...sp, [k('date')]: one(sp[k('date')]) ?? today }} type="date" />
      <FInput name={k('amount')} label="Valor da venda (R$)" sp={sp} placeholder="10.000,00" />
      <FInput name={k('discount')} label="Desconto (R$)" sp={sp} />
      <FSelect name={k('product')} label="Produto" sp={sp} opts={opts.products} placeholder="Sem produto" />
      <FInput name={k('channel')} label="Canal" sp={sp} />
      <FSelect name={k('seller2')} label="2º vendedor (pool)" sp={sp} opts={opts.sellers} placeholder="Nenhum" />
      <FInput name={k('pct2')} label="Participação do 2º (%)" sp={sp} placeholder="40" />
      <FInput name={k('received')} label="Já recebido do cliente (R$)" sp={sp} />
      <FInput name={k('returned')} label="Devolvido (R$)" sp={sp} />
      <FInput name={k('accum')} label="Acumulado hipotético no mês (R$)" sp={sp} placeholder="para faixas" />
    </div>
  );
}

function Result({ r, title, names }: { r: SimResult; title: string; names: Map<string, string> }) {
  if (!r.ok) return <Alert tone="error">{title}: {r.error}</Alert>;
  return (
    <Card title={title} description={`${r.plan} v${r.version} · ${BASIS_LABEL[r.basis]} · SIMULAÇÃO — nenhum lançamento é gerado`}>
      <TableShell caption={`Resultado ${title}`} empty={r.rows.length === 0} emptyText="Nenhuma regra se aplica a esta venda.">
        <thead><tr><th className={TH}>Vendedor</th><th className={TH}>Regra</th><th className={THR}>Base</th><th className={THR}>Comissão calculada</th><th className={THR}>Elegível agora</th></tr></thead>
        <tbody className="divide-y divide-border">{r.rows.map((x, i) => <tr key={i}><td className={TD}>{names.get(x.sellerId) ?? '—'}</td><td className={TD}>{x.ruleName}</td><td className={TDR}><Money cents={x.baseCents} /></td><td className={TDR}><Money cents={x.potentialCents} strong /></td><td className={TDR}><Money cents={x.eligibleCents} /></td></tr>)}</tbody>
        <tfoot><tr className="border-t border-border font-semibold"><td className={TD} colSpan={3}>Total</td><td className={TDR}><Money cents={r.totalPotential} /></td><td className={TDR}><Money cents={r.totalEligible} /></td></tr></tfoot>
      </TableShell>
      {r.pendencies.length ? <div className="mt-3"><Alert tone="warning">{r.pendencies.map((p) => p.message).join(' ')}</Alert></div> : null}
      <div className="mt-3 space-y-2">{r.rows.slice(0, 2).map((x, i) => <Disclosure key={i} summary={`Memória de cálculo — ${names.get(x.sellerId) ?? ''}`}><CalcMemory snapshot={x.snapshot} sellers={names} /></Disclosure>)}</div>
    </Card>
  );
}

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx } = pc;
  const opts = await loadOptions(ctx);
  const names = new Map(opts.sellers.map((s) => [s.value, s.label.replace(/ \(.*\)$/, '')]));
  const a = read(sp, '');
  const b = read(sp, 'b_');
  const runA = a.sellerId && a.amount ? await simulate(ctx, { ...a, date: a.date || pc.today }) : null;
  const runB = b.sellerId && b.amount ? await simulate(ctx, { ...b, date: b.date || pc.today }) : null;
  const { data: saved } = await ctx.supabase.from('saved_simulations').select('id, name, input_json, created_at').order('created_at', { ascending: false }).limit(20);
  const list = (saved ?? []) as Array<{ id: string; name: string; input_json: { query?: string }; created_at: string }>;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' && v ? [[k, v]] : []))).toString();

  return (
    <>
      <PageHeader title="Simulador de comissões" description="Teste uma venda hipotética com o MESMO motor da produção. Nada é lançado, nenhuma venda, meta ou fechamento é alterado, e o resultado é sempre identificado como simulação." />
      <form method="get" className="grid gap-6 lg:grid-cols-2">
        <Card title="Cenário A"><Fields p="" sp={sp} opts={opts} today={pc.today} /></Card>
        <Card title="Cenário B (opcional, para comparar)"><Fields p="b_" sp={sp} opts={opts} today={pc.today} /></Card>
        <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Simular</button>
          <Link href="/simulador" className="text-sm text-muted underline underline-offset-2">Limpar</Link>
        </div>
      </form>

      {runA || runB ? (
        <Section title="Resultado">
          <div className="grid gap-6 lg:grid-cols-2">{runA ? <Result r={runA} title="Cenário A" names={names} /> : null}{runB ? <Result r={runB} title="Cenário B" names={names} /> : null}</div>
          {runA?.ok && runB?.ok ? (
            <Card title="Diferença (B − A)" className="mt-6"><p className="text-sm">Comissão calculada: <Money cents={runB.totalPotential - runA.totalPotential} strong /> · elegível agora: <Money cents={runB.totalEligible - runA.totalEligible} strong /></p></Card>
          ) : null}
          {runA?.ok ? (
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <SaveSimulationForm input={JSON.stringify({ query })} result={JSON.stringify({ a: runA, b: runB && runB.ok ? runB : null })} />
              <Link className="text-sm underline underline-offset-2" href={`/api/exportar/simulacao?${query}`}>Exportar CSV</Link>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Simulações salvas" description="Duplicar = abrir e alterar os parâmetros.">
        <TableShell caption="Simulações salvas" empty={list.length === 0} emptyText="Nenhuma simulação salva.">
          <thead><tr><th className={TH}>Nome</th><th className={TH}>Criada em</th><th className={TH} /></tr></thead>
          <tbody className="divide-y divide-border">{list.map((s) => (
            <tr key={s.id}><td className={TD}>{s.name}</td><td className={TD}>{dateBR(s.created_at)}</td>
              <td className={TD}><div className="flex items-center gap-3"><Link className="underline underline-offset-2" href={`/simulador?${s.input_json.query ?? ''}`}>Abrir / duplicar</Link><ActionButton action={deleteSimulation} fields={{ id: s.id }} label="Remover" confirm="Remover esta simulação?" /></div></td></tr>
          ))}</tbody>
        </TableShell>
      </Section>
    </>
  );
}
