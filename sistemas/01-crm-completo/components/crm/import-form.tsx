'use client';

import { useActionState } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui/primitives';
import { importLeads, type ImportReport } from '@/lib/crm/actions';

const initial: ImportReport = {};

export function ImportLeadsForm({ people, canPickOwner, defaultOwner }: { people: Array<{ value: string; label: string }>; canPickOwner: boolean; defaultOwner: string }) {
  const [state, action, pending] = useActionState(importLeads, initial);
  const report = state.report;
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <Field label="Arquivo CSV" name="file" hint="Até 1 MB e 2.000 linhas. Separador ; ou , e codificação UTF-8.">
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm" />
        </Field>
        {canPickOwner ? (
          <Field label="Responsável pelos leads importados" name="owner_id">
            <Select id="owner_id" name="owner_id" defaultValue={defaultOwner}>{people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>
          </Field>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="dryRun" defaultChecked className="mt-1 size-4" />
          <span><strong>Apenas validar</strong> (não grava nada). Desmarque para importar de verdade depois de conferir o relatório.</span>
        </label>
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Processando…' : 'Enviar'}</Button>
      </form>

      {state.message ? <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert> : null}

      {report ? (
        <section aria-label="Relatório da importação" className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-semibold">{report.dryRun ? 'Resultado da validação' : 'Resultado da importação'}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div><dt className="text-muted">Linhas lidas</dt><dd className="text-lg font-semibold tabular-nums">{report.total}</dd></div>
            <div><dt className="text-muted">{report.dryRun ? 'Prontos para importar' : 'Importados'}</dt><dd className="text-lg font-semibold tabular-nums">{report.dryRun ? report.total - report.invalid - report.duplicates : report.created}</dd></div>
            <div><dt className="text-muted">Duplicados</dt><dd className="text-lg font-semibold tabular-nums">{report.duplicates}</dd></div>
            <div><dt className="text-muted">Com erro</dt><dd className="text-lg font-semibold tabular-nums">{report.invalid}</dd></div>
            <div><dt className="text-muted">Avisos</dt><dd className="text-lg font-semibold tabular-nums">{report.warnings}</dd></div>
          </dl>
          {report.unknownHeaders.length ? <p className="text-sm text-muted">Colunas ignoradas: {report.unknownHeaders.join(', ')}.</p> : null}
          {report.problems.length ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Linhas com problema{report.problems.length >= 50 ? ' (primeiras 50)' : ''}</h3>
              <ul className="max-h-64 space-y-1 overflow-auto text-sm">
                {report.problems.map((p, i) => <li key={`${p.line}-${i}`}><span className="font-medium">Linha {p.line}:</span> {p.reason}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
