// Filtros vindos da URL (a URL é a fonte: compartilhável e funciona sem JavaScript). Tudo validado; valor inválido cai no padrão.
export type SearchParams = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOrNull = (v: string | undefined): string | null => (v && UUID.test(v) ? v.toLowerCase() : null);
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export const PAGE_SIZE = 20;
export function pageFrom(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}

/** Texto de busca seguro: remove curingas e separadores do PostgREST. */
export function safeSearch(v: string | undefined): string | null {
  const s = (v ?? '').replace(/[%_,()*\\.:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s.length >= 2 ? s : null;
}

export function withParams(base: string, current: SearchParams, changes: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const val = one(v);
    if (val !== undefined && val !== '' && !(k in changes)) q.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) if (v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

// ---- datas civis (AAAA-MM-DD) no fuso da empresa ---------------------------------------------------------
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: string | undefined): v is string => !!v && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function civilDateIn(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const pad = (n: number) => String(n).padStart(2, '0');
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 7)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
export function addMonths(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const PRESETS = ['this_month', 'last_month', 'last_90', 'this_year', 'custom'] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LABEL: Record<Preset, string> = { this_month: 'Mês atual', last_month: 'Mês anterior', last_90: 'Últimos 90 dias', this_year: 'Ano atual', custom: 'Período personalizado' };

export type PeriodSel = { preset: Preset; from: string; to: string };
export function resolvePeriod(sp: SearchParams, today: string): PeriodSel {
  const raw = one(sp.p);
  const preset: Preset = (PRESETS as readonly string[]).includes(raw ?? '') ? (raw as Preset) : 'this_month';
  if (preset === 'custom') {
    const from = one(sp.from);
    const to = one(sp.to);
    if (isIsoDate(from) && isIsoDate(to) && to >= from && Date.parse(to) - Date.parse(from) <= 1100 * 86_400_000) return { preset, from, to };
    return { preset: 'this_month', from: monthStart(today), to: today };
  }
  if (preset === 'last_month') {
    const first = addMonths(monthStart(today), -1);
    return { preset, from: first, to: monthEnd(first) };
  }
  if (preset === 'last_90') return { preset, from: addDays(today, -89), to: today };
  if (preset === 'this_year') return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
  return { preset, from: monthStart(today), to: today };
}
