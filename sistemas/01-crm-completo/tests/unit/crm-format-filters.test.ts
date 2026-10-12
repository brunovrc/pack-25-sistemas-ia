import { describe, expect, it } from 'vitest';
import { formatBRL, formatDate, formatPct, isoToLocalInput, localInputToIso, parseBRL } from '@/lib/crm/format';
import { addDays, daysBetween, filtersToQuery, parseFilters, todaySaoPaulo } from '@/lib/crm/filters';

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 1234.56], ['1234,5', 1234.5], ['1234.56', 1234.56], ['R$ 10', 10], ['  R$ 1.000.000,00 ', 1000000],
    ['0,99', 0.99], ['1.234', 1234], ['10', 10], ['10,', 10], ['0', 0],
  ])('lê %j como %d', (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1.2.3', '12,345', '--5', '1e5', '1,234.56', '１２３', 'R$', '1..2'])('rejeita %j', (input) => {
    expect(parseBRL(input)).toBeNull();
  });

  it('arredonda a centavos', () => {
    expect(parseBRL('10.005')).toBe(10005);
    expect(parseBRL('0,10')).toBe(0.1);
  });
});

describe('formatação', () => {
  it('BRL e percentual no padrão brasileiro; sem dados vira traço', () => {
    expect(formatBRL(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formatBRL(null)).toBe('—');
    expect(formatPct(71.43)).toBe('71,43%');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(0)).toBe('0,00%');
  });
  it('datas sem deslocar o dia por fuso', () => {
    expect(formatDate('2026-09-30')).toBe('30/09/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('lixo')).toBe('—');
  });
  it('datetime-local <-> ISO no horário de Brasília', () => {
    expect(localInputToIso('2026-09-30T23:59')).toBe('2026-09-30T23:59:00-03:00');
    expect(new Date(localInputToIso('2026-09-30T23:59')!).toISOString()).toBe('2026-10-01T02:59:00.000Z');
    expect(isoToLocalInput('2026-10-01T02:59:00Z')).toBe('2026-09-30T23:59');
    expect(localInputToIso('30/09/2026')).toBeNull();
    expect(localInputToIso('2026-13-40T99:99')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
  });
});

describe('datas', () => {
  it('hoje em Brasília (virada do dia)', () => {
    expect(todaySaoPaulo(new Date('2026-10-01T02:59:59Z'))).toBe('2026-09-30');
    expect(todaySaoPaulo(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-01');
  });
  it('soma e diferença de dias, inclusive virada de mês e ano bissexto', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(29);
  });
});

describe('parseFilters', () => {
  const today = '2026-10-12';
  const UUID = '123e4567-e89b-42d3-a456-426614174000';

  it('padrão: últimos 30 dias, inclusive hoje', () => {
    expect(parseFilters({}, today)).toEqual({ period: '30d', from: '2026-09-13', to: '2026-10-12', owner: null, team: null, source: null });
  });
  it('presets de 7 e 90 dias', () => {
    expect(parseFilters({ period: '7d' }, today)).toMatchObject({ from: '2026-10-06', to: today });
    expect(parseFilters({ period: '90d' }, today)).toMatchObject({ from: '2026-07-15', to: today });
  });
  it('período personalizado válido', () => {
    expect(parseFilters({ period: 'custom', from: '2026-09-01', to: '2026-09-30' }, today)).toMatchObject({ period: 'custom', from: '2026-09-01', to: '2026-09-30' });
    expect(parseFilters({ period: 'custom', from: '2026-09-30', to: '2026-09-30' }, today)).toMatchObject({ period: 'custom' });
  });
  it.each([
    { period: 'custom', from: '2026-09-30', to: '2026-09-01' },
    { period: 'custom', from: '2026-02-30', to: '2026-03-10' },
    { period: 'custom', from: 'ontem', to: 'hoje' },
    { period: 'custom', from: '2020-01-01', to: '2026-10-12' },
    { period: 'custom' },
    { period: 'xyz' },
  ])('filtro inválido %j cai no padrão de 30 dias sem erro', (sp) => {
    const f = parseFilters(sp, today);
    expect(f.period).toBe('30d');
    expect(f.from).toBe('2026-09-13');
    expect(f.to).toBe(today);
  });
  it('vendedor, equipe e origem só aceitam UUID', () => {
    expect(parseFilters({ owner: UUID, team: UUID, source: UUID }, today)).toMatchObject({ owner: UUID, team: UUID, source: UUID });
    expect(parseFilters({ owner: "1' or 1=1 --", team: 'x', source: ['a'] }, today)).toMatchObject({ owner: null, team: null, source: null });
  });
  it('query string canônica', () => {
    expect(filtersToQuery(parseFilters({ period: 'custom', from: '2026-09-01', to: '2026-09-30', owner: UUID }, today))).toBe(`period=custom&from=2026-09-01&to=2026-09-30&owner=${UUID}`);
    expect(filtersToQuery(parseFilters({}, today))).toBe('period=30d');
  });
});
