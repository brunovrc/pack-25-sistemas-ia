'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { PERIOD_LABELS, PERIODS, type CrmFilters, type Period } from '@/lib/crm/filters';

type Opt = { value: string; label: string };

/** Filtros globais (período, vendedor, equipe, origem). Envia por GET: a URL é compartilhável. */
export function FilterBar({ action, filters, owners, teams, sources }: { action: string; filters: CrmFilters; owners?: Opt[]; teams?: Opt[]; sources: Opt[] }) {
  const [period, setPeriod] = useState<Period>(filters.period);
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
      {owners ? (
        <div>
          <label htmlFor="owner" className="mb-1 block text-xs font-medium text-muted">Vendedor</label>
          <Select id="owner" name="owner" defaultValue={filters.owner ?? ''} className="w-44">
            <option value="">Todos</option>
            {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      ) : null}
      {teams && teams.length > 0 ? (
        <div>
          <label htmlFor="team" className="mb-1 block text-xs font-medium text-muted">Equipe</label>
          <Select id="team" name="team" defaultValue={filters.team ?? ''} className="w-40">
            <option value="">Todas</option>
            {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
      ) : null}
      <div>
        <label htmlFor="source" className="mb-1 block text-xs font-medium text-muted">Origem</label>
        <Select id="source" name="source" defaultValue={filters.source ?? ''} className="w-40">
          <option value="">Todas</option>
          {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <Button type="submit">Aplicar</Button>
    </form>
  );
}
