// CSV: exportação segura (neutraliza injeção de fórmula) e leitura de importação com limites.
import Papa from 'papaparse';

export const MAX_IMPORT_BYTES = 1_000_000; // 1 MB
export const MAX_IMPORT_ROWS = 2000;

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Texto de planilha: valores iniciados por = + - @ TAB CR são executados como fórmula no Excel/Sheets
 * ("CSV injection"). Prefixa com apóstrofo para virar texto comum. Sempre coloca entre aspas.
 */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(decimals).replace('.', ',');
}

/** `{ int }` = contagem (sem casas decimais); `number` = valor em reais (2 casas, vírgula decimal). */
export type CsvCell = string | number | null | undefined | { int: number };
export const int = (n: number): CsvCell => ({ int: n });

/** `;` como separador e vírgula decimal (padrão do Excel em português), UTF-8 com BOM. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map((h) => csvText(h)).join(';')];
  for (const row of rows) {
    lines.push(row.map((c) => (typeof c === 'object' && c !== null ? String(c.int) : typeof c === 'number' ? csvNumber(c) : csvText(c))).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- importação
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const LEAD_HEADER_ALIASES: Record<string, string> = {
  nome: 'name', name: 'name', contato: 'name',
  empresa: 'company_name', company: 'company_name', company_name: 'company_name',
  email: 'email', e_mail: 'email',
  telefone: 'phone', celular: 'phone', fone: 'phone', phone: 'phone',
  cargo: 'job_title', job_title: 'job_title',
  origem: 'source', source: 'source', canal: 'source',
  temperatura: 'temperature', classificacao: 'temperature',
  status: 'status', situacao: 'status',
  observacoes: 'notes', observacao: 'notes', notas: 'notes', notes: 'notes',
};

export type ParsedCsv =
  | { ok: true; rows: Array<{ line: number; values: Record<string, string> }>; unknownHeaders: string[] }
  | { ok: false; error: string };

/** Lê o CSV de leads aplicando limites de tamanho e de linhas e mapeando cabeçalhos em português ou inglês. */
export function parseLeadsCsv(text: string): ParsedCsv {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'Arquivo muito grande (máximo de 1 MB).' };
  const clean = text.replace(/^\uFEFF/, '');
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  const data = result.data;
  if (data.length < 2) return { ok: false, error: 'O arquivo precisa ter a linha de cabeçalho e ao menos um lead.' };
  if (data.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: `Muitas linhas (máximo de ${MAX_IMPORT_ROWS} por importação).` };

  const headers = (data[0] ?? []).map((h) => LEAD_HEADER_ALIASES[normalizeHeader(h)] ?? null);
  const unknownHeaders = (data[0] ?? []).filter((_, i) => headers[i] === null).map((h) => h.trim()).filter(Boolean);
  if (!headers.includes('name')) return { ok: false, error: 'Não encontrei a coluna de nome ("nome" ou "name").' };

  const rows = data.slice(1).map((cells, i) => {
    const values: Record<string, string> = {};
    headers.forEach((key, idx) => {
      if (key) values[key] = (cells[idx] ?? '').trim();
    });
    return { line: i + 2, values };
  });
  return { ok: true, rows, unknownHeaders };
}
