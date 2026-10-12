// Dinheiro em JavaScript: nunca somar reais com ponto flutuante (0,1 + 0,2 ≠ 0,3).
// Convertemos para centavos inteiros, somamos e voltamos. O banco já usa numeric(14,2).
export const toCents = (reais: number): number => Math.round(reais * 100);

export function sumMoney(values: number[]): number {
  return values.reduce((total, v) => total + toCents(v), 0) / 100;
}

/** Percentual com 2 casas a partir de dois valores em reais; `null` se o divisor for zero. */
export function pctOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((toCents(part) / toCents(whole)) * 10000) / 100;
}
