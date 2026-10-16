/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor de consultas do PostgREST não tem tipos gerados neste projeto */
// Suíte matemática de referência (§42 do prompt mestre). Valores conhecidos, sem aleatoriedade.
import { describe, expect, it } from 'vitest';
import { allocateByWeights, computeCommissions, evaluateGoals, goalProgress, tierAmount, D, type GoalFacts } from '@/lib/commissions/engine';
import { BANDS_2_4_6, bySeller, fixedRule, item, participant, pctRule, plan, receipt, reais, ret, run, sale, seller, sum, tierRule, toBooked } from './fixtures';

const P5 = plan({ rules: [pctRule('r5', '0.05')] });

describe('Caso 1 — comissão percentual', () => {
  it('R$ 10.000 × 5% = R$ 500,00', () => {
    const { out } = run([sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', P5)] })]);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ amountCents: 50000, entryType: 'commission', sellerId: 'A', cause: 'initial' });
    expect(out.details[0]).toMatchObject({ potentialCents: 50000, eligibleCents: 50000, baseCents: 1000000, rate: '0.05' });
  });
});

describe('Caso 2 — comissão fixa', () => {
  it('3 vendas × R$ 100 = R$ 300', () => {
    const fx = plan({ basis: 'fixed_per_sale', rules: [fixedRule('f', reais(100))] });
    const sales = [1, 2, 3].map((n) => sale({ id: `v${n}`, amountCents: reais(1000 * n), participants: [participant('A', fx)] }));
    const { out } = run(sales);
    expect(out.entries).toHaveLength(3);
    expect(sum(out.entries)).toBe(30000);
  });
  it('bônus fixo por evento é lançamento do tipo bônus (não comissão)', () => {
    const fx = plan({ basis: 'fixed_per_sale', rules: [fixedRule('b', reais(100), { entryKind: 'bonus' })] });
    const { out } = run([sale({ id: 'v1', amountCents: reais(500), participants: [participant('A', fx)] })]);
    expect(out.entries[0]).toMatchObject({ entryType: 'bonus', amountCents: 10000 });
  });
  it('fixo por unidade multiplica pela quantidade válida (descontada a devolvida)', () => {
    const fx = plan({ basis: 'fixed_per_unit', rules: [fixedRule('u', reais(10))] });
    const s = sale({ id: 'v1', participants: [participant('A', fx)], items: [item({ id: 'i1', commissionableCents: reais(1000), quantity: '10' })] });
    const first = run([s]);
    expect(sum(first.out.entries)).toBe(reais(100));
    const back = run([{ ...s, status: 'partially_returned', returns: [ret('d1', '2026-03-15', reais(300))] }], first.booked);
    expect(sum(back.out.entries)).toBe(-reais(30)); // 3 unidades devolvidas
    expect(back.out.entries[0]).toMatchObject({ entryType: 'reversal' });
  });
});

describe('Caso 3 e 4 — faixas', () => {
  const sale25 = (rule: ReturnType<typeof tierRule>) => sale({ id: 'v1', amountCents: reais(25000), participants: [participant('A', plan({ rules: [rule] }))] });
  it('marginal: R$ 25.000 → 2%/4%/6% = R$ 900', () => {
    const { out } = run([sale25(tierRule('t', 'marginal', BANDS_2_4_6))]);
    expect(sum(out.entries)).toBe(90000);
    expect(out.details[0]!.snapshot).toMatchObject({ tier: { cumulativeAfterCents: '2500000' } });
  });
  it('faixa atingida: R$ 25.000 a 6% = R$ 1.500', () => {
    const { out } = run([sale25(tierRule('t', 'reached', BANDS_2_4_6))]);
    expect(sum(out.entries)).toBe(150000);
  });
  it('modos são distintos para a mesma base e as mesmas faixas', () => {
    expect(tierAmount(new D(reais(25000)), BANDS_2_4_6, 'marginal').toNumber()).toBe(90000);
    expect(tierAmount(new D(reais(25000)), BANDS_2_4_6, 'reached').toNumber()).toBe(150000);
  });
  it('limites: abaixo da primeira faixa, exatamente no teto (inclusivo), acima da última, e zero', () => {
    const t = (v: number, m: 'marginal' | 'reached') => tierAmount(new D(v), BANDS_2_4_6, m).toNumber();
    expect(t(reais(5000), 'marginal')).toBe(10000); // 2%
    expect(t(reais(10000), 'marginal')).toBe(20000);
    expect(t(reais(10000), 'reached')).toBe(20000); // 2%: o teto pertence à faixa 1
    expect(t(reais(10000) + 1, 'reached')).toBeCloseTo((reais(10000) + 1) * 0.04, 6); // 4% a partir de 10.000,01
    expect(t(reais(20000), 'reached')).toBe(80000); // 4%
    expect(t(reais(30000), 'marginal')).toBe(20000 + 40000 + 60000);
    expect(t(0, 'marginal')).toBe(0);
    expect(t(0, 'reached')).toBe(0);
    expect(t(-500, 'reached')).toBe(0);
  });
  it('mês sem vendas: nenhum lançamento, sem NaN', () => {
    const { out } = run([]);
    expect(out.entries).toEqual([]);
    expect(out.details).toEqual([]);
  });
  it('acumulado do mês: duas vendas somam na mesma faixa; a soma dos lançamentos fecha em R$ 900', () => {
    const pl = plan({ rules: [tierRule('t', 'marginal', BANDS_2_4_6)] });
    const sales = [
      sale({ id: 'v1', date: '2026-03-05', amountCents: reais(15000), participants: [participant('A', pl)] }),
      sale({ id: 'v2', date: '2026-03-20', amountCents: reais(10000), participants: [participant('A', pl)] }),
    ];
    const { out } = run(sales);
    expect(out.entries.map((e) => e.amountCents)).toEqual([reais(10000) * 0.02 + reais(5000) * 0.04, reais(5000) * 0.04 + reais(5000) * 0.06]);
    expect(sum(out.entries)).toBe(90000);
  });
  it('meses diferentes não se acumulam', () => {
    const pl = plan({ rules: [tierRule('t', 'marginal', BANDS_2_4_6)] });
    const sales = [
      sale({ id: 'v1', date: '2026-03-31', amountCents: reais(10000), participants: [participant('A', pl)] }),
      sale({ id: 'v2', date: '2026-04-01', amountCents: reais(10000), participants: [participant('A', pl)] }),
    ];
    expect(run(sales).out.entries.map((e) => e.amountCents)).toEqual([20000, 20000]);
  });
});

describe('Caso 5 e 10 — rateio', () => {
  it('pool R$ 20.000 × 5% = R$ 1.000 → A 60% (R$ 600) e B 40% (R$ 400)', () => {
    const s = sale({ id: 'v1', amountCents: reais(20000), splitModel: 'pool', participants: [participant('A', P5, '60', true), participant('B', null, '40', false)] });
    const { out } = run([s]);
    expect(bySeller(out.entries, 'A')).toBe(60000);
    expect(bySeller(out.entries, 'B')).toBe(40000);
    expect(sum(out.entries)).toBe(100000);
  });
  it('centavos: R$ 100,01 em 50/50 → R$ 50,01 e R$ 50,00 (soma exata; resto ao principal)', () => {
    expect(allocateByWeights(10001, ['50', '50'])).toEqual([5001, 5000]);
    expect(allocateByWeights(-10001, ['50', '50'])).toEqual([-5001, -5000]);
    expect(allocateByWeights(10000, ['33.3333', '33.3333', '33.3334']).reduce((a, b) => a + b, 0)).toBe(10000);
  });
  it('pool que não soma 100% é recusado (pendência crítica, sem lançamento)', () => {
    const s = sale({ id: 'v1', amountCents: reais(1000), splitModel: 'pool', participants: [participant('A', P5, '60', true), participant('B', P5, '50', false)] });
    const { out } = run([s]);
    expect(out.entries).toEqual([]);
    expect(out.pendencies[0]).toMatchObject({ code: 'POOL_SUM_INVALID', severity: 'critical' });
  });
  it('independentes: cada participante calcula pela própria regra sobre a base inteira (custo total pode superar a taxa)', () => {
    const P3 = plan({ id: 'pv3', rules: [pctRule('r3', '0.03')] });
    const s = sale({ id: 'v1', amountCents: reais(10000), splitModel: 'independent', participants: [participant('A', P5, '100', true), participant('B', P3, '100', false)] });
    const { out } = run([s]);
    expect(bySeller(out.entries, 'A')).toBe(50000);
    expect(bySeller(out.entries, 'B')).toBe(30000);
  });
});

describe('Caso 6 — recebimento parcial', () => {
  const prop = plan({ eligibility: 'proportional_receipt', rules: [pctRule('r5', '0.05')] });
  it('R$ 10.000, 5%, recebido R$ 4.000 → elegível R$ 200; pendente R$ 300', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', prop)], receipts: [receipt('rc1', '2026-03-20', reais(4000))] });
    const { out } = run([s]);
    expect(sum(out.entries)).toBe(20000);
    expect(out.details[0]).toMatchObject({ potentialCents: 50000, eligibleCents: 20000 });
    expect(out.entries[0]).toMatchObject({ eligibleAt: '2026-03-20', cause: 'initial', sourceEventId: 'rc1' });
  });
  it('sem recebimento: nada pagável (invariante 9)', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', prop)] });
    const { out } = run([s]);
    expect(out.entries).toEqual([]);
    expect(out.details[0]).toMatchObject({ potentialCents: 50000, eligibleCents: 0 });
  });
  it('novo recebimento libera só a diferença; recebimento total completa R$ 500', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', prop)], receipts: [receipt('rc1', '2026-03-20', reais(4000))] });
    const first = run([s]);
    const s2 = { ...s, receipts: [...s.receipts, receipt('rc2', '2026-04-02', reais(6000))] };
    const second = run([s2], first.booked);
    expect(second.out.entries).toHaveLength(1);
    expect(second.out.entries[0]).toMatchObject({ amountCents: 30000, cause: 'receipt', eligibleAt: '2026-04-02', sourceEventId: 'rc2' });
    expect(sum(second.booked)).toBe(50000);
  });
  it('recebimento acima do devido não gera comissão acima do potencial', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', prop)], receipts: [receipt('rc1', '2026-03-20', reais(12000))] });
    expect(sum(run([s]).out.entries)).toBe(50000);
  });
  it('recebimento total (full_receipt): só libera quando o devido está pago', () => {
    const full = plan({ eligibility: 'full_receipt', rules: [pctRule('r5', '0.05')] });
    const mk = (recv: number) => sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', full)], receipts: [receipt('rc1', '2026-03-20', recv)] });
    expect(sum(run([mk(reais(9999))]).out.entries)).toBe(0);
    expect(sum(run([mk(reais(10000))]).out.entries)).toBe(50000);
  });
  it('base «valor recebido»: comissão só sobre o que entrou', () => {
    const recv = plan({ basis: 'received_value', eligibility: 'proportional_receipt', rules: [pctRule('r5', '0.05')] });
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', recv)], receipts: [receipt('rc1', '2026-03-20', reais(4000))] });
    expect(sum(run([s]).out.entries)).toBe(20000);
  });
});

describe('Caso 7 e 8 — devolução e estorno', () => {
  const s0 = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', P5)] });
  it('devolução de R$ 2.000 reverte R$ 100 (líquido R$ 400), preservando o original', () => {
    const first = run([s0]);
    const back = run([{ ...s0, status: 'partially_returned', returns: [ret('d1', '2026-03-25', reais(2000))] }], first.booked);
    expect(back.out.entries).toHaveLength(1);
    expect(back.out.entries[0]).toMatchObject({ entryType: 'reversal', amountCents: -10000, cause: 'return', sourceEventId: 'd1', eligibleAt: '2026-03-25' });
    expect(back.out.entries[0]!.originalIdempotencyKey).toBe(first.out.entries[0]!.idempotencyKey);
    expect(sum(back.booked)).toBe(40000);
    expect(first.booked[0]!.amountCents).toBe(50000); // original intacto
  });
  it('estorno não se repete ao reprocessar (invariante 5)', () => {
    const first = run([s0]);
    const s1 = { ...s0, status: 'partially_returned' as const, returns: [ret('d1', '2026-03-25', reais(2000))] };
    const back = run([s1], first.booked);
    expect(run([s1], back.booked).out.entries).toEqual([]);
  });
  it('duas devoluções somam; devolução total zera tudo; cancelamento nunca gera positivo', () => {
    const first = run([s0]);
    const two = run([{ ...s0, status: 'partially_returned', returns: [ret('d1', '2026-03-25', reais(2000)), ret('d2', '2026-03-26', reais(3000))] }], first.booked);
    expect(sum(two.booked)).toBe(25000);
    const cancelled = run([{ ...s0, status: 'cancelled', cancelledAt: '2026-04-01' }], two.booked);
    expect(sum(cancelled.booked)).toBe(0);
    expect(cancelled.out.entries.every((e) => e.amountCents < 0 && e.cause === 'cancellation')).toBe(true);
    const again = run([{ ...s0, status: 'cancelled', cancelledAt: '2026-04-01' }], cancelled.booked);
    expect(again.out.entries).toEqual([]);
  });
  it('venda cancelada antes de qualquer lançamento não gera comissão', () => {
    expect(run([{ ...s0, status: 'cancelled' }]).out.entries).toEqual([]);
  });
  it('plano exige estorno manual: devolução vira pendência e NÃO reverte sozinha', () => {
    const manual = plan({ returnsPolicy: 'manual', rules: [pctRule('r5', '0.05')] });
    const sm = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', manual)] });
    const first = run([sm]);
    const back = run([{ ...sm, status: 'partially_returned', returns: [ret('d1', '2026-03-25', reais(2000))] }], first.booked);
    expect(back.out.entries).toEqual([]);
    expect(back.out.pendencies.map((p) => p.code)).toContain('RETURN_NEEDS_REVIEW');
    const canc = run([{ ...sm, status: 'cancelled' }], first.booked);
    expect(canc.out.entries).toEqual([]);
    expect(canc.out.pendencies.map((p) => p.code)).toContain('SALE_CANCELLED_NEEDS_REVERSAL');
  });
  it('faixas: devolução gera estorno marginal e a soma fecha no acumulado final', () => {
    const pl = plan({ rules: [tierRule('t', 'marginal', BANDS_2_4_6)] });
    const base = sale({ id: 'v1', amountCents: reais(25000), participants: [participant('A', pl)] });
    const first = run([base]);
    expect(sum(first.booked)).toBe(90000);
    const back = run([{ ...base, status: 'partially_returned', returns: [ret('d1', '2026-03-28', reais(5000))] }], first.booked);
    expect(back.out.entries[0]).toMatchObject({ entryType: 'reversal', amountCents: -30000, cause: 'return' }); // 5.000 × 6%
    expect(sum(back.booked)).toBe(60000);
  });
});

describe('Caso 9 — metas e bônus', () => {
  const goal = (p: Partial<GoalFacts> = {}): GoalFacts => ({
    id: 'g1', name: 'Meta março', type: 'sold_value', target: String(reais(100000)), periodStart: '2026-03-01', periodEnd: '2026-03-31', scope: 'seller', scopeReference: 'A',
    productId: null, sellerIds: ['A'],
    bonusRules: [{ id: 'b1', planVersionId: 'pv1', thresholdPct: '100', bonusType: 'fixed', bonusRate: null, bonusAmountCents: reais(500), timing: 'period_end', distribution: 'each' }], ...p,
  });
  const sales = (amount: number) => [sale({ id: 'v1', date: '2026-03-10', amountCents: amount, participants: [participant('A', P5)] })];
  it('R$ 110.000 de R$ 100.000 = 110% → bônus de R$ 500 ao fim do período', () => {
    const p = goalProgress(goal(), sales(reais(110000)));
    expect(p.attainment.toNumber()).toBeCloseTo(1.1, 10);
    const out = evaluateGoals([goal()], sales(reais(110000)), [], '2026-04-02');
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ entryType: 'bonus', amountCents: 50000, sellerId: 'A', cause: 'goal' });
  });
  it('antes do fim do período o bônus de «fim de período» ainda não é devido; abaixo do limite nunca', () => {
    expect(evaluateGoals([goal()], sales(reais(110000)), [], '2026-03-20').entries).toEqual([]);
    expect(evaluateGoals([goal()], sales(reais(99999)), [], '2026-04-02').entries).toEqual([]);
  });
  it('bônus não é pago duas vezes (idempotente) nem estornado sozinho', () => {
    const first = evaluateGoals([goal()], sales(reais(110000)), [], '2026-04-02');
    const booked = toBooked(first.entries);
    expect(evaluateGoals([goal()], sales(reais(110000)), booked, '2026-04-03').entries).toEqual([]);
    const lower = evaluateGoals([goal()], sales(reais(50000)), booked, '2026-04-03');
    expect(lower.entries).toEqual([]);
    expect(lower.pendencies.map((p) => p.code)).toContain('BONUS_BELOW_THRESHOLD');
  });
  it('venda compartilhada conta uma vez no escopo da equipe', () => {
    const s = sale({ id: 'v1', amountCents: reais(1000), splitModel: 'pool', participants: [participant('A', P5, '60', true, 't1'), participant('B', P5, '40', false, 't1')] });
    const g = goal({ scope: 'team', scopeReference: 't1', sellerIds: ['A', 'B'], target: String(reais(1000)) });
    expect(goalProgress(g, [s]).value.toNumber()).toBe(reais(1000));
    expect(goalProgress(g, [s]).attainment.toNumber()).toBe(1);
  });
  it('bônus proporcional rateia pelo crédito de cada vendedor', () => {
    const s = sale({ id: 'v1', date: '2026-03-10', amountCents: reais(100000), splitModel: 'pool', participants: [participant('A', P5, '70', true), participant('B', P5, '30', false)] });
    const g = goal({ scope: 'organization', scopeReference: null, sellerIds: ['A', 'B'], bonusRules: [{ id: 'b1', planVersionId: 'pv1', thresholdPct: '100', bonusType: 'fixed', bonusRate: null, bonusAmountCents: 10001, timing: 'period_end', distribution: 'proportional' }] });
    const out = evaluateGoals([g], [s], [], '2026-04-02');
    expect(sum(out.entries)).toBe(10001);
    expect(bySeller(out.entries, 'A')).toBe(7001);
  });
});

describe('Caso 11 — idempotência', () => {
  it('processar duas vezes a mesma venda e evento não duplica', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', P5)] });
    const first = run([s]);
    expect(run([s], first.booked).out.entries).toEqual([]);
  });
  it('chave de idempotência é determinística (duas execuções concorrentes colidem na mesma chave)', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', P5)] });
    const a = computeCommissions({ sales: [s], booked: [] });
    const b = computeCommissions({ sales: [s], booked: [] });
    expect(a.entries[0]!.idempotencyKey).toBe(b.entries[0]!.idempotencyKey);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // determinismo total
  });
});

describe('Caso 12 — mudança de plano não reescreve o passado', () => {
  it('venda antiga mantém 5%; venda nova nasce com 7%; reprocessar não altera a antiga', () => {
    const v2 = plan({ id: 'pv2', versionNumber: 2, rules: [pctRule('r7', '0.07')] });
    const old = sale({ id: 'v-old', date: '2026-02-10', amountCents: reais(10000), participants: [participant('A', P5)] });
    const first = run([old]);
    const nova = sale({ id: 'v-new', date: '2026-03-10', amountCents: reais(10000), participants: [participant('A', v2)] });
    const second = run([old, nova], first.booked);
    expect(second.out.entries).toHaveLength(1);
    expect(second.out.entries[0]).toMatchObject({ saleId: 'v-new', amountCents: 70000, planVersionId: 'pv2' });
    expect(first.booked[0]).toMatchObject({ amountCents: 50000, planVersionId: 'pv1' });
  });
});

describe('Rastreabilidade (invariante 10)', () => {
  it('todo lançamento identifica venda, item, plano, regra e memória de cálculo', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', P5)] });
    const { out } = run([s]);
    expect(out.entries[0]).toMatchObject({ saleId: 'v1', itemId: 'v1-i1', planVersionId: 'pv1', ruleId: 'r5' });
    const snap = out.details[0]!.snapshot as Record<string, any>;
    expect(snap.engine).toBe('1.0.0');
    expect(snap.plan).toMatchObject({ id: 'pv1', version: 1 });
    expect(snap.rule).toMatchObject({ id: 'r5', kind: 'percentage' });
    expect(snap.rounding).toMatch(/HALF_UP/);
  });
  it('vendedor sem plano: pendência crítica e nenhum lançamento', () => {
    const s = sale({ id: 'v1', amountCents: reais(1000), participants: [participant('A', null)] });
    const { out } = run([s]);
    expect(out.entries).toEqual([]);
    expect(out.pendencies[0]).toMatchObject({ code: 'NO_PLAN', severity: 'critical' });
    expect(seller('A').id).toBe('A');
  });
});
