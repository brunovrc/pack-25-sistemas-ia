// Faixas de comissão. Faixas são (de, até]: limite inferior exclusivo, superior INCLUSIVO — uma base exatamente igual ao teto
// de uma faixa pertence a ela. Dois modos EXPLICITAMENTE distintos (nunca misturados):
//  · marginal  — cada faixa incide só sobre a parcela da base que cai dentro dela;
//  · reached   — a taxa da faixa atingida incide sobre a base inteira.
import { CommissionError, D, type Dec, rate } from './decimal';
import type { Tier, TierMode } from './types';

export interface TierIssue { code: string; message: string }

export function validateTiers(bands: Tier[]): TierIssue[] {
  const issues: TierIssue[] = [];
  if (bands.length === 0) return [{ code: 'TIER_EMPTY', message: 'Informe ao menos uma faixa.' }];
  const sorted = [...bands].sort((a, b) => a.order - b.order);
  const orders = new Set(sorted.map((b) => b.order));
  if (orders.size !== sorted.length) issues.push({ code: 'TIER_ORDER', message: 'Ordens de faixa duplicadas.' });
  sorted.forEach((b, i) => {
    try { rate(b.rate); } catch { issues.push({ code: 'TIER_RATE_INVALID', message: `Faixa ${b.order}: taxa fora de 0–100%.` }); }
    if (!Number.isSafeInteger(b.fromCents) || b.fromCents < 0) issues.push({ code: 'TIER_INVALID_RANGE', message: `Faixa ${b.order}: início inválido.` });
    if (b.toCents !== null && (!Number.isSafeInteger(b.toCents) || b.toCents <= b.fromCents)) issues.push({ code: 'TIER_INVALID_RANGE', message: `Faixa ${b.order}: o fim deve ser maior que o início.` });
    if (i === 0 && b.fromCents !== 0) issues.push({ code: 'TIER_FIRST_NOT_ZERO', message: 'A primeira faixa deve começar em R$ 0,00.' });
    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (prev.toCents === null) issues.push({ code: 'TIER_OPEN_NOT_LAST', message: 'Somente a última faixa pode ficar sem teto.' });
      else if (b.fromCents < prev.toCents) issues.push({ code: 'TIER_OVERLAP', message: `Faixas ${prev.order} e ${b.order} se sobrepõem.` });
      else if (b.fromCents > prev.toCents) issues.push({ code: 'TIER_GAP', message: `Há lacuna entre as faixas ${prev.order} e ${b.order}.` });
    }
    if (i === sorted.length - 1 && b.toCents !== null) issues.push({ code: 'TIER_LAST_NOT_OPEN', message: 'A última faixa deve ficar sem teto (acima de…).' });
  });
  return issues;
}

function assertValid(bands: Tier[]): Tier[] {
  const issues = validateTiers(bands);
  if (issues.length) throw new CommissionError(issues[0]!.code, issues[0]!.message);
  return [...bands].sort((a, b) => a.order - b.order);
}

export interface TierBreakdownRow { order: number; rate: string; amountCents: string; commission: string }

/** Comissão EXATA (sem arredondar) para uma base acumulada. Base ≤ 0 ⇒ 0. */
export function tierAmount(cumBaseCents: Dec, bands: Tier[], mode: TierMode): Dec {
  const sorted = assertValid(bands);
  if (cumBaseCents.lte(0)) return new D(0);
  if (mode === 'marginal') {
    let total = new D(0);
    for (const t of sorted) {
      if (cumBaseCents.lte(t.fromCents)) break;
      const upper = t.toCents === null ? cumBaseCents : Dec_min(cumBaseCents, new D(t.toCents));
      total = total.plus(upper.minus(t.fromCents).times(rate(t.rate)));
    }
    return total;
  }
  const hit = sorted.find((t) => cumBaseCents.gt(t.fromCents) && (t.toCents === null || cumBaseCents.lte(t.toCents)));
  return hit ? cumBaseCents.times(rate(hit.rate)) : new D(0);
}

/** Detalhamento por faixa (memória de cálculo). */
export function tierBreakdown(cumBaseCents: Dec, bands: Tier[], mode: TierMode): TierBreakdownRow[] {
  const sorted = assertValid(bands);
  if (cumBaseCents.lte(0)) return [];
  if (mode === 'marginal') {
    const rows: TierBreakdownRow[] = [];
    for (const t of sorted) {
      if (cumBaseCents.lte(t.fromCents)) break;
      const upper = t.toCents === null ? cumBaseCents : Dec_min(cumBaseCents, new D(t.toCents));
      const part = upper.minus(t.fromCents);
      rows.push({ order: t.order, rate: t.rate, amountCents: part.toString(), commission: part.times(rate(t.rate)).toString() });
    }
    return rows;
  }
  const hit = sorted.find((t) => cumBaseCents.gt(t.fromCents) && (t.toCents === null || cumBaseCents.lte(t.toCents)));
  return hit ? [{ order: hit.order, rate: hit.rate, amountCents: cumBaseCents.toString(), commission: cumBaseCents.times(rate(hit.rate)).toString() }] : [];
}

function Dec_min(a: Dec, b: Dec): Dec {
  return a.lte(b) ? a : b;
}
