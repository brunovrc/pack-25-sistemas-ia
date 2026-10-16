// Livro (alvo × livro), bases especiais e metas: testes nascidos de mutações sobreviventes em scripts/mutation-check.mjs.
import { describe, expect, it } from 'vitest';
import { evaluateGoals, goalProgress, type GoalFacts } from '@/lib/commissions/engine';
import { BANDS_2_4_6, fixedRule, participant, pctRule, plan, receipt, reais, ret, run, sale, sum, tierRule } from './fixtures';

const P5 = plan({ rules: [pctRule('r', '0.05')] });

describe('bases especiais', () => {
  it('base «valor recebido» é limitada ao saldo do item depois de devoluções', () => {
    const pl = plan({ rules: [pctRule('r', '0.05')], basis: 'received_value', eligibility: 'proportional_receipt' });
    const s = sale({ id: 'v1', amountCents: reais(1000), participants: [participant('A', pl)], receipts: [receipt('r1', '2026-03-12', reais(1000))] });
    const first = run([s]);
    expect(sum(first.booked)).toBe(reais(50));
    const back = run([{ ...s, status: 'partially_returned', returns: [ret('d1', '2026-03-20', reais(400))] }], first.booked);
    expect(sum(back.booked)).toBe(reais(30)); // 5% × (1.000 − 400), não 5% × 1.000
  });
  it('valor fixo por venda deixa de valer quando a venda é totalmente devolvida', () => {
    const pl = plan({ rules: [fixedRule('f', reais(100))], basis: 'fixed_per_sale' });
    const s = sale({ id: 'v1', amountCents: reais(1000), participants: [participant('A', pl)] });
    const first = run([s]);
    expect(sum(first.booked)).toBe(reais(100));
    const back = run([{ ...s, status: 'totally_returned', returns: [ret('d1', '2026-03-20', reais(1000))] }], first.booked);
    expect(sum(back.booked)).toBe(0);
    expect(back.out.entries[0]).toMatchObject({ entryType: 'reversal', amountCents: -reais(100) });
  });
});

describe('faixas por equipe', () => {
  it('vendedores da mesma equipe acumulam juntos; de equipes diferentes, separados', () => {
    const pl = plan({ rules: [tierRule('t', 'marginal', BANDS_2_4_6, {}, 'month', 'team')] });
    const a = sale({ id: 'v1', date: '2026-03-05', confirmedAt: '2026-03-05', amountCents: reais(10000), participants: [participant('A', pl, '100', true, 't1')] });
    const b = sale({ id: 'v2', date: '2026-03-06', confirmedAt: '2026-03-06', amountCents: reais(10000), participants: [participant('B', pl, '100', true, 't1')] });
    const c = sale({ id: 'v3', date: '2026-03-07', confirmedAt: '2026-03-07', amountCents: reais(10000), participants: [participant('C', pl, '100', true, 't2')] });
    const out = run([a, b, c]).out;
    const of = (id: string) => out.entries.filter((e) => e.saleId === id).reduce((x, e) => x + e.amountCents, 0);
    expect([of('v1'), of('v2'), of('v3')]).toEqual([reais(200), reais(400), reais(200)]);
  });
});

describe('livro', () => {
  it('recálculo para menos sem devolução é ajuste negativo (causa: recálculo) e referencia o original', () => {
    const s = sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', P5)] });
    const first = run([s]);
    const lower = plan({ rules: [pctRule('r', '0.03')] });
    const back = run([{ ...s, participants: [participant('A', lower)] }], first.booked);
    expect(back.out.entries).toHaveLength(1);
    expect(back.out.entries[0]).toMatchObject({ entryType: 'adjustment_negative', cause: 'recalculation', amountCents: -reais(200), originalIdempotencyKey: first.out.entries[0]!.idempotencyKey });
  });
  it('estorno e venda na mesma execução: o positivo vem primeiro e o estorno aponta para ele', () => {
    const pl = plan({ rules: [tierRule('t', 'marginal', BANDS_2_4_6)] });
    const s = sale({ id: 'v1', amountCents: reais(25000), status: 'partially_returned', participants: [participant('A', pl)], returns: [ret('d1', '2026-03-28', reais(5000))] });
    const out = run([s]).out;
    expect(out.entries.map((e) => e.entryType)).toEqual(['commission', 'reversal']);
    expect(out.entries[0]!.amountCents).toBe(reais(900));
    expect(out.entries[1]!.amountCents).toBe(-reais(300));
    expect(out.entries[1]!.originalIdempotencyKey).toBe(out.entries[0]!.idempotencyKey);
  });
  it('chaves de idempotência crescem por componente (#1, #2…) e nunca se repetem', () => {
    const pl = plan({ rules: [pctRule('r', '0.05')], eligibility: 'proportional_receipt' });
    const base = sale({ id: 'v1', amountCents: reais(1000), participants: [participant('A', pl)] });
    const first = run([{ ...base, receipts: [receipt('r1', '2026-03-12', reais(400))] }]);
    const second = run([{ ...base, receipts: [receipt('r1', '2026-03-12', reais(400)), receipt('r2', '2026-03-14', reais(600))] }], first.booked);
    expect(first.out.entries[0]!.idempotencyKey.endsWith('#1')).toBe(true);
    expect(second.out.entries).toHaveLength(1);
    expect(second.out.entries[0]!.idempotencyKey.endsWith('#2')).toBe(true);
    expect(second.out.entries[0]!.amountCents).toBe(reais(30));
    expect(new Set(second.booked.map((b) => b.idempotencyKey)).size).toBe(second.booked.length);
  });
});

describe('metas: contagem e limites', () => {
  const goal = (p: Partial<GoalFacts> = {}): GoalFacts => ({
    id: 'g1', name: 'Meta março', type: 'sold_value', target: String(reais(1000)), periodStart: '2026-03-01', periodEnd: '2026-03-31', scope: 'seller', scopeReference: 'A',
    productId: null, sellerIds: ['A'],
    bonusRules: [{ id: 'b1', planVersionId: 'pv1', thresholdPct: '100', bonusType: 'fixed', bonusRate: null, bonusAmountCents: reais(500), timing: 'on_attainment', distribution: 'each' }], ...p,
  });
  const mk = (p: Partial<Parameters<typeof sale>[0]> = {}) => sale({ id: 'v1', date: '2026-03-10', amountCents: reais(1000), participants: [participant('A', P5)], ...p });

  it('venda totalmente devolvida não conta; parcialmente devolvida conta só o que ficou', () => {
    expect(goalProgress(goal(), [mk({ status: 'totally_returned', returns: [ret('d1', '2026-03-20', reais(1000))] })]).value.toNumber()).toBe(0);
    expect(goalProgress(goal(), [mk({ status: 'partially_returned', returns: [ret('d1', '2026-03-20', reais(400))] })]).value.toNumber()).toBe(reais(600));
  });
  it('último dia do período conta; o dia seguinte não', () => {
    expect(goalProgress(goal(), [mk({ date: '2026-03-31' })]).value.toNumber()).toBe(reais(1000));
    expect(goalProgress(goal(), [mk({ date: '2026-04-01' })]).value.toNumber()).toBe(0);
    expect(goalProgress(goal(), [mk({ date: '2026-03-01' })]).value.toNumber()).toBe(reais(1000));
    expect(goalProgress(goal(), [mk({ date: '2026-02-28' })]).value.toNumber()).toBe(0);
  });
  it('venda totalmente devolvida não conta nem como venda nem como cliente novo', () => {
    const back = mk({ status: 'totally_returned', customerId: 'c1', newCustomer: true, returns: [ret('d1', '2026-03-20', reais(1000))] });
    expect(goalProgress(goal({ type: 'sales_count', target: '1' }), [back]).value.toNumber()).toBe(0);
    expect(goalProgress(goal({ type: 'new_customers', target: '1' }), [back]).value.toNumber()).toBe(0);
    expect(goalProgress(goal({ type: 'sales_count', target: '1' }), [mk()]).value.toNumber()).toBe(1);
  });
  it('crédito da equipe nunca passa de 100% da venda', () => {
    const s = mk({ splitModel: 'independent', participants: [participant('A', P5, '100', true, 't1'), participant('B', P5, '100', false, 't1')] });
    const g = goal({ scope: 'team', scopeReference: 't1', sellerIds: ['A', 'B'] });
    expect(goalProgress(g, [s]).value.toNumber()).toBe(reais(1000));
    expect(goalProgress(g, [s]).attainment.toNumber()).toBe(1);
  });
  it('clientes novos são contados uma vez por cliente', () => {
    const g = goal({ type: 'new_customers', target: '2' });
    const s1 = mk({ id: 'v1', customerId: 'c1', newCustomer: true });
    const s2 = mk({ id: 'v2', customerId: 'c1', newCustomer: true });
    const s3 = mk({ id: 'v3', customerId: 'c2', newCustomer: true });
    expect(goalProgress(g, [s1, s2]).value.toNumber()).toBe(1);
    expect(goalProgress(g, [s1, s2, s3]).value.toNumber()).toBe(2);
  });
  it('meta com alvo zero nunca atinge nem paga bônus', () => {
    const g = goal({ target: '0' });
    expect(goalProgress(g, [mk()]).attainment.toNumber()).toBe(0);
    expect(evaluateGoals([g], [mk()], [], '2026-04-02').entries).toEqual([]);
  });
  it('bônus «ao atingir» é devido já no atingimento exato; «fim de período» só depois do fim', () => {
    const exact = goal();
    expect(evaluateGoals([exact], [mk()], [], '2026-03-15').entries).toHaveLength(1);
    const endOnly = goal({ bonusRules: [{ ...exact.bonusRules[0]!, timing: 'period_end' }] });
    expect(evaluateGoals([endOnly], [mk()], [], '2026-03-31').entries).toEqual([]);
    expect(evaluateGoals([endOnly], [mk()], [], '2026-04-01').entries).toHaveLength(1);
  });
});
