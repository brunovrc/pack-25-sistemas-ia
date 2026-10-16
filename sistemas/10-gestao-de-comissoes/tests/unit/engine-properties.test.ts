// Invariantes (§43) verificadas com entradas pseudoaleatórias DETERMINÍSTICAS (gerador fixo; sem dependência extra).
import { describe, expect, it } from 'vitest';
import { allocateByWeights, tierAmount, roundCents, D, computeCommissions, type BookedEntry, type SaleFacts } from '@/lib/commissions/engine';
import { BANDS_2_4_6, item, participant, pctRule, plan, receipt, reais, ret, run, sale, sum, tierRule, toBooked } from './fixtures';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

describe('Invariante 1 — precisão monetária', () => {
  it('rateio: a soma das partes é SEMPRE o total (milhares de casos)', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const n = int(r, 1, 7);
      const w = Array.from({ length: n }, () => String(int(r, 1, 1000)));
      const total = int(r, -5_000_000, 5_000_000);
      const parts = allocateByWeights(total, w);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every(Number.isInteger)).toBe(true);
    }
  });
  it('percentuais decimais exatos: 33,33% + 33,33% + 33,34% = 100%', () => {
    const parts = allocateByWeights(100000, ['33.33', '33.33', '33.34']);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100000);
  });
  it('soma de lançamentos = alvo, sem NaN/Infinity, em qualquer base', () => {
    const r = rng(11);
    const p = plan({ rules: [pctRule('r', '0.0375')] });
    for (let i = 0; i < 300; i++) {
      const amount = int(r, 1, 50_000_00);
      const { out } = run([sale({ id: `v${i}`, amountCents: amount, participants: [participant('A', p)] })]);
      expect(sum(out.entries)).toBe(roundCents(new D(amount).times('0.0375')));
      expect(out.entries.every((e) => Number.isSafeInteger(e.amountCents))).toBe(true);
    }
  });
});

describe('Invariante 2 e 3 — idempotência e histórico, com sequências aleatórias de eventos', () => {
  it('qualquer sequência de recebimentos/devoluções converge para o mesmo livro e reprocessar não muda nada', () => {
    const r = rng(23);
    const prop = plan({ eligibility: 'proportional_receipt', rules: [pctRule('r', '0.05')] });
    for (let run_ = 0; run_ < 60; run_++) {
      const total = int(r, 1000, 2_000_000);
      let booked: BookedEntry[] = [];
      const receipts: ReturnType<typeof receipt>[] = [];
      const returns: ReturnType<typeof ret>[] = [];
      let paid = 0;
      let returned = 0;
      const base = (): SaleFacts => sale({ id: 'v', amountCents: total, participants: [participant('A', prop)], status: returns.length ? 'partially_returned' : 'confirmed', receipts: [...receipts], returns: [...returns] });
      for (let step = 0; step < 6; step++) {
        if (r() < 0.6 && paid < total) {
          const a = int(r, 1, total - paid);
          paid += a;
          receipts.push(receipt(`rc${step}`, `2026-03-${String(10 + step).padStart(2, '0')}`, a));
        } else if (returned < total * 0.8) {
          const a = int(r, 1, Math.floor(total * 0.2));
          returned += a;
          returns.push(ret(`d${step}`, `2026-03-${String(10 + step).padStart(2, '0')}`, a));
        }
        const res = run([base()], booked);
        booked = res.booked;
        expect(run([base()], booked).out.entries).toEqual([]); // idempotente em cada passo
      }
      // convergência: o total do livro = alvo calculado do zero com todos os fatos
      const fresh = computeCommissions({ sales: [base()], booked: [] });
      expect(sum(booked)).toBe(sum(fresh.entries));
    }
  });
  it('lançamentos antigos nunca são reescritos: o livro só cresce', () => {
    const p = plan({ rules: [pctRule('r', '0.05')] });
    const s = sale({ id: 'v1', amountCents: reais(1000), participants: [participant('A', p)] });
    const first = run([s]);
    const snapshot = JSON.stringify(first.booked);
    const second = run([{ ...s, status: 'partially_returned', returns: [ret('d', '2026-03-12', reais(100))] }], first.booked);
    expect(JSON.stringify(second.booked.slice(0, first.booked.length))).toBe(snapshot);
  });
});

describe('faixas: a soma dos incrementos telescopa no acumulado arredondado', () => {
  it('ordem de chegada qualquer, resultado final igual ao cálculo direto (marginal e atingida)', () => {
    const r = rng(99);
    for (const mode of ['marginal', 'reached'] as const) {
      for (let k = 0; k < 40; k++) {
        const pl = plan({ rules: [tierRule('t', mode, BANDS_2_4_6)] });
        const n = int(r, 1, 8);
        const amounts = Array.from({ length: n }, () => int(r, 1, reais(8000)));
        const sales = amounts.map((a, i) => sale({ id: `v${i}`, date: `2026-03-${String(1 + i).padStart(2, '0')}`, amountCents: a, participants: [participant('A', pl)] }));
        const { out } = run(sales);
        const expected = roundCents(tierAmount(new D(amounts.reduce((a, b) => a + b, 0)), BANDS_2_4_6, mode));
        expect(sum(out.entries)).toBe(expected);
        // chegada incremental (uma venda por vez) converge para o mesmo total
        let booked: BookedEntry[] = [];
        for (let i = 1; i <= sales.length; i++) booked = run(sales.slice(0, i), booked).booked;
        expect(sum(booked)).toBe(expected);
      }
    }
  });
  it('venda retroativa que reordena o acumulado é compensada por ajuste (total correto, histórico intacto)', () => {
    const pl = plan({ rules: [tierRule('t', 'marginal', BANDS_2_4_6)] });
    const late = sale({ id: 'late', date: '2026-03-02', amountCents: reais(9000), participants: [participant('A', pl)] });
    const a = sale({ id: 'a', date: '2026-03-05', amountCents: reais(9000), participants: [participant('A', pl)] });
    const b = sale({ id: 'b', date: '2026-03-06', amountCents: reais(9000), participants: [participant('A', pl)] });
    const first = run([a, b]);
    const second = run([late, a, b], first.booked);
    expect(sum(second.booked)).toBe(roundCents(tierAmount(new D(reais(27000)), BANDS_2_4_6, 'marginal')));
    expect(second.booked.slice(0, first.booked.length)).toEqual(first.booked);
    expect(run([late, a, b], second.booked).out.entries).toEqual([]);
  });
});

describe('Invariante 8 — nenhuma operação mistura vendedores/vendas', () => {
  it('cada lançamento pertence exatamente a um (venda, vendedor) e a soma por vendedor é independente', () => {
    const p5 = plan({ rules: [pctRule('r', '0.05')] });
    const p3 = plan({ id: 'pv3', rules: [pctRule('r3', '0.03')] });
    const sales = [
      sale({ id: 'v1', amountCents: reais(1000), participants: [participant('A', p5)] }),
      sale({ id: 'v2', amountCents: reais(2000), participants: [participant('B', p3)] }),
    ];
    const { out } = run(sales);
    expect(out.entries.filter((e) => e.sellerId === 'A').every((e) => e.saleId === 'v1')).toBe(true);
    expect(out.entries.filter((e) => e.sellerId === 'B').every((e) => e.saleId === 'v2')).toBe(true);
    expect(toBooked(out.entries)).toHaveLength(2);
  });
  it('item único em venda com itens diferentes: soma por item = soma da venda', () => {
    const p = plan({ rules: [pctRule('r', '0.05')] });
    const s = sale({ id: 'v1', participants: [participant('A', p)], items: [item({ id: 'a', position: 1, commissionableCents: 3333 }), item({ id: 'b', position: 2, commissionableCents: 6667 })] });
    const { out } = run([s]);
    expect(out.entries).toHaveLength(2);
    expect(sum(out.entries)).toBe(167 + 333); // 166,65→167 e 333,35→333
  });
  it('totais inconsistentes: pendência crítica, nada lançado', () => {
    const p = plan({ rules: [pctRule('r', '0.05')] });
    const s = sale({ id: 'v1', amountCents: 1000, participants: [participant('A', p)], items: [item({ id: 'a', commissionableCents: 900 })] });
    const { out } = run([{ ...s, commissionableCents: 1000 }]);
    expect(out.entries).toEqual([]);
    expect(out.pendencies[0]!.code).toBe('SALE_TOTAL_MISMATCH');
  });
});
