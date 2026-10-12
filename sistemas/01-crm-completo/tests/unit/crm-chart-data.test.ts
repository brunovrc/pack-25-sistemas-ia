import { describe, expect, it } from 'vitest';
import { bucketLabel, bucketUnit, goalLabel, seriesRows, summarizeGoals } from '@/lib/crm/chart-data';
import type { GoalProgress } from '@/lib/crm/data';
import { pctOf, sumMoney, toCents } from '@/lib/crm/money';

const goal = (over: Partial<GoalProgress>): GoalProgress => ({
  goal_id: 'g', scope: 'user', user_id: 'u1', team_id: null, team_name: null, period_start: '2026-09-01', period_end: '2026-09-30',
  target_amount: 1000, realized: 0, pct: 0, elapsed_pct: 100, ...over,
});

describe('bucketUnit (mesma regra do banco)', () => {
  it('até 90 dias = semana; acima = mês', () => {
    expect(bucketUnit('2026-09-01', '2026-09-30')).toBe('week');
    expect(bucketUnit('2026-07-01', '2026-09-29')).toBe('week'); // 90 dias de diferença
    expect(bucketUnit('2026-07-01', '2026-09-30')).toBe('month'); // 91 dias
    expect(bucketUnit('2026-01-01', '2026-12-31')).toBe('month');
  });
});

describe('bucketLabel', () => {
  it('semana mostra dia/mês e mês mostra mês/ano', () => {
    expect(bucketLabel('2026-08-31', 'week')).toBe('31/08');
    expect(bucketLabel('2026-09-01', 'month')).toBe('set/26');
    expect(bucketLabel('2026-12-01', 'month')).toBe('dez/26');
    expect(bucketLabel('lixo', 'week')).toBe('lixo');
  });
  it('seriesRows rotula conforme o período', () => {
    const rows = seriesRows([{ bucket: '2026-08-31', won_value: 1050.1, won_count: 2, lost_count: 0 }], '2026-09-01', '2026-09-30');
    expect(rows).toEqual([{ label: '31/08', won_value: 1050.1, won_count: 2, lost_count: 0 }]);
  });
});

describe('summarizeGoals (cartão de metas)', () => {
  it('sem metas: nulo, sem divisão por zero', () => {
    expect(summarizeGoals([])).toMatchObject({ count: 0, target: 0, realized: 0, pct: null, met: 0 });
  });
  it('usa as individuais quando existem e soma realizado / meta', () => {
    const s = summarizeGoals([
      goal({ goal_id: 'a', target_amount: 5000, realized: 3100.3 }),
      goal({ goal_id: 'b', user_id: 'u2', target_amount: 500, realized: 550.05 }),
      goal({ goal_id: 'c', scope: 'team', user_id: null, team_id: 't', target_amount: 9999, realized: 1 }),
    ]);
    expect(s).toMatchObject({ count: 2, target: 5500, realized: 3650.35, met: 1, scopeLabel: 'individuais' });
    expect(s.pct).toBe(66.37);
  });
  it('sem individuais, usa as de equipe', () => {
    const s = summarizeGoals([goal({ scope: 'team', user_id: null, team_id: 't', target_amount: 200, realized: 200 })]);
    expect(s).toMatchObject({ count: 1, pct: 100, met: 1, scopeLabel: 'de equipe' });
  });
});

describe('goalLabel', () => {
  it('nome do vendedor ou da equipe', () => {
    expect(goalLabel(goal({}), new Map([['u1', 'Ana']]))).toBe('Ana');
    expect(goalLabel(goal({ user_id: 'x' }), new Map())).toBe('Usuário');
    expect(goalLabel(goal({ scope: 'team', user_id: null, team_name: 'Time Alfa' }), new Map())).toBe('Time Alfa');
  });
});

describe('dinheiro sem erro de ponto flutuante', () => {
  it('soma em centavos', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([1000.1, 2000.2, 500.05, 100, 50])).toBe(3650.35);
    expect(sumMoney([])).toBe(0);
    expect(toCents(19.99)).toBe(1999);
    expect(0.57 * 100).not.toBe(57); // 56.99999999999999
    expect(toCents(0.57)).toBe(57); // entradas têm no máximo 2 casas (numeric(14,2))
  });
  it('percentual com 2 casas e nulo sem divisor', () => {
    expect(pctOf(3100.3, 5000)).toBe(62.01);
    expect(pctOf(550.05, 500)).toBe(110.01);
    expect(pctOf(1, 0)).toBeNull();
    expect(pctOf(0, 100)).toBe(0);
  });
});
