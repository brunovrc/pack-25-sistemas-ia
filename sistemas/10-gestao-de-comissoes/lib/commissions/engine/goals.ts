// Metas e bonificações. Atingimento = realizado ÷ meta. O bônus é um lançamento próprio (tipo `bonus`), com chave
// determinística por (meta, regra, vendedor): a mesma meta nunca paga o mesmo bônus duas vezes. Bônus já lançado NÃO é
// revertido automaticamente se devoluções derrubarem o atingimento: gera pendência para ajuste manual auditável.
import { D, type Cents, type Dec, dec, rate as parseRate, roundCents } from './decimal';
import { prepareSale, reconcile, type Comp } from './calculate';
import { allocateByWeights } from './split';
import type { BookedEntry, ComputeOutput, Pendency, SaleFacts } from './types';

export type GoalType = 'sold_value' | 'received_value' | 'sales_count' | 'new_customers' | 'product_value' | 'product_units';
export type GoalScope = 'seller' | 'team' | 'organization';

export interface GoalBonusRule {
  id: string;
  planVersionId: string;
  /** Limite de atingimento em % da meta (ex.: «100»). */
  thresholdPct: string;
  bonusType: 'fixed' | 'rate';
  bonusRate: string | null;
  bonusAmountCents: Cents | null;
  timing: 'on_attainment' | 'period_end';
  /** Só para valor fixo: `each` = cada vendedor recebe o valor; `proportional` = valor rateado pelo crédito de cada um. */
  distribution: 'each' | 'proportional';
}

export interface GoalFacts {
  id: string;
  name: string;
  type: GoalType;
  /** Valor-alvo: centavos para tipos de valor; contagem/unidades para os demais (texto decimal). */
  target: string;
  periodStart: string;
  periodEnd: string;
  scope: GoalScope;
  scopeReference: string | null;
  productId: string | null;
  bonusRules: GoalBonusRule[];
  /** Vendedores destinatários (ordenados), definidos pelo servidor conforme o escopo. */
  sellerIds: string[];
}

export interface GoalProgress { value: Dec; attainment: Dec; perSeller: Map<string, Dec> }

const inPeriod = (date: string, g: GoalFacts): boolean => date >= g.periodStart && date <= g.periodEnd;
const counts = (s: SaleFacts): boolean => s.status === 'confirmed' || s.status === 'partially_returned';

/** Crédito (0–1) que a venda atribui ao vendedor ou ao escopo (equipe: soma das participações da equipe, no máximo 100%). */
function credit(goal: GoalFacts, sale: SaleFacts, sellerId: string | null): Dec {
  const parts = sale.participants;
  if (sellerId !== null) {
    const p = parts.find((x) => x.seller.id === sellerId);
    return p ? dec(p.allocationPct).div(100) : new D(0);
  }
  if (goal.scope === 'seller') {
    const p = parts.find((x) => x.seller.id === goal.scopeReference);
    return p ? dec(p.allocationPct).div(100) : new D(0);
  }
  if (goal.scope === 'team') {
    const sum = parts.filter((x) => x.seller.teamId === goal.scopeReference).reduce((a, x) => a.plus(dec(x.allocationPct)), new D(0));
    return D.min(sum, new D(100)).div(100);
  }
  return new D(1);
}

function amountFor(goal: GoalFacts, sale: SaleFacts, sellerId: string | null): Dec {
  const c = credit(goal, sale, sellerId);
  if (c.isZero()) return new D(0);
  const prep = prepareSale(sale, []);
  if (!prep) return new D(0);
  switch (goal.type) {
    case 'sold_value': {
      if (!inPeriod(sale.date, goal)) return new D(0);
      const rem = sale.commissionableCents - [...prep.retByItem.values()].reduce((a, b) => a + b, 0);
      return c.times(rem);
    }
    case 'received_value':
      return c.times(prep.receiptsSorted.filter((r) => inPeriod(r.date, goal)).reduce((a, r) => a + r.amountCents, 0));
    case 'sales_count':
      return inPeriod(sale.date, goal) ? new D(1) : new D(0);
    case 'new_customers':
      return inPeriod(sale.date, goal) && sale.newCustomer === true ? new D(1) : new D(0);
    case 'product_value':
    case 'product_units': {
      if (!inPeriod(sale.date, goal)) return new D(0);
      let sum = new D(0);
      for (const it of sale.items) {
        if (it.productId !== goal.productId) continue;
        const ret = prep.retByItem.get(it.id) ?? 0;
        if (goal.type === 'product_value') sum = sum.plus(it.commissionableCents - ret);
        else sum = sum.plus(dec(it.quantity).minus(prep.retQtyByItem.get(it.id) ?? 0));
      }
      return c.times(sum);
    }
  }
}

export function goalProgress(goal: GoalFacts, sales: SaleFacts[]): GoalProgress {
  const list = sales.filter(counts);
  let total = new D(0);
  const perSeller = new Map<string, Dec>();
  for (const id of goal.sellerIds) perSeller.set(id, new D(0));
  const seen = new Set<string>();
  for (const s of list) {
    if (goal.type === 'new_customers') {
      // contagem distinta de clientes por escopo
      const key = s.customerId ?? s.id;
      if (!seen.has(key) && !amountFor(goal, s, null).isZero()) { seen.add(key); total = total.plus(1); }
    } else {
      total = total.plus(amountFor(goal, s, null));
    }
    for (const id of goal.sellerIds) perSeller.set(id, perSeller.get(id)!.plus(amountFor(goal, s, id)));
  }
  const target = dec(goal.target);
  return { value: total, attainment: target.gt(0) ? total.div(target) : new D(0), perSeller };
}

export function evaluateGoals(goals: GoalFacts[], sales: SaleFacts[], booked: BookedEntry[], asOf: string): ComputeOutput {
  const comps: Comp[] = [];
  const pendencies: Pendency[] = [];
  const bookedSum = (key: string, sellerId: string): number => booked.filter((b) => b.componentKey === key && b.sellerId === sellerId).reduce((a, b) => a + b.amountCents, 0);

  for (const goal of [...goals].sort((a, b) => a.id.localeCompare(b.id))) {
    const prog = goalProgress(goal, sales);
    const sellers = [...goal.sellerIds].sort();
    for (const rule of [...goal.bonusRules].sort((a, b) => a.id.localeCompare(b.id))) {
      const reached = prog.attainment.gte(dec(rule.thresholdPct).div(100));
      const finalized = rule.timing === 'on_attainment' || asOf > goal.periodEnd;
      const awarded = reached && finalized;
      const date = asOf <= goal.periodEnd ? asOf : goal.periodEnd;
      const amounts = new Map<string, Cents>();
      if (awarded) {
        if (rule.bonusType === 'rate') {
          const r = parseRate(rule.bonusRate ?? '0');
          for (const s of sellers) amounts.set(s, roundCents((prog.perSeller.get(s) ?? new D(0)).times(r)));
        } else if (rule.distribution === 'each') {
          for (const s of sellers) amounts.set(s, rule.bonusAmountCents ?? 0);
        } else {
          const weights = sellers.map((s) => (prog.perSeller.get(s) ?? new D(0)).toString());
          if (weights.some((w) => dec(w).gt(0))) {
            const split = allocateByWeights(rule.bonusAmountCents ?? 0, weights);
            sellers.forEach((s, ix) => amounts.set(s, split[ix] ?? 0));
          }
        }
      }
      for (const sellerId of sellers) {
        const key = `g:${goal.id}:${rule.id}:${sellerId}`;
        const already = bookedSum(key, sellerId);
        let target = amounts.get(sellerId) ?? 0;
        if (target < already) {
          pendencies.push({ code: 'BONUS_BELOW_THRESHOLD', severity: 'warning', message: `Meta «${goal.name}»: bônus já lançado, mas o atingimento atual não o sustenta (ajuste manual, se cabível).`, sellerId });
          target = already; // nunca estorna automaticamente
        }
        if (target === 0 && already === 0) continue;
        comps.push({
          key, saleId: null, itemId: null, ruleId: null, planVersionId: rule.planVersionId, participants: [sellerId], targets: [target],
          potentials: [amounts.get(sellerId) ?? 0], base: roundCents(prog.perSeller.get(sellerId) ?? new D(0)), rate: rule.bonusRate, entryKind: 'bonus',
          eligibleAt: date, reversalAt: date, sourceReceiptId: null, sourceReturnId: null, isReturnEvent: false, originalKey: key, cause: 'normal',
          snapshot: {
            goal: { id: goal.id, name: goal.name, type: goal.type, target: goal.target, periodStart: goal.periodStart, periodEnd: goal.periodEnd },
            progress: { value: prog.value.toString(), attainment: prog.attainment.toString(), personal: (prog.perSeller.get(sellerId) ?? new D(0)).toString() },
            bonusRule: { id: rule.id, thresholdPct: rule.thresholdPct, type: rule.bonusType, distribution: rule.distribution, timing: rule.timing },
            reached, finalized, awarded,
          },
        });
      }
    }
  }
  const out = reconcile(comps, booked.filter((b) => b.componentKey.startsWith('g:')), new Map(), [], pendencies);
  // causa de lançamento de bônus é sempre «goal»
  return { ...out, entries: out.entries.map((e) => ({ ...e, cause: 'goal' as const })) };
}
