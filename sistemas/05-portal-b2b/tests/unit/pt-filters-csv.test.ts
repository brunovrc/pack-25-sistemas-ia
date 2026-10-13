import { describe, expect, it } from 'vitest';
import { csvText, int, toCsv } from '@/lib/portal/csv';
import { addDays, daysBetween, filtersToQuery, isRealDate, parseFilters, rpcArgs, todayIn, zonedIso } from '@/lib/portal/filters';

describe('datas e fuso', () => {
  it('«hoje» respeita o fuso (23h30 de Brasília ainda é o mesmo dia; 00h30 UTC já é o dia seguinte em UTC)', () => {
    const t = new Date('2026-10-14T02:30:00Z'); // 23:30 do dia 13 em Brasília (UTC-3)
    expect(todayIn('America/Sao_Paulo', t)).toBe('2026-10-13');
    expect(todayIn('UTC', t)).toBe('2026-10-14');
    expect(todayIn('Fuso/Inexistente', t)).toBe('2026-10-13'); // fuso inválido cai no padrão
  });
  it('aritmética de dias e validação de data real', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('2026-10-13')).toBe(true);
  });
  it('data e hora locais viram o instante UTC certo (sem horário de verão no Brasil desde 2019)', () => {
    expect(zonedIso('2026-10-13', '09:00', 'America/Sao_Paulo')).toBe('2026-10-13T12:00:00.000Z');
    expect(zonedIso('2026-10-13', '09:00', 'UTC')).toBe('2026-10-13T09:00:00.000Z');
    expect(zonedIso('2026-01-15', '23:30', 'America/Sao_Paulo')).toBe('2026-01-16T02:30:00.000Z');
  });
});

describe('filtros da URL', () => {
  const today = '2026-10-13';
  it('padrão: últimos 30 dias, inclusive hoje', () => {
    const f = parseFilters({}, today);
    expect(f).toMatchObject({ period: '30d', from: '2026-09-14', to: today, client: null, assignee: null, category: null, priority: null, status: null });
  });
  it('períodos fixos e personalizado válido', () => {
    expect(parseFilters({ period: '7d' }, today).from).toBe('2026-10-07');
    expect(parseFilters({ period: '365d' }, today).from).toBe('2025-10-14');
    expect(parseFilters({ period: 'custom', from: '2026-01-01', to: '2026-01-31' }, today)).toMatchObject({ period: 'custom', from: '2026-01-01', to: '2026-01-31' });
  });
  it('período personalizado inválido, invertido ou longo demais cai no padrão (sem erro)', () => {
    for (const sp of [{ period: 'custom', from: '2026-02-30', to: '2026-03-01' }, { period: 'custom', from: '2026-03-02', to: '2026-03-01' }, { period: 'custom', from: '2020-01-01', to: '2026-01-01' }, { period: 'custom' }, { period: 'xyz' }]) {
      expect(parseFilters(sp, today).period, JSON.stringify(sp)).toBe('30d');
    }
  });
  it('IDs só aceitam UUID; prioridade e situação só valores conhecidos (anti-injeção)', () => {
    const f = parseFilters({ client: "x' or 1=1 --", assignee: '11111111-2222-4333-8444-555555555555', category: 'abc', priority: 'urgent', status: 'drop table' }, today);
    expect(f.client).toBeNull();
    expect(f.assignee).toBe('11111111-2222-4333-8444-555555555555');
    expect(f.category).toBeNull();
    expect(f.priority).toBe('urgent');
    expect(f.status).toBeNull();
  });
  it('ida e volta: a query gerada reproduz os mesmos filtros', () => {
    const f = parseFilters({ period: 'custom', from: '2026-01-01', to: '2026-02-01', priority: 'high', status: 'open', client: '11111111-2222-4333-8444-555555555555' }, today);
    const back = parseFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f))), today);
    expect(back).toEqual(f);
    expect(rpcArgs('org', f)).toMatchObject({ p_org: 'org', p_from: '2026-01-01', p_to: '2026-02-01', p_priority: 'high', p_status: 'open' });
  });
});

describe('CSV seguro', () => {
  it('neutraliza fórmulas (= + - @ TAB CR) e escapa aspas', () => {
    expect(csvText('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    for (const s of ['+1', '-2', '@soma', '\tx', '\rx']) expect(csvText(s).startsWith('"\''), s).toBe(true);
    expect(csvText('normal')).toBe('"normal"');
    expect(csvText('')).toBe('');
    expect(csvText(null)).toBe('');
  });
  it('formato brasileiro: ; como separador, vírgula decimal, BOM e CRLF', () => {
    const out = toCsv(['Nome', 'Horas', 'Total'], [['Ana; Beta', 3.5, int(12)], [null, null, int(0)]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toBe('﻿"Nome";"Horas";"Total"\r\n"Ana; Beta";3,5;12\r\n;;0\r\n');
  });
});
