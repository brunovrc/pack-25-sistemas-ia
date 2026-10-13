// Filtros globais do painel e dos relatórios. Vêm da URL (compartilháveis) e SEMPRE são validados:
// período inválido cai no padrão de 30 dias, sem erro. «Hoje» usa o fuso do portal.
import { z } from 'zod';
import { PRIORITIES, REQUEST_STATUSES, type Priority, type RequestStatus } from './format';

export const PERIODS = ['7d', '30d', '90d', '180d', '365d', 'custom'] as const;
export type Period = (typeof PERIODS)[number];
export type PtFilters = {
  period: Period;
  /** 'YYYY-MM-DD', inclusivo. */
  from: string;
  /** 'YYYY-MM-DD', inclusivo. */
  to: string;
  client: string | null;
  assignee: string | null;
  category: string | null;
  priority: Priority | null;
  status: RequestStatus | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.uuid();
const MAX_SPAN_DAYS = 1095;
const PRESET_DAYS: Record<Exclude<Period, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 };
export const DEFAULT_PERIOD: Period = '30d';
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Data de hoje no fuso informado, 'YYYY-MM-DD'. */
export function todayIn(tz: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: safeTimezone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const toUtcMs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}
export function isRealDate(value: string): boolean {
  return DATE_RE.test(value) && new Date(toUtcMs(value)).toISOString().slice(0, 10) === value;
}
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseFilters(sp: Record<string, string | string[] | undefined>, today: string = todayIn()): PtFilters {
  const rawPeriod = first(sp.period);
  let period: Period = (PERIODS as readonly string[]).includes(rawPeriod ?? '') ? (rawPeriod as Period) : DEFAULT_PERIOD;
  let from = addDays(today, -(PRESET_DAYS['30d'] - 1));
  let to = today;
  if (period === 'custom') {
    const f = first(sp.from) ?? '';
    const t = first(sp.to) ?? '';
    if (isRealDate(f) && isRealDate(t) && f <= t && daysBetween(f, t) < MAX_SPAN_DAYS) {
      from = f;
      to = t;
    } else period = DEFAULT_PERIOD;
  }
  if (period !== 'custom') {
    from = addDays(today, -(PRESET_DAYS[period] - 1));
    to = today;
  }
  const id = (k: string) => {
    const v = first(sp[k]);
    return v && uuid.safeParse(v).success ? v : null;
  };
  const prio = first(sp.priority);
  const st = first(sp.status);
  return {
    period, from, to,
    client: id('client'), assignee: id('assignee'), category: id('category'),
    priority: (PRIORITIES as readonly string[]).includes(prio ?? '') ? (prio as Priority) : null,
    status: (REQUEST_STATUSES as readonly string[]).includes(st ?? '') ? (st as RequestStatus) : null,
  };
}

/** Query string canônica dos filtros (links de exportação e navegação). */
export function filtersToQuery(f: PtFilters): string {
  const p = new URLSearchParams();
  p.set('period', f.period);
  if (f.period === 'custom') {
    p.set('from', f.from);
    p.set('to', f.to);
  }
  for (const k of ['client', 'assignee', 'category', 'priority', 'status'] as const) if (f[k]) p.set(k, f[k]!);
  return p.toString();
}

/** Argumentos comuns das funções SQL de indicadores (todas aceitam os mesmos filtros). */
export function rpcArgs(org: string, f: PtFilters) {
  return { p_org: org, p_from: f.from, p_to: f.to, p_client: f.client, p_assignee: f.assignee, p_category: f.category, p_priority: f.priority, p_status: f.status };
}

/** Instante UTC (ISO) de «data + hora» locais no fuso informado (o usuário digita no horário da prestadora). */
export function zonedIso(date: string, time: string, tz: string = DEFAULT_TIMEZONE): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(tz), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(guess - (local - guess)).toISOString();
}

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', '180d': 'Últimos 180 dias', '365d': 'Últimos 12 meses', custom: 'Período personalizado',
};
