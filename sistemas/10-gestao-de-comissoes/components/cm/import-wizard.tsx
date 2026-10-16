'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert, Field, Select } from '@/components/ui/primitives';
import { processImport, type ImportResult } from '@/lib/commissions/actions/imports';
import { FIELDS, MAX_BYTES, ImportFormatError, autoMap, parseCsv, type ImportType } from '@/lib/commissions/import-core';
import { IMPORT_TYPE_LABEL } from '@/lib/commissions/labels';
import { pushFlash } from './flash';

const TEMPLATES: Record<ImportType, string> = {
  customers: 'nome;documento;email;telefone\nMercado Central Ltda;12.345.678/0001-90;compras@mercado.exemplo;(11) 3000-0000',
  sellers: 'nome;codigo;tipo;equipe;inicio\nMaria Exemplo;V100;interno;Equipe Norte;01/01/2026',
  sales: 'numero;referencia;data;cliente;vendedor;participacao;vendedor2;participacao2;divisao;canal;sku;quantidade;preco;desconto\nV-1001;ERP-1001;10/03/2026;Mercado Central Ltda;V100;60;V101;40;pool;Online;SKU-1;2;1.500,00;0',
  receipts: 'numero;valor;data;referencia\nV-1001;1.500,00;20/03/2026;PIX-777',
  goals: 'nome;tipo;valor;inicio;fim;escopo;referencia\nMeta março;valor vendido;100.000,00;01/03/2026;31/03/2026;vendedor;V100',
};

/** Passo a passo: arquivo → mapeamento → validação (prévia, erros, duplicidades) → confirmação. Tudo é revalidado no servidor. */
export function ImportWizard({ canReceipts }: { canReceipts: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<ImportType>('sales');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, number | null>>({});
  const [opts, setOpts] = useState({ confirmSales: false, createCustomers: false, partial: false });
  const [res, setRes] = useState<ImportResult | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = async (file: File | null) => {
    setRes(null); setLocal(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setLocal('Arquivo acima de 5 MB.'); return; }
    const t = await file.text();
    try {
      const p = parseCsv(t);
      setText(t); setFileName(file.name); setHeaders(p.headers); setMap(autoMap(type, p.headers));
    } catch (e) { setText(''); setHeaders([]); setLocal(e instanceof ImportFormatError ? e.message : 'Não foi possível ler o arquivo.'); }
  };
  const changeType = (t: ImportType) => { setType(t); setRes(null); if (headers.length) setMap(autoMap(t, headers)); };
  const run = (apply: boolean) => start(async () => {
    const r = await processImport({ type, text, fileName, mapping: map, options: opts, apply });
    setRes(r);
    if ('report' in r && r.report.applied) { pushFlash(`Importação concluída: ${r.report.accepted} linha(s) aceita(s), ${r.report.rejected} rejeitada(s).`); router.refresh(); }
  });
  const missing = FIELDS[type].filter((f) => f.required && (map[f.key] === null || map[f.key] === undefined));
  const rep = res && 'report' in res ? res.report : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        <Field label="O que importar" name="imp-type">
          <Select id="imp-type" value={type} onChange={(e) => changeType(e.target.value as ImportType)}>
            {Object.entries(IMPORT_TYPE_LABEL).filter(([k]) => canReceipts || k !== 'receipts').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Arquivo CSV (até 5 MB; vírgula decimal e datas DD/MM/AAAA são entendidas)" name="imp-file">
            <input id="imp-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void load(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </Field>
        </div>
        <details className="sm:col-span-3 text-sm"><summary className="cursor-pointer text-muted">Modelo de arquivo para «{IMPORT_TYPE_LABEL[type]}»</summary><pre className="mt-2 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5">{TEMPLATES[type]}</pre>
          <p className="mt-1 text-xs text-muted">Planos de comissão não são importáveis (precisam de validação própria). Importar nunca aprova nem calcula comissões.</p></details>
      </div>
      {local ? <Alert tone="error">{local}</Alert> : null}

      {headers.length > 0 ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Mapeamento de colunas">
          <h2 className="text-lg font-semibold">Mapeamento de colunas</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS[type].map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} name={`map-${f.key}`} hint={f.hint}>
                <Select id={`map-${f.key}`} value={map[f.key] === null || map[f.key] === undefined ? '' : String(map[f.key])} onChange={(e) => setMap({ ...map, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">— não importar —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `(coluna ${i + 1})`}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            {type === 'sales' ? <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={opts.confirmSales} onChange={(e) => setOpts({ ...opts, confirmSales: e.target.checked })} /> Confirmar as vendas importadas (fixa o plano; sem isso entram como rascunho)</label> : null}
            {type === 'sales' ? <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={opts.createCustomers} onChange={(e) => setOpts({ ...opts, createCustomers: e.target.checked })} /> Cadastrar clientes ausentes</label> : null}
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={opts.partial} onChange={(e) => setOpts({ ...opts, partial: e.target.checked })} /> Importar as linhas válidas mesmo se houver rejeitadas</label>
          </div>
          {missing.length ? <Alert tone="warning">Mapeie os campos obrigatórios: {missing.map((m) => m.label).join(', ')}.</Alert> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending || missing.length > 0} onClick={() => run(false)} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5">{pending ? 'Validando…' : '1. Validar e ver prévia'}</button>
            <button type="button" disabled={pending || missing.length > 0 || !rep || rep.applied || !rep.ok && !opts.partial} onClick={() => run(true)} className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? 'Importando…' : '2. Confirmar importação'}</button>
          </div>
        </section>
      ) : null}

      {res && 'error' in res ? <Alert tone="error">{res.error}</Alert> : null}
      {rep ? (
        <section className="space-y-3" aria-label="Resultado">
          <Alert tone={rep.fatal || rep.rejected > 0 ? 'warning' : 'success'}>
            {rep.applied ? 'Importação concluída' : 'Prévia da validação'}: {rep.total} linha(s) · {rep.accepted} {rep.applied ? 'aceita(s)' : 'válida(s)'} · {rep.rejected} rejeitada(s).{rep.fatal ? ` ${rep.fatal}` : ''}
            {rep.sameFileBefore > 0 ? ` Atenção: este mesmo arquivo já foi importado ${rep.sameFileBefore}× (linhas já existentes aparecem como duplicadas e não são repetidas).` : ''}
          </Alert>
          {rep.errors.length > 0 ? (
            <div className="relative overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[560px] border-collapse text-sm"><caption className="sr-only">Linhas rejeitadas</caption>
                <thead><tr><th className="px-3 py-2 text-left text-xs uppercase text-muted">Linha</th><th className="px-3 py-2 text-left text-xs uppercase text-muted">Motivo</th><th className="px-3 py-2 text-left text-xs uppercase text-muted">Detalhe</th></tr></thead>
                <tbody className="divide-y divide-border">{rep.errors.slice(0, 100).map((e, i) => <tr key={i}><td className="px-3 py-2">{e.row}</td><td className="px-3 py-2">{e.code}</td><td className="px-3 py-2">{e.message}</td></tr>)}</tbody>
              </table>
              {rep.errors.length > 100 ? <p className="p-2 text-xs text-muted">Mostrando 100 de {rep.errors.length} erros.</p> : null}
            </div>
          ) : null}
          <div className="relative overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full border-collapse text-xs"><caption className="px-3 py-2 text-left text-sm text-muted">Primeiras linhas do arquivo</caption>
              <tbody className="divide-y divide-border">{rep.preview.map((row, i) => <tr key={i} className={i === 0 ? 'font-semibold' : ''}>{row.map((c, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
