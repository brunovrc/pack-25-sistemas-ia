// Rateio de centavos entre participantes (método do maior resto). A soma das partes é SEMPRE exatamente o total.
// Desempate documentado: maior resto fracionário; empate ⇒ ordem recebida (o chamador ordena: principal primeiro, depois seller_id).
import { CommissionError, D, type Cents, type Dec, assertCents, dec } from './decimal';

export function allocateByWeights(totalCents: Cents, weights: Array<string | Dec>): Cents[] {
  assertCents(totalCents);
  if (weights.length === 0) throw new CommissionError('SPLIT_EMPTY', 'Nenhum participante para ratear.');
  const w = weights.map((x) => dec(x as string));
  if (w.some((x) => x.isNegative())) throw new CommissionError('SPLIT_NEGATIVE_WEIGHT', 'Participação negativa.');
  const sum = w.reduce((a, b) => a.plus(b), new D(0));
  if (sum.isZero()) throw new CommissionError('SPLIT_ZERO_WEIGHTS', 'Soma das participações é zero.');
  const sign = totalCents < 0 ? -1 : 1;
  const abs = new D(Math.abs(totalCents));
  const exact = w.map((x) => abs.times(x).div(sum));
  const floors = exact.map((x) => x.floor());
  const used = floors.reduce((a, b) => a.plus(b), new D(0));
  let remaining = abs.minus(used).toNumber();
  const order = exact
    .map((x, i) => ({ i, frac: x.minus(floors[i]!) }))
    .sort((a, b) => (b.frac.comparedTo(a.frac) !== 0 ? b.frac.comparedTo(a.frac) : a.i - b.i));
  const out = floors.map((f) => f.toNumber());
  for (const { i } of order) {
    if (remaining <= 0) break;
    out[i] = out[i]! + 1;
    remaining--;
  }
  return out.map((v) => (v === 0 ? 0 : sign * v));
}

/** Modelo de pool único: as participações devem somar EXATAMENTE 100%. */
export function poolSumsTo100(pcts: string[]): boolean {
  return pcts.reduce((a, p) => a.plus(dec(p)), new D(0)).eq(100);
}
