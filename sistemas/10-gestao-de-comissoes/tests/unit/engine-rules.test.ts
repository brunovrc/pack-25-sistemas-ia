// Regras: precedência, empilhamento, conflito, condições seguras, validação de plano/faixas, base margem e dinheiro.
import { describe, expect, it } from 'vitest';
import {
  CommissionError, DEFAULT_PRECEDENCE, centsToDecimalText, dec, evalCondition, formatBRL, formatRate, parseCondition, parseMoneyToCents,
  parsePercentToRate, rate, roundCents, validatePlanVersion, validateTiers, D,
} from '@/lib/commissions/engine';
import { BANDS_2_4_6, fixedRule, item, participant, pctRule, plan, reais, run, sale, sum, tierRule } from './fixtures';

const one = (p: ReturnType<typeof plan>, over: Partial<Parameters<typeof sale>[0]> = {}) =>
  run([sale({ id: 'v1', amountCents: reais(10000), participants: [participant('A', p)], items: [item({ id: 'i1', commissionableCents: reais(10000), productId: 'prod1', categoryId: 'cat1' })], channel: 'web', ...over })]).out;

describe('precedência de regras', () => {
  const rules = [
    pctRule('global', '0.03'),
    pctRule('equipe', '0.035', { scopeType: 'team', scopeReference: 't1' }),
    pctRule('categoria', '0.04', { scopeType: 'category', scopeReference: 'cat1' }),
    pctRule('produto', '0.08', { scopeType: 'product', scopeReference: 'prod1' }),
  ];
  it('produto vence categoria, equipe e global', () => {
    const out = one(plan({ rules }));
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ ruleId: 'produto', amountCents: 80000 });
  });
  it('sem produto específico, vence a categoria; sem categoria, a equipe; por fim a global', () => {
    expect(one(plan({ rules: rules.filter((r) => r.id !== 'produto') })).entries[0]!.ruleId).toBe('categoria');
    expect(one(plan({ rules: rules.filter((r) => r.id === 'global' || r.id === 'equipe') })).entries[0]!.ruleId).toBe('equipe');
    expect(one(plan({ rules: [rules[0]!] })).entries[0]!.ruleId).toBe('global');
  });
  it('vendedor + produto vence produto; produto + canal vence produto', () => {
    const sp = pctRule('vend-prod', '0.10', { scopeType: 'seller', scopeReference: 'A', conditions: { all: [{ fact: 'product.id', op: 'eq', value: 'prod1' }] } });
    expect(one(plan({ rules: [...rules, sp] })).entries[0]!.ruleId).toBe('vend-prod');
    const pc = pctRule('prod-canal', '0.09', { scopeType: 'product', scopeReference: 'prod1', conditions: { all: [{ fact: 'sale.channel', op: 'eq', value: 'web' }] } });
    expect(one(plan({ rules: [...rules, pc] })).entries[0]!.ruleId).toBe('prod-canal');
    expect(one(plan({ rules: [...rules, pc] }), { channel: 'loja' }).entries[0]!.ruleId).toBe('produto');
  });
  it('regra fora da vigência ou desabilitada não participa', () => {
    const out = one(plan({ rules: [...rules, pctRule('campanha', '0.2', { scopeType: 'product', scopeReference: 'prod1', validUntil: '2026-01-31' }), pctRule('off', '0.2', { scopeType: 'product', scopeReference: 'prod1', enabled: false })] }));
    expect(out.entries[0]!.ruleId).toBe('produto');
  });
  it('mesma especificidade: maior prioridade vence', () => {
    const a = pctRule('a', '0.05', { priority: 1 });
    const b = pctRule('b', '0.06', { priority: 2 });
    expect(one(plan({ rules: [a, b] })).entries[0]!.ruleId).toBe('b');
  });
  it('empate sem desempate = conflito: sem lançamento e pendência crítica (nunca escolhe ao acaso)', () => {
    const out = one(plan({ rules: [pctRule('a', '0.05'), pctRule('b', '0.06')] }));
    expect(out.entries).toEqual([]);
    expect(out.pendencies[0]).toMatchObject({ code: 'RULE_CONFLICT', severity: 'critical' });
  });
  it('empilhamento só quando declarado: soma uma regra extra, registrada separadamente', () => {
    const out = one(plan({ rules: [pctRule('base', '0.05'), pctRule('campanha', '0.01', { stack: 'stack', scopeType: 'product', scopeReference: 'prod1' })] }));
    expect(out.entries.map((e) => [e.ruleId, e.amountCents]).sort()).toEqual([['base', 50000], ['campanha', 10000]]);
  });
  it('nenhuma regra aplicável: pendência de aviso e nada lançado', () => {
    const out = one(plan({ rules: [pctRule('so-cat', '0.05', { scopeType: 'category', scopeReference: 'outra' })] }));
    expect(out.entries).toEqual([]);
    expect(out.pendencies[0]!.code).toBe('NO_RULE_MATCH');
  });
  it('condição numérica: bônus de campanha só para venda acima de R$ 5.000', () => {
    const r = pctRule('grande', '0.07', { conditions: { fact: 'sale.net_cents', op: 'gte', value: reais(5000) }, priority: 5 });
    expect(one(plan({ rules: [pctRule('base', '0.05'), r] })).entries[0]!.ruleId).toBe('grande');
    expect(run([sale({ id: 'v2', amountCents: reais(1000), participants: [participant('A', plan({ rules: [pctRule('base', '0.05'), r] }))] })]).out.entries[0]!.ruleId).toBe('base');
  });
});

describe('condições seguras (sem execução arbitrária)', () => {
  it('rejeita fato, operador e chaves desconhecidas, código e estruturas profundas', () => {
    const bad: unknown[] = [
      { fact: 'process.env', op: 'eq', value: 'x' },
      { fact: 'seller.id', op: 'regex', value: 'x' },
      { fact: 'seller.id', op: 'eq', value: 'x', extra: 1 },
      { fact: 'seller.id', op: 'gt', value: 5 },
      { fact: 'seller.id', op: 'eq', value: { toString: 'x' } },
      { all: [] },
      { __proto__: { all: [] }, fact: 'seller.id', op: 'eq', value: 'a', constructor: 1 },
      'return process.exit(1)',
      null,
      { fact: 'sale.net_cents', op: 'between', value: [1] },
    ];
    for (const b of bad) expect(() => parseCondition(b), JSON.stringify(b)).toThrow(CommissionError);
    let deep: unknown = { fact: 'seller.id', op: 'eq', value: 'a' };
    for (let i = 0; i < 6; i++) deep = { not: deep };
    expect(() => parseCondition(deep)).toThrow(/profunda/);
  });
  it('AND/OR/NOT e operadores', () => {
    const c = parseCondition({ all: [{ fact: 'seller.team_id', op: 'in', value: ['t1', 't2'] }, { any: [{ fact: 'sale.channel', op: 'eq', value: 'web' }, { not: { fact: 'item.quantity', op: 'lt', value: '2' } }] }] });
    expect(evalCondition(c, { 'seller.team_id': 't1', 'sale.channel': 'loja', 'item.quantity': '3' })).toBe(true);
    expect(evalCondition(c, { 'seller.team_id': 't1', 'sale.channel': 'loja', 'item.quantity': '1' })).toBe(false);
    expect(evalCondition(c, { 'seller.team_id': 't9', 'sale.channel': 'web' })).toBe(false);
    expect(evalCondition(parseCondition({ fact: 'sale.net_cents', op: 'between', value: [100, 200] }), { 'sale.net_cents': 150 })).toBe(true);
    expect(evalCondition(parseCondition({ fact: 'sale.channel', op: 'ne', value: 'x' }), {})).toBe(true); // fato ausente: «diferente» vale
    expect(evalCondition(parseCondition({ fact: 'sale.channel', op: 'eq', value: 'x' }), { 'sale.channel': null })).toBe(false);
  });
});

describe('validação de faixas', () => {
  const t = (over: Array<[number, number, number | null, string]>) => over.map(([order, fromCents, toCents, r]) => ({ order, fromCents, toCents, rate: r }));
  it('faixas válidas passam', () => expect(validateTiers(BANDS_2_4_6)).toEqual([]));
  it('detecta sobreposição, lacuna, início ≠ 0, última fechada, intervalo invertido, taxa inválida, aberta no meio', () => {
    const codes = (b: ReturnType<typeof t>) => validateTiers(b).map((i) => i.code);
    expect(codes(t([[1, 0, 1000, '0.02'], [2, 900, null, '0.04']]))).toContain('TIER_OVERLAP');
    expect(codes(t([[1, 0, 1000, '0.02'], [2, 1100, null, '0.04']]))).toContain('TIER_GAP');
    expect(codes(t([[1, 100, null, '0.02']]))).toContain('TIER_FIRST_NOT_ZERO');
    expect(codes(t([[1, 0, 1000, '0.02']]))).toContain('TIER_LAST_NOT_OPEN');
    expect(codes(t([[1, 0, 0, '0.02'], [2, 0, null, '0.03']]))).toContain('TIER_INVALID_RANGE');
    expect(codes(t([[1, 0, null, '1.5']]))).toContain('TIER_RATE_INVALID');
    expect(codes(t([[1, 0, null, '0.02'], [2, 1000, null, '0.03']]))).toContain('TIER_OPEN_NOT_LAST');
    expect(codes([])).toContain('TIER_EMPTY');
  });
  it('o motor se recusa a calcular com faixas inválidas', () => {
    expect(() => tierRule('x', 'marginal', t([[1, 0, 1000, '0.02'], [2, 900, null, '0.04']]))).not.toThrow();
    const sl = sale({ id: 'v', amountCents: 5000, participants: [participant('A', plan({ rules: [tierRule('x', 'marginal', t([[1, 0, 1000, '0.02'], [2, 900, null, '0.04']]))] }))] });
    expect(() => run([sl])).toThrow(/sobrep/);
  });
});

describe('validação de versão de plano (publicação)', () => {
  const codes = (p: ReturnType<typeof plan>) => validatePlanVersion(p).map((i) => i.code);
  it('plano consistente publica', () => expect(codes(plan({ rules: [pctRule('a', '0.05'), tierRule('t', 'marginal', BANDS_2_4_6, { scopeType: 'category', scopeReference: 'c' })] }))).toEqual([]));
  it('detecta regra de tipo incompatível com a base, taxa inválida, bônus não fixo, escopo de produto em fixo por venda', () => {
    expect(codes(plan({ basis: 'fixed_per_sale', rules: [pctRule('a', '0.05')] }))).toContain('RULE_KIND_MISMATCH');
    expect(codes(plan({ rules: [fixedRule('f', 100)] }))).toContain('RULE_KIND_MISMATCH');
    expect(codes(plan({ rules: [pctRule('a', '1.5')] }))).toContain('RULE_RATE_INVALID');
    expect(codes(plan({ rules: [pctRule('a', '0.05', { entryKind: 'bonus' })] }))).toContain('RULE_BONUS_KIND');
    expect(codes(plan({ basis: 'fixed_per_sale', rules: [fixedRule('f', 100, { scopeType: 'product', scopeReference: 'p' })] }))).toContain('RULE_SCOPE_INVALID');
    expect(codes(plan({ rules: [] }))).toContain('PLAN_NO_RULES');
    expect(codes(plan({ basis: 'received_value', eligibility: 'sale_confirmation', rules: [pctRule('a', '0.05')] }))).toContain('BASIS_ELIGIBILITY_MISMATCH');
  });
  it('detecta conflito estático e escopo fora da precedência', () => {
    expect(codes(plan({ rules: [pctRule('a', '0.05'), pctRule('b', '0.06')] }))).toContain('RULE_CONFLICT');
    expect(codes(plan({ rules: [pctRule('a', '0.05', { scopeType: 'team', scopeReference: 't' })], precedence: [['product']] }))).toContain('RULE_SCOPE_NOT_RANKED');
    expect(codes(plan({ rules: [pctRule('a', '0.05', { scopeType: 'team' })] }))).toContain('RULE_SCOPE_REFERENCE');
    expect(DEFAULT_PRECEDENCE.at(-1)).toEqual([]);
  });
});

describe('base margem bruta', () => {
  const mg = plan({ basis: 'gross_margin', rules: [pctRule('m', '0.10')] });
  it('comissão sobre (receita − custo)', () => {
    const s = sale({ id: 'v1', participants: [participant('A', mg)], items: [item({ id: 'i1', commissionableCents: reais(1000), costCents: reais(600) })] });
    expect(sum(run([s]).out.entries)).toBe(reais(40)); // 10% de 400
  });
  it('custo ausente: pendência crítica, nunca presume zero', () => {
    const s = sale({ id: 'v1', participants: [participant('A', mg)], items: [item({ id: 'i1', commissionableCents: reais(1000), costCents: null })] });
    const { out } = run([s]);
    expect(out.entries).toEqual([]);
    expect(out.pendencies[0]).toMatchObject({ code: 'MISSING_COST', severity: 'critical' });
  });
  it('margem negativa não gera comissão negativa', () => {
    const s = sale({ id: 'v1', participants: [participant('A', mg)], items: [item({ id: 'i1', commissionableCents: reais(100), costCents: reais(500) })] });
    expect(run([s]).out.entries).toEqual([]);
  });
  it('devolução parcial reduz a margem proporcionalmente', () => {
    const s = sale({ id: 'v1', participants: [participant('A', mg)], items: [item({ id: 'i1', commissionableCents: reais(1000), costCents: reais(600) })] });
    const first = run([s]);
    const back = run([{ ...s, status: 'partially_returned', returns: [{ id: 'd', date: '2026-03-20', amountCents: reais(500) }] }], first.booked);
    expect(sum(back.out.entries)).toBe(-reais(20));
  });
});

describe('dinheiro e arredondamento', () => {
  it('formatação BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(-100)).toBe('-R$ 1,00');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(centsToDecimalText(-1)).toBe('-0.01');
  });
  it('leitura de valores brasileiros', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('R$ 10,00')).toBe(1000);
    expect(parseMoneyToCents('1234.56')).toBe(123456);
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('0,1')).toBe(10);
    expect(parseMoneyToCents('-5,00')).toBe(-500);
    for (const bad of ['', 'abc', '1,234.56', '1,2,3', '1e3', '1.2345', '10,999']) expect(() => parseMoneyToCents(bad), bad).toThrow(CommissionError);
  });
  it('percentual', () => {
    expect(parsePercentToRate('5%')).toBe('0.05');
    expect(parsePercentToRate('5,5')).toBe('0.055');
    expect(formatRate('0.055')).toBe('5,5%');
    expect(() => parsePercentToRate('101')).toThrow(CommissionError);
  });
  it('meio-para-cima, simétrico em negativos; sem float binário', () => {
    expect(roundCents(new D('0.5'))).toBe(1);
    expect(roundCents(new D('-0.5'))).toBe(-1);
    expect(roundCents(new D('2.4999999999'))).toBe(2);
    expect(roundCents(new D('-0.4'))).toBe(0);
    expect(Object.is(roundCents(new D('-0.4')), -0)).toBe(false);
    expect(() => dec(0.1)).toThrow(CommissionError);
    expect(() => rate('1.01')).toThrow(CommissionError);
    expect(dec('0.1').plus(dec('0.2')).toString()).toBe('0.3'); // 0,1 + 0,2 exato
  });
});
