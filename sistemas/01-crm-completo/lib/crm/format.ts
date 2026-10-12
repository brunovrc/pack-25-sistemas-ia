// Formatação e leitura de valores no padrão brasileiro (BRL, datas, fuso de Brasília).
const TZ = 'America/Sao_Paulo';
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatBRL(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : brl.format(value);
}

export function formatBRLCompact(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : brlCompact.format(value);
}

/** Percentual com duas casas; `null` (sem dados) vira "—", nunca "0%". */
export function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : `${pct.format(value)}%`;
}

/**
 * Lê um valor monetário digitado em formato brasileiro ("1.234,56", "1234,5", "1234.56", "R$ 10").
 * Devolve `null` quando não for um número válido. Sempre arredonda a 2 casas.
 */
export function parseBRL(input: string): number | null {
  const raw = input.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (raw === '') return null;
  let normalized: string;
  if (raw.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$|^\d{1,3}(\.\d{3})+,$|^\d+,$/.test(raw)) return null;
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  } else if (/^\d+(\.\d{1,2})?$/.test(raw)) {
    normalized = raw;
  } else {
    return null;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA' sem deslocamento de fuso. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: TZ });
/** Instante ISO -> data no horário de Brasília (sem hora). */
export function formatDateBR(value: string | null | undefined): string {
  return value ? dateOnly.format(new Date(value)) : '—';
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ });
export function formatDateTimeBR(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '—';
}

/** Valor de <input type="datetime-local"> ('YYYY-MM-DDTHH:mm', horário de Brasília) -> ISO com offset. */
export function localInputToIso(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:00-03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** ISO (UTC) -> valor para <input type="datetime-local"> no horário de Brasília. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
