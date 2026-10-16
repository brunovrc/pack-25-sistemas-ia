// Aritmética decimal do motor de comissões: precisão 40, arredondamento meio-para-cima (afastando de zero),
// aplicado UMA vez por componente de cálculo. Valores monetários persistem em centavos inteiros (nunca float).
import Decimal from 'decimal.js';

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;
export const ENGINE_VERSION = '1.0.0';

/** Centavos inteiros (JS number seguro: até ~90 trilhões de reais). */
export type Cents = number;

export class CommissionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CommissionError';
  }
}

/** Converte texto decimal («0.05», «1234.50») ou inteiro seguro. Rejeita float binário não inteiro, NaN e Infinity. */
export function dec(v: string | number | Dec): Dec {
  if (typeof v === 'number' && !Number.isInteger(v)) {
    throw new CommissionError('INVALID_DECIMAL', 'Número fracionário deve ser informado como texto decimal (evita ponto flutuante binário).');
  }
  let d: Dec;
  try {
    d = new D(v as string | number);
  } catch {
    throw new CommissionError('INVALID_DECIMAL', `Valor decimal inválido: ${String(v)}`);
  }
  if (!d.isFinite()) throw new CommissionError('INVALID_DECIMAL', `Valor decimal inválido: ${String(v)}`);
  return d;
}

/** Taxa entre 0 e 1 (0,05 = 5%). */
export function rate(v: string | Dec): Dec {
  const d = dec(v);
  if (d.isNegative() || d.gt(1)) throw new CommissionError('INVALID_RATE', `Taxa fora de 0–100%: ${d.toString()}`);
  return d;
}

export function assertCents(v: number, what = 'valor'): Cents {
  if (!Number.isSafeInteger(v)) throw new CommissionError('INVALID_CENTS', `${what} deve ser inteiro em centavos.`);
  return v;
}

/** Arredonda para centavos inteiros (meio-para-cima, simétrico para negativos: round(-x) = -round(x)). */
export function roundCents(d: Dec): Cents {
  const r = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isSafeInteger(r)) throw new CommissionError('INVALID_CENTS', 'Valor fora da faixa segura.');
  return r === 0 ? 0 : r; // evita -0
}

export const cents = (n: Cents): Dec => new D(assertCents(n));
