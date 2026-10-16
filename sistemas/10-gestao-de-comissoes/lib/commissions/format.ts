// Formatação para a tela: BRL a partir de centavos inteiros, datas brasileiras, percentuais e quantidades. Sem float em dinheiro.
import { formatBRL, formatRate } from './engine';

export const brl = (cents: number | null | undefined): string => (cents === null || cents === undefined ? '—' : formatBRL(Math.trunc(cents)));
export const dateBR = (iso: string | null | undefined): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
export const monthBR = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return m ? `${names[Number(m[2]) - 1]}/${(m[1] ?? '').slice(2)}` : iso;
};
export const rateBR = (r: string | number | null | undefined): string => (r === null || r === undefined ? '—' : formatRate(String(r)));
export const pctBR = (n: number | string | null | undefined, digits = 2): string => {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
};
export const qtyBR = (v: string | number): string => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
/** Centavos → texto para campo de formulário («1234,56»). */
export const centsToInput = (c: number): string => {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? '-' : ''}${Math.trunc(a / 100)},${String(a % 100).padStart(2, '0')}`;
};
