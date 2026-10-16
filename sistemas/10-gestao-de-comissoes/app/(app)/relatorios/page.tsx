import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { FInput, FSelect, FilterForm, Money } from '@/components/cm/page-bits';
import { loadOptions } from '@/lib/commissions/data';
import { dateBR, pctBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { PRESETS, PRESET_LABEL, withParams, type SearchParams } from '@/lib/commissions/query';
import { prepareReport } from '@/lib/commissions/report-run';
import { REPORTS } from '@/lib/commissions/reports';

export const metadata: Metadata = { title: 'Relatórios' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'viewer']);
  const prep = await prepareReport(pc.ctx, pc.org, pc.profile!, pc.managedTeamIds, pc.today, sp);
  if (!prep) notFound();
  const opts = pc.profile === 'viewer' ? null : await loadOptions(pc.ctx);
  const { def, result, period } = prep;
  const q = (extra: Record<string, string | null>) => withParams('/api/exportar/relatorio', sp, { r: def.key, ...extra });
  const shown = result.rows.slice(0, 500);

  return (
    <>
      <PageHeader title="Relatórios" description="Consultas reais ao banco, no escopo do seu perfil. Exportar respeita as mesmas permissões e fica registrado na auditoria (sem os valores)." />
      {pc.profile !== 'viewer' ? (
        <nav aria-label="Relatórios disponíveis" className="mb-4 flex flex-wrap gap-1.5">
          {REPORTS.map((r) => <Link key={r.key} href={withParams('/relatorios', sp, { r: r.key })} aria-current={r.key === def.key ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-xs font-medium ${r.key === def.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-black/5 dark:hover:bg-white/5'}`}>{r.title}</Link>)}
        </nav>
      ) : <div className="mb-4"><Alert tone="info">Perfil de consulta: somente totais agregados da empresa.</Alert></div>}
      <h2 className="text-lg font-semibold">{def.title}</h2>
      <p className="mb-3 text-sm text-muted">{def.description} Período {dateBR(period.from)} a {dateBR(period.to)}.</p>
      <FilterForm clear={`/relatorios?r=${def.key}`}>
        <input type="hidden" name="r" value={def.key} />
        <FSelect name="p" label="Período" sp={sp} opts={PRESETS.map((x) => ({ value: x, label: PRESET_LABEL[x] }))} placeholder="Mês atual" />
        <FInput name="from" label="De (personalizado)" sp={sp} type="date" /><FInput name="to" label="Até" sp={sp} type="date" />
        {opts ? <FSelect name="seller" label="Vendedor" sp={sp} opts={opts.sellers} /> : null}
        {opts ? <FSelect name="team" label="Equipe" sp={sp} opts={opts.teams} /> : null}
      </FilterForm>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <a className="underline underline-offset-2" href={q({ fmt: 'csv' })}>Exportar CSV</a>
        <a className="underline underline-offset-2" href={q({ fmt: 'pdf' })}>Exportar PDF</a>
        <span className="text-xs text-muted">CSV com separador «;» e decimal com vírgula (Excel pt-BR); células que parecem fórmula são neutralizadas.</span>
      </div>
      {result.truncated ? <div className="mb-3"><Alert tone="warning">Resultado limitado a 20.000 linhas: refine o período ou os filtros.</Alert></div> : null}
      <TableShell caption={def.title} empty={shown.length === 0} emptyText="Sem dados para o período e os filtros escolhidos.">
        <thead><tr>{result.cols.map((c) => <th key={c.key} className={c.kind === 'text' || c.kind === 'date' ? TH : THR}>{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {shown.map((r, i) => <tr key={i}>{result.cols.map((c) => <Cell key={c.key} kind={c.kind} v={r[c.key]} />)}</tr>)}
        </tbody>
        {result.totals ? <tfoot><tr className="border-t border-border font-semibold">{result.cols.map((c) => <Cell key={c.key} kind={c.kind} v={result.totals![c.key]} />)}</tr></tfoot> : null}
      </TableShell>
      {result.rows.length > 500 ? <p className="mt-2 text-xs text-muted">Exibindo 500 de {result.rows.length} linhas; a exportação traz todas.</p> : null}
    </>
  );
}

function Cell({ kind, v }: { kind: string; v: string | number | null | undefined }) {
  if (v === null || v === undefined || v === '') return <td className={TD} />;
  if (kind === 'money') return <td className={TDR}><Money cents={Number(v)} /></td>;
  if (kind === 'pct') return <td className={TDR}>{pctBR(Number(v), 2)}</td>;
  if (kind === 'int') return <td className={TDR}>{Math.trunc(Number(v))}</td>;
  if (kind === 'date') return <td className={TD}>{dateBR(String(v))}</td>;
  return <td className={TD}>{String(v)}</td>;
}
