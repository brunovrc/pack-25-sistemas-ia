// Construtores determinísticos para os testes do motor de comissões. Valores em centavos.
import { computeCommissions } from '@/lib/commissions/engine';
import type { BookedEntry, ComputeOutput, ItemFacts, NewEntry, ParticipantFacts, PlanVersionConfig, ReceiptFact, ReturnFact, Rule, SaleFacts, SellerFacts, Tier } from '@/lib/commissions/engine';
import { DEFAULT_PRECEDENCE } from '@/lib/commissions/engine';

export const reais = (n: number): number => Math.round(n * 100);

export const seller = (id: string, teamId: string | null = 't1'): SellerFacts => ({ id, teamId, type: 'internal' });

export function rule(p: Partial<Rule> & { id: string }): Rule {
  return {
    name: p.id, kind: 'percentage', scopeType: 'organization', scopeReference: null, conditions: null, rate: null, fixedAmountCents: null, tier: null,
    priority: 0, stack: 'exclusive', entryKind: 'commission', enabled: true, validFrom: null, validUntil: null, ...p,
  };
}

export const pctRule = (id: string, rate: string, extra: Partial<Rule> = {}): Rule => rule({ id, kind: 'percentage', rate, ...extra });
export const fixedRule = (id: string, cents: number, extra: Partial<Rule> = {}): Rule => rule({ id, kind: 'fixed', fixedAmountCents: cents, ...extra });
export const tierRule = (id: string, mode: 'marginal' | 'reached', bands: Tier[], extra: Partial<Rule> = {}, period: 'month' | 'quarter' | 'year' = 'month', scope: 'individual' | 'team' = 'individual'): Rule =>
  rule({ id, kind: 'tiered', tier: { mode, period, scope, bands }, ...extra });

export const BANDS_2_4_6: Tier[] = [
  { order: 1, fromCents: 0, toCents: reais(10000), rate: '0.02' },
  { order: 2, fromCents: reais(10000), toCents: reais(20000), rate: '0.04' },
  { order: 3, fromCents: reais(20000), toCents: null, rate: '0.06' },
];

export function plan(p: Partial<PlanVersionConfig> & { rules: Rule[] }): PlanVersionConfig {
  return {
    id: 'pv1', planId: 'p1', planName: 'Plano', versionNumber: 1, basis: 'net_value', eligibility: 'sale_confirmation', returnsPolicy: 'proportional',
    precedence: DEFAULT_PRECEDENCE, ...p,
  };
}

export function participant(sellerId: string, pl: PlanVersionConfig | null, pct = '100', primary = true, teamId: string | null = 't1'): ParticipantFacts {
  return { seller: seller(sellerId, teamId), isPrimary: primary, allocationPct: pct, plan: pl };
}

export function item(p: Partial<ItemFacts> & { id: string; commissionableCents: number }): ItemFacts {
  return { position: 1, productId: null, categoryId: null, quantity: '1', netCents: p.commissionableCents, costCents: null, ...p };
}

export function sale(p: Partial<SaleFacts> & { id: string; participants: ParticipantFacts[]; amountCents?: number }): SaleFacts {
  const amount = p.amountCents ?? p.items?.reduce((a, i) => a + i.commissionableCents, 0) ?? 0;
  const items = p.items ?? [item({ id: `${p.id}-i1`, commissionableCents: amount })];
  return {
    number: p.id, date: '2026-03-10', confirmedAt: '2026-03-10', status: 'confirmed', channel: null, customerId: null,
    netCents: amount, commissionableCents: amount, splitModel: 'independent', items, receipts: [], returns: [], ...p,
  };
}

export const receipt = (id: string, date: string, amountCents: number): ReceiptFact => ({ id, date, amountCents });
export const ret = (id: string, date: string, amountCents: number, extra: Partial<ReturnFact> = {}): ReturnFact => ({ id, date, amountCents, ...extra });

let seq = 0;
/** Aplica lançamentos novos ao livro (simula a persistência). */
export function toBooked(entries: NewEntry[], previous: BookedEntry[] = []): BookedEntry[] {
  return [
    ...previous,
    ...entries.map((e) => ({
      id: `e${++seq}`, idempotencyKey: e.idempotencyKey, componentKey: e.componentKey, saleId: e.saleId, itemId: e.itemId, planVersionId: e.planVersionId,
      ruleId: e.ruleId, sellerId: e.sellerId, entryType: e.entryType, amountCents: e.amountCents,
    })),
  ];
}

export const sum = (xs: Array<{ amountCents: number }>): number => xs.reduce((a, b) => a + b.amountCents, 0);
export const bySeller = (xs: Array<{ amountCents: number; sellerId: string }>, id: string): number => sum(xs.filter((x) => x.sellerId === id));

/** Roda o motor, aplica ao livro e devolve ambos. */
export function run(sales: SaleFacts[], booked: BookedEntry[] = []): { out: ComputeOutput; booked: BookedEntry[] } {
  const out = computeCommissions({ sales, booked });
  return { out, booked: toBooked(out.entries, booked) };
}
