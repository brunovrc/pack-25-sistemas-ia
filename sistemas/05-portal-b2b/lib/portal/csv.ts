// CSV de exportação: neutraliza injeção de fórmula, `;` como separador e vírgula decimal (padrão do Excel em português), UTF-8 com BOM.
const FORMULA_START = /^[=+\-@\t\r]/;

/** Valores iniciados por = + - @ TAB CR são executados como fórmula no Excel/Sheets ("CSV injection"). Prefixa com apóstrofo; sempre entre aspas. */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function csvDecimal(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(decimals).replace('.', ',');
}

/** `int(n)` = contagem; número simples = decimal com vírgula. */
export type CsvCell = string | number | null | undefined | { int: number };
export const int = (n: number): CsvCell => ({ int: n });

function cell(c: CsvCell): string {
  if (c !== null && typeof c === 'object') return String(c.int);
  if (typeof c === 'number') return csvDecimal(c);
  return csvText(c);
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map((h) => csvText(h)).join(';')];
  for (const row of rows) lines.push(row.map(cell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
