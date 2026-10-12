// Filtros globais do dashboard e dos relatórios. Vêm da URL (compartilháveis) e SEMPRE são validados:
// período inválido cai no padrão de 30 dias, sem erro (docs/PLANO_IMPLEMENTACAO.md §13).
import { z } from 'zod';

export const PERIODS = ['7d', '30d', '90d', 'custom'] as const;
export type Period = (typeof PERIODS)[number];

export type CrmFilters = {
  period: Period;
  /** 'YYYY-MM-DD', inclusivo. */
  from: string;
  /** 'YYYY-MM-DD', inclusivo. */
  to: string;
  owner: string | null;
  team: string | null;
  source: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.uuid();
const MAX_SPAN_DAYS = 366;
const PRESET_DAYS: Record<Exclude<Period, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Data de hoje em Brasília, 'YYYY-MM-DD'. */
export function todaySaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return new Date(toUtcMs(value)).toISOString().slice(0, 10) === value;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseFilters(searchParams: Record<string, string | string[] | undefined>, today: string = todaySaoPaulo()): CrmFilters {
  const rawPeriod = first(searchParams.period);
  let period: Period = (PERIODS as readonly string[]).includes(rawPeriod ?? '') ? (rawPeriod as Period) : '30d';

  let from = addDays(today, -(PRESET_DAYS['30d'] - 1));
  let to = today;
  if (period === 'custom') {
    const f = first(searchParams.from) ?? '';
    const t = first(searchParams.to) ?? '';
    if (isRealDate(f) && isRealDate(t) && f <= t && daysBetween(f, t) < MAX_SPAN_DAYS) {
      from = f;
      to = t;
    } else {
      period = '30d';
    }
  }
  if (period !== 'custom') {
    from = addDays(today, -(PRESET_DAYS[period] - 1));
    to = today;
  }

  const id = (key: string) => {
    const v = first(searchParams[key]);
    return v && uuid.safeParse(v).success ? v : null;
  };
  return { period, from, to, owner: id('owner'), team: id('team'), source: id('source') };
}

/** Query string canônica dos filtros (para links de exportação e navegação). */
export function filtersToQuery(f: CrmFilters): string {
  const p = new URLSearchParams();
  p.set('period', f.period);
  if (f.period === 'custom') {
    p.set('from', f.from);
    p.set('to', f.to);
  }
  if (f.owner) p.set('owner', f.owner);
  if (f.team) p.set('team', f.team);
  if (f.source) p.set('source', f.source);
  return p.toString();
}

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  custom: 'Período personalizado',
};
