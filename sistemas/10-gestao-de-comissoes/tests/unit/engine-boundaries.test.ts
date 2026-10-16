// Limites exatos e recusas do motor: cada teste aqui nasceu de uma mutação que sobreviveu em scripts/mutation-check.mjs.
import { describe, expect, it } from 'vitest';
import {
  D, allocateByWeights, evalCondition, formatBRL, parseCondition, parseMoneyToCents, rate, tierBreakdown, validatePlanVersion, validateTiers,
} from '@/lib/commissions/engine';
import { BANDS_2_4_6, item, participant, pctRule, plan, reais, ret, run, sale, tierRule } from './fixtures';

const A = (p: ReturnType<typeof plan>) => participant('A', p);
const codes = (out: ReturnType<typeof run>['out']) => out.pendencies.map((p) => p.code);

describe('dinheiro: recusas', () => {
  it('taxa negativa e acima de 100% são recusadas', () => {
    expect(() => rate('-0.01')).toThrow(/fora de 0–100%/);
    expect(() => rate('1.01')).toThrow(/fora de 0–100%/);
    expect(rate('1').toString()).toBe('1');
    expect(rate('0').toString()).toBe('0');
  });
  it('centavos não inteiros são recusados na formatação', () => {
    expect(() => formatBRL(1.5)).toThrow(/inteiro em centavos/);
  });
  it('ponto com 3 casas só é milhar quando há de 1 a 3 dígitos antes', () => {
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('12.345')).toBe(1234500);
    expect(() => parseMoneyToCents('1234.567')).toThrow(/inválido/);
    expect(() => parseMoneyToCents('12345.678')).toThrow(/inválido/);
  });
});

describe('rateio: recusas', () => {
  it('peso negativo é recusado', () => {
    expect(() => allocateByWeights(100, ['-1', '2'])).toThrow(/negativa/);
  });
});

describe('faixas: validações adicionais', () => {
  it('ordens duplicadas são apontadas', () => {
    const issues = validateTiers([{ order: 1, fromCents: 0, toCents: 100, rate: '0.02' }, { order: 1, fromCents: 100, toCents: null, rate: '0.04' }]);
    expect(issues.map((i) => i.code)).toContain('TIER_ORDER');
  });
  it('base exatamente no teto da faixa pertence a ela, também na memória de cálculo', () => {
    const rows = tierBreakdown(new D(reais(10000)), BANDS_2_4_6, 'reached');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ order: 1, rate: '0.02' });
    const next = tierBreakdown(new D(reais(10000) + 1), BANDS_2_4_6, 'reached');
    expect(next[0]).toMatchObject({ order: 2, rate: '0.04' });
  });
});

describe('condições: limites', () => {
  it('«between» é inclusivo nas duas pontas', () => {
    const c = parseCondition({ fact: 'sale.net_cents', op: 'between', value: [100, 200] });
    const at = (v: number) => evalCondition(c, { 'sale.net_cents': v });
    expect([at(99), at(100), at(150), at(200), at(201)]).toEqual([false, true, true, true, false]);
  });
  it('«não está em» exclui os listados e inclui os demais', () => {
    const c = parseCondition({ fact: 'seller.id', op: 'not_in', value: ['a', 'b'] });
    expect(evalCondition(c, { 'seller.id': 'a' })).toBe(false);
    expect(evalCondition(c, { 'seller.id': 'c' })).toBe(true);
  });
  it('limite de tamanho total da condição', () => {
    const leaf = { fact: 'seller.id', op: 'eq', value: 'x' };
    const group = { any: Array.from({ length: 16 }, () => leaf) };
    expect(() => parseCondition({ all: [group, group] })).toThrow(/grande demais/);
    expect(() => parseCondition({ all: [{ any: [leaf, leaf] }, { any: [leaf, leaf] }] })).not.toThrow();
  });
});

describe('vigência e escopo da regra', () => {
  const one = (r: ReturnType<typeof pctRule>) => run([sale({ id: 'v1', amountCents: reais(1000), participants: [A(plan({ rules: [r] }))] })]).out;
  it('vigência é inclusiva nos dois extremos (data da venda = 2026-03-10)', () => {
    expect(one(pctRule('r', '0.05', { validFrom: '2026-03-10' })).entries).toHaveLength(1);
    expect(one(pctRule('r', '0.05', { validUntil: '2026-03-10' })).entries).toHaveLength(1);
    expect(one(pctRule('r', '0.05', { validFrom: '2026-03-11' })).entries).toHaveLength(0);
    expect(one(pctRule('r', '0.05', { validUntil: '2026-03-09' })).entries).toHaveLength(0);
  });
  it('regra de outra equipe não se aplica; da mesma equipe, sim', () => {
    expect(one(pctRule('r', '0.05', { scopeType: 'team', scopeReference: 't2' })).entries).toHaveLength(0);
    expect(one(pctRule('r', '0.05', { scopeType: 'team', scopeReference: 't1' })).entries).toHaveLength(1);
  });
  it('publicação recusa vigência invertida', () => {
    const issues = validatePlanVersion(plan({ rules: [pctRule('r', '0.05', { validFrom: '2026-05-01', validUntil: '2026-04-01' })] }));
    expect(issues.map((i) => i.code)).toContain('RULE_WINDOW');
  });
});

describe('venda: fatos inválidos nunca geram comissão', () => {
  const p = plan({ rules: [pctRule('r', '0.05')] });
  const two = [item({ id: 'i1', position: 1, commissionableCents: reais(600) }), item({ id: 'i2', position: 2, commissionableCents: reais(400) })];
  const base = (extra: Omit<Parameters<typeof sale>[0], 'participants' | 'items'>) => run([sale({ participants: [A(p)], items: two, ...extra })]).out;

  it('devolução por item que não soma o valor devolvido é recusada e protege a venda', () => {
    const out = base({ id: 'v1', status: 'partially_returned', returns: [ret('d1', '2026-03-15', reais(300), { itemAmounts: { i1: reais(100), i2: reais(100) } })] });
    expect(codes(out)).toContain('RETURN_INVALID');
    expect(out.entries).toEqual([]);
  });
  it('devolução acima do saldo do item é limitada ao saldo, com aviso', () => {
    const out2 = base({ id: 'v2', status: 'partially_returned', returns: [ret('d1', '2026-03-15', reais(500), { itemAmounts: { i1: reais(500) } }), ret('d2', '2026-03-16', reais(500), { itemAmounts: { i1: reais(500) } })] });
    expect(codes(out2)).toContain('RETURN_EXCEEDS_SALE');
    // i1 fica totalmente devolvido (600), nunca negativo: comissão restante = só i2 (400 × 5%)
    expect(out2.entries.reduce((a, e) => a + e.amountCents, 0)).toBe(2000);
  });
  it('vendedor repetido na mesma venda é recusado', () => {
    const out = run([sale({ id: 'v1', amountCents: reais(1000), participants: [A(p), participant('A', p, '50', false)] })]).out;
    expect(codes(out)).toContain('DUPLICATE_PARTICIPANT');
    expect(out.entries).toEqual([]);
  });
  it('pool exige exatamente um principal', () => {
    const none = run([sale({ id: 'v1', amountCents: reais(1000), splitModel: 'pool', participants: [participant('A', p, '50', false), participant('B', p, '50', false)] })]).out;
    expect(codes(none)).toContain('POOL_PRIMARY_REQUIRED');
    const two2 = run([sale({ id: 'v2', amountCents: reais(1000), splitModel: 'pool', participants: [participant('A', p, '50', true), participant('B', p, '50', true)] })]).out;
    expect(codes(two2)).toContain('POOL_PRIMARY_REQUIRED');
    expect(none.entries).toEqual([]);
    expect(two2.entries).toEqual([]);
  });
  it('pool que não soma 100% é recusado', () => {
    const out = run([sale({ id: 'v1', amountCents: reais(1000), splitModel: 'pool', participants: [participant('A', p, '60', true), participant('B', p, '30', false)] })]).out;
    expect(codes(out)).toContain('POOL_SUM_INVALID');
    expect(out.entries).toEqual([]);
  });
  it('venda totalmente devolvida com plano de estorno manual exige estorno manual', () => {
    const manual = plan({ rules: [pctRule('r', '0.05')], returnsPolicy: 'manual' });
    const s = sale({ id: 'v1', amountCents: reais(1000), participants: [A(manual)] });
    const first = run([s]);
    const back = run([{ ...s, status: 'totally_returned', returns: [ret('d1', '2026-03-20', reais(1000))] }], first.booked);
    expect(codes(back.out)).toContain('SALE_CANCELLED_NEEDS_REVERSAL');
    expect(back.out.entries).toEqual([]);
  });
  it('venda totalmente devolvida: causa do estorno é cancelamento', () => {
    const auto = plan({ rules: [pctRule('r', '0.05')] });
    const s = sale({ id: 'v1', amountCents: reais(1000), participants: [A(auto)] });
    const first = run([s]);
    const back = run([{ ...s, status: 'totally_returned', returns: [ret('d1', '2026-03-20', reais(1000))] }], first.booked);
    expect(back.out.entries).toHaveLength(1);
    expect(back.out.entries[0]).toMatchObject({ entryType: 'reversal', amountCents: -5000, cause: 'cancellation' });
  });
});

describe('faixas: grupos de acúmulo', () => {
  const t = tierRule('t', 'marginal', BANDS_2_4_6);
  const p = plan({ rules: [t] });
  it('meses diferentes acumulam separadamente; mesmo mês acumula junto', () => {
    const mar1 = sale({ id: 'v1', date: '2026-03-05', confirmedAt: '2026-03-05', amountCents: reais(10000), participants: [A(p)] });
    const mar2 = sale({ id: 'v2', date: '2026-03-20', confirmedAt: '2026-03-20', amountCents: reais(10000), participants: [A(p)] });
    const apr = sale({ id: 'v3', date: '2026-04-05', confirmedAt: '2026-04-05', amountCents: reais(10000), participants: [A(p)] });
    const out = run([mar1, mar2, apr]).out;
    const of = (id: string) => out.entries.filter((e) => e.saleId === id).reduce((a, e) => a + e.amountCents, 0);
    expect([of('v1'), of('v2'), of('v3')]).toEqual([20000, 40000, 20000]);
  });
  it('faixa por trimestre usa o trimestre civil (abril pertence ao 2º trimestre)', () => {
    const q = plan({ rules: [tierRule('tq', 'marginal', BANDS_2_4_6, {}, 'quarter')] });
    const mar = sale({ id: 'v1', date: '2026-03-31', confirmedAt: '2026-03-31', amountCents: reais(10000), participants: [A(q)] });
    const apr = sale({ id: 'v2', date: '2026-04-01', confirmedAt: '2026-04-01', amountCents: reais(10000), participants: [A(q)] });
    const jun = sale({ id: 'v3', date: '2026-06-30', confirmedAt: '2026-06-30', amountCents: reais(10000), participants: [A(q)] });
    const out = run([mar, apr, jun]).out;
    const of = (id: string) => out.entries.filter((e) => e.saleId === id).reduce((a, e) => a + e.amountCents, 0);
    // jan–mar: 1ª venda do trimestre a 2%; abr–jun: 2ª e 3ª somam no mesmo grupo (2% depois 4%)
    expect([of('v1'), of('v2'), of('v3')]).toEqual([20000, 20000, 40000]);
  });
});
