// Formatação e leitura de valores em BRL. Tudo em centavos inteiros; sem ponto flutuante.
import { CommissionError, D, type Cents, assertCents } from './decimal';

/** 123456 → «R$ 1.234,56». Negativos: «-R$ 1,00». */
export function formatBRL(c: Cents): string {
  assertCents(c);
  const neg = c < 0;
  const abs = Math.abs(c);
  const reais = Math.trunc(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${cent}`;
}

/** Texto decimal «1234.56» a partir de centavos (para CSV/relatórios; sem símbolo). */
export function centsToDecimalText(c: Cents): string {
  assertCents(c);
  const neg = c < 0;
  const abs = Math.abs(c);
  return `${neg ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Lê valor monetário brasileiro e devolve centavos exatos.
 * Aceita «1.234,56», «1234,56», «1234.56» (ponto só como decimal de 1–2 casas), «1.234» (milhar), «1234», «R$ 10,00».
 * Rejeita ambiguidades («1,234.56»), notação científica e mais de 2 casas decimais.
 */
export function parseMoneyToCents(input: string): Cents {
  const raw = input.replace(/^\s*R\$\s*/i, '').trim();
  if (!raw) throw new CommissionError('INVALID_MONEY', 'Valor vazio.');
  let neg = false;
  let s = raw;
  if (s.startsWith('-')) { neg = true; s = s.slice(1).trim(); }
  let normalized: string;
  if (s.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(s)) throw new CommissionError('INVALID_MONEY', `Valor inválido: ${input}`);
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    normalized = s;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '');
  } else if (/^\d+$/.test(s)) {
    normalized = s;
  } else {
    throw new CommissionError('INVALID_MONEY', `Valor inválido: ${input}`);
  }
  const c = new D(normalized).times(100);
  if (!c.isInteger()) throw new CommissionError('INVALID_MONEY', `Valor com mais de 2 casas decimais: ${input}`);
  const n = c.toNumber();
  if (!Number.isSafeInteger(n)) throw new CommissionError('INVALID_MONEY', 'Valor fora da faixa suportada.');
  return neg ? (n === 0 ? 0 : -n) : n;
}

/** «5%», «5,5%», «5.5» → taxa decimal em texto («0.05», «0.055»). Aceita 0–100. */
export function parsePercentToRate(input: string): string {
  const s = input.replace('%', '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) throw new CommissionError('INVALID_RATE', `Percentual inválido: ${input}`);
  const r = new D(s).div(100);
  if (r.gt(1)) throw new CommissionError('INVALID_RATE', 'Percentual acima de 100%.');
  return r.toString();
}

/** 0.055 → «5,5%». */
export function formatRate(r: string): string {
  const pct = new D(r).times(100);
  return `${pct.toString().replace('.', ',')}%`;
}
