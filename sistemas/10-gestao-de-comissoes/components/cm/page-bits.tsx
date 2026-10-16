import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/primitives';
import { APPROVAL_LABEL, ADJUSTMENT_STATUS_LABEL, CLOSING_STATUS_LABEL, DISPUTE_STATUS_LABEL, PAYOUT_STATUS_LABEL, PERIOD_STATUS_LABEL, SALE_STATUS_LABEL, SELLER_STATUS_LABEL } from '@/lib/commissions/labels';
import { brl } from '@/lib/commissions/format';
import { one, type SearchParams } from '@/lib/commissions/query';
import { cn } from '@/lib/utils';
import type { Opt } from './bits';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';
const KINDS: Record<string, { labels: Record<string, string>; tones: Record<string, Tone> }> = {
  approval: { labels: APPROVAL_LABEL, tones: { calculated: 'neutral', pending_review: 'warning', approved: 'success', contested: 'danger', rejected: 'danger', adjusted: 'warning' } },
  sale: { labels: SALE_STATUS_LABEL, tones: { draft: 'neutral', confirmed: 'success', partially_returned: 'warning', cancelled: 'danger', totally_returned: 'danger' } },
  period: { labels: PERIOD_STATUS_LABEL, tones: { open: 'neutral', in_review: 'warning', awaiting_approval: 'warning', closed: 'success', cancelled: 'danger' } },
  closing: { labels: CLOSING_STATUS_LABEL, tones: { draft: 'neutral', awaiting_approval: 'warning', closed: 'success', cancelled: 'danger' } },
  dispute: { labels: DISPUTE_STATUS_LABEL, tones: { open: 'warning', in_review: 'warning', resolved: 'success', rejected: 'danger' } },
  adjustment: { labels: ADJUSTMENT_STATUS_LABEL, tones: { pending: 'warning', approved: 'success', rejected: 'danger' } },
  payout: { labels: PAYOUT_STATUS_LABEL, tones: { recorded: 'success', reversed: 'danger' } },
  seller: { labels: SELLER_STATUS_LABEL, tones: { active: 'success', inactive: 'neutral', archived: 'neutral' } },
};
export function StatusPill({ kind, status }: { kind: keyof typeof KINDS; status: string }) {
  const k = KINDS[kind]!;
  return <Badge tone={k.tones[status] ?? 'neutral'}>{k.labels[status] ?? status}</Badge>;
}

/** Valor em reais a partir de centavos inteiros; negativos em vermelho. */
export function Money({ cents, strong, className }: { cents: number | null | undefined; strong?: boolean; className?: string }) {
  return <span className={cn('tabular-nums whitespace-nowrap', strong && 'font-semibold', typeof cents === 'number' && cents < 0 && 'text-danger', className)}>{brl(cents)}</span>;
}

/** Filtros por URL (GET): funcionam sem JavaScript e a página fica compartilhável. */
export function FilterForm({ children, action, clear }: { children: ReactNode; action?: string; clear: string }) {
  return (
    <form method="get" action={action} className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Filtrar</button>
        <Link href={clear} className="text-sm text-muted underline underline-offset-2">Limpar</Link>
      </div>
    </form>
  );
}
export function FSelect({ name, label, opts, sp, placeholder = 'Todos' }: { name: string; label: string; opts: Opt[]; sp: SearchParams; placeholder?: string }) {
  const cur = one(sp[name]) ?? '';
  return (
    <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <select name={name} defaultValue={cur} className="min-h-10 rounded-md border border-border bg-card px-2 text-sm font-normal text-foreground">
        <option value="">{placeholder}</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
export function FInput({ name, label, sp, type = 'text', placeholder }: { name: string; label: string; sp: SearchParams; type?: string; placeholder?: string }) {
  return (
    <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input name={name} type={type} defaultValue={one(sp[name]) ?? ''} placeholder={placeholder} className="min-h-10 rounded-md border border-border bg-card px-2 text-sm font-normal text-foreground" />
    </label>
  );
}

/** Barra de progresso de atingimento (0–100%+). */
export function Progress({ pct, label }: { pct: number; label?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(pct, 100))} aria-label={label ?? 'Atingimento'} className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : pct >= 70 ? 'bg-accent' : 'bg-warning')} style={{ width: `${w}%` }} />
    </div>
  );
}

export function DefinitionList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="text-sm">{v ?? '—'}</dd></div>
      ))}
    </dl>
  );
}

export const periodQuery = (p: { preset: string; from: string; to: string }) => `p=${p.preset}${p.preset === 'custom' ? `&from=${p.from}&to=${p.to}` : ''}`;
