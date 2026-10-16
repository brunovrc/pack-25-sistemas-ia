// CSV seguro: separador «;», decimal com vírgula (Excel pt-BR), UTF-8 com BOM e proteção contra injeção de fórmulas (CSV injection).
import { centsToDecimalText } from './engine';

/** Células que começam com = + - @ ou controle viram texto (prefixo apóstrofo), exceto números legítimos já formatados por nós. */
export function csvText(v: string): string {
  const s = v.replace(/\r?\n/g, ' ');
  const danger = /^[=+\-@\t\r]/.test(s);
  const safe = danger ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
/** Dinheiro em centavos → «1234,56» (apenas números: não passa pelo filtro de fórmulas). */
export const csvMoney = (cents: number): string => centsToDecimalText(cents).replace('.', ',');

export type Col = { key: string; label: string; kind: 'text' | 'money' | 'pct' | 'date' | 'int' };
export type Row = Record<string, string | number | null | undefined>;

export function toCsv(cols: Col[], rows: Row[]): string {
  const head = cols.map((c) => csvText(c.label)).join(';');
  const body = rows.map((r) => cols.map((c) => {
    const v = r[c.key];
    if (v === null || v === undefined || v === '') return '';
    if (c.kind === 'money') return csvMoney(Number(v));
    if (c.kind === 'pct') return Number(v).toFixed(2).replace('.', ',');
    if (c.kind === 'int') return String(Math.trunc(Number(v)));
    if (c.kind === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); return m ? `${m[3]}/${m[2]}/${m[1]}` : csvText(String(v)); }
    return csvText(String(v));
  }).join(';'));
  return `﻿${[head, ...body].join('\r\n')}\r\n`;
}
