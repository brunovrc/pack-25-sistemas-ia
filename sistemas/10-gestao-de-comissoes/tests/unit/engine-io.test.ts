// Entrada e saída de dados: CSV seguro (exportação) e leitura/normalização de importação.
import { describe, expect, it } from 'vitest';
import { csvMoney, csvText, toCsv } from '@/lib/commissions/csv';
import { ImportFormatError, MAX_ROWS, autoMap, cell, moneyOrNull, parseCsv, parseDateBR, pctOrNull, qtyOrNull } from '@/lib/commissions/import-core';

describe('exportação CSV', () => {
  it('células que parecem fórmula são neutralizadas (= + - @ tab CR)', () => {
    for (const s of ['=2+2', '+1', '-1', '@SOMA(A1)', '\tcmd', '\rcmd']) expect(csvText(s).replace(/^"|"$/g, '').startsWith("'")).toBe(true);
    expect(csvText('Maria')).toBe('Maria');
    expect(csvText('a-b')).toBe('a-b');
  });
  it('aspas, separador e quebra de linha são escapados', () => {
    expect(csvText('a;b')).toBe('"a;b"');
    expect(csvText('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvText('linha1\nlinha2')).toBe('linha1 linha2');
  });
  it('dinheiro sai com vírgula e sem filtro de fórmula (negativo é número, não texto)', () => {
    expect(csvMoney(123456)).toBe('1234,56');
    expect(csvMoney(-5000)).toBe('-50,00');
    expect(csvMoney(5)).toBe('0,05');
  });
  it('documento: BOM, separador «;», CRLF, tipos formatados e vazios', () => {
    const out = toCsv(
      [{ key: 'n', label: 'Nome', kind: 'text' }, { key: 'v', label: 'Valor', kind: 'money' }, { key: 'p', label: 'Pct', kind: 'pct' }, { key: 'd', label: 'Data', kind: 'date' }, { key: 'q', label: 'Qtd', kind: 'int' }],
      [{ n: '=HYPERLINK("x")', v: 150000, p: 5, d: '2026-03-10', q: 3.9 }, { n: 'Ana', v: null, p: undefined, d: '', q: 0 }],
    );
    expect(out.charCodeAt(0)).toBe(0xfeff);
    const lines = out.slice(1).split('\r\n');
    expect(lines[0]).toBe('Nome;Valor;Pct;Data;Qtd');
    expect(lines[1]).toBe("\"'=HYPERLINK(\"\"x\"\")\";1500,00;5,00;10/03/2026;3");
    expect(lines[2]).toBe('Ana;;;;0');
    expect(out.endsWith('\r\n')).toBe(true);
  });
});

describe('importação: leitura do arquivo', () => {
  it('detecta ; e , , remove BOM e apara espaços', () => {
    const a = parseCsv('﻿numero;valor\n V1 ; 10,50 \n');
    expect(a.delimiter).toBe(';');
    expect(a.headers).toEqual(['numero', 'valor']);
    expect(a.rows).toEqual([['V1', '10,50']]);
    expect(parseCsv('a,b\n1,2').delimiter).toBe(',');
  });
  it('recusa binário, arquivo sem linhas, cabeçalho repetido e excesso de linhas', () => {
    expect(() => parseCsv('PK\u0000\u0003')).toThrow(ImportFormatError);
    expect(() => parseCsv('so;cabecalho')).toThrow(/cabeçalho e ao menos uma linha/);
    expect(() => parseCsv('a;b\n1;2\u0000')).toThrow(/não parece ser um CSV/);
    expect(() => parseCsv('a;a\n1;2')).toThrow(/Cabeçalho inválido/);
    expect(() => parseCsv(`${'x'.repeat(121)};b\n1;2`)).toThrow(/Cabeçalho inválido/);
    const many = 'a;b\n' + Array.from({ length: MAX_ROWS + 1 }, () => '1;2').join('\n');
    expect(() => parseCsv(many)).toThrow(/Máximo de/);
    expect(() => parseCsv('a;b\n' + '1;2\n'.repeat(3))).not.toThrow();
  });
  it('arquivo acima de 5 MB é recusado antes de ler', () => {
    expect(() => parseCsv('a;b\n' + 'x'.repeat(5 * 1024 * 1024 + 1))).toThrow(/5 MB/);
  });
  it('células enormes são cortadas em 500 caracteres', () => {
    expect(parseCsv(`a;b\n${'x'.repeat(900)};2`).rows[0]![0]).toHaveLength(500);
  });
  it('mapeamento automático por nome, sem acento, e sem usar a mesma coluna duas vezes', () => {
    const m = autoMap('sales', ['Número', 'Referência', 'Data', 'Cliente', 'Vendedor', 'SKU', 'Quantidade', 'Preço', 'Desconto']);
    expect(m.sale_number).toBe(0);
    expect(m.date).toBe(2);
    expect(m.unit_price).toBe(7);
    expect(m.seller).toBe(4);
    expect(Object.values(m).filter((v) => v !== null).length).toBe(new Set(Object.values(m).filter((v) => v !== null)).size);
    expect(autoMap('sales', ['x', 'y']).sale_number).toBeNull();
    // «Razão social» casa com dois campos (nome e razão social): só o primeiro leva a coluna
    const c = autoMap('customers', ['Razão social', 'Documento']);
    expect(c.name).toBe(0);
    expect(c.legal_name).toBeNull();
    expect(c.document).toBe(1);
    expect(cell(['a', ' b '], { k: 1, z: null }, 'k')).toBe('b');
    expect(cell(['a'], { k: 5, z: null }, 'k')).toBe('');
    expect(cell(['a'], { k: 0, z: null }, 'z')).toBe('');
  });
});

describe('importação: normalização brasileira', () => {
  it('datas dd/mm/aaaa e ISO; dia inexistente é recusado', () => {
    expect(parseDateBR('10/09/2026')).toBe('2026-09-10');
    expect(parseDateBR('1/2/2026')).toBe('2026-02-01');
    expect(parseDateBR('2026-09-10')).toBe('2026-09-10');
    expect(parseDateBR('31/02/2026')).toBeNull();
    expect(parseDateBR('29/02/2025')).toBeNull();
    expect(parseDateBR('29/02/2028')).toBe('2028-02-29');
    expect(parseDateBR('10-09-2026')).toBeNull();
    expect(parseDateBR('')).toBeNull();
  });
  it('dinheiro: vazio = ausente; formatos válidos em centavos; lixo é erro', () => {
    expect(moneyOrNull('  ')).toBeNull();
    expect(moneyOrNull('1.500,00')).toBe(150000);
    expect(moneyOrNull('0')).toBe(0);
    expect(() => moneyOrNull('abc')).toThrow();
  });
  it('quantidade: positiva, até 4 casas, milhar com ponto quando há vírgula decimal', () => {
    expect(qtyOrNull('2')).toBe('2');
    expect(qtyOrNull('1.234,5')).toBe('1234.5');
    expect(qtyOrNull('0,5')).toBe('0.5');
    expect(qtyOrNull('0')).toBeNull();
    expect(qtyOrNull('-1')).toBeNull();
    expect(qtyOrNull('1,23456')).toBeNull();
    expect(qtyOrNull('x')).toBeNull();
  });
  it('percentual: de 0 (exclusive) a 100 (inclusive)', () => {
    expect(pctOrNull('5%')).toBe('5');
    expect(pctOrNull('100')).toBe('100');
    expect(pctOrNull('12,5')).toBe('12.5');
    expect(pctOrNull('0')).toBeNull();
    expect(pctOrNull('100,01')).toBeNull();
    expect(pctOrNull('-1')).toBeNull();
  });
});
