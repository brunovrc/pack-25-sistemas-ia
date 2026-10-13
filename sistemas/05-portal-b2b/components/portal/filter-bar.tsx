'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { PERIOD_LABELS, PERIODS, type Period, type PtFilters } from '@/lib/portal/filters';
import { PRIORITIES, PRIORITY_LABELS, REQUEST_STATUSES, STATUS_LABELS } from '@/lib/portal/format';

type Opt = { value: string; label: string };

/** Filtros globais do painel e dos relatórios. Envia por GET: a URL é compartilhável e funciona sem JavaScript. */
export function FilterBar({ action, filters, clients, assignees, categories, client = false }: {
  action: string; filters: PtFilters; clients?: Opt[]; assignees?: Opt[]; categories: Opt[]; client?: boolean;
}) {
  const [period, setPeriod] = useState<Period>(filters.period);
  const sel = (id: string, label: string, value: string | null, options: Opt[], all: string, width = 'w-44') => (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <Select id={id} name={id} defaultValue={value ?? ''} className={width}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
  return (
    <form action={action} method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3" aria-label="Filtros do período">
      <div>
        <label htmlFor="period" className="mb-1 block text-xs font-medium text-muted">Período</label>
        <Select id="period" name="period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="w-48">
          {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
        </Select>
      </div>
      {period === 'custom' ? (
        <>
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-muted">De</label>
            <Input id="from" name="from" type="date" defaultValue={filters.from} required />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-muted">Até</label>
            <Input id="to" name="to" type="date" defaultValue={filters.to} required />
          </div>
        </>
      ) : null}
      {clients ? sel('client', 'Cliente', filters.client, clients, 'Todos') : null}
      {assignees && !client ? sel('assignee', 'Responsável', filters.assignee, assignees, 'Todos') : null}
      {sel('category', 'Categoria', filters.category, categories, 'Todas', 'w-40')}
      {sel('priority', 'Prioridade', filters.priority, PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })), 'Todas', 'w-36')}
      {sel('status', 'Situação', filters.status, REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })), 'Todas', 'w-44')}
      <Button type="submit">Aplicar</Button>
    </form>
  );
}
