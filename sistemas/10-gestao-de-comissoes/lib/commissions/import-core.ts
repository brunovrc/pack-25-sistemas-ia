// Núcleo PURO da importação CSV (sem I/O): leitura, normalização brasileira, mapeamento automático e validação de formato.
// A validação de vínculos (vendedor, produto, cliente existentes) e a gravação acontecem no servidor (importer.ts) e no banco.
import Papa from 'papaparse';
import { parseMoneyToCents } from './engine';

export const IMPORT_TYPES = ['customers', 'sellers', 'sales', 'receipts', 'goals'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20000;

export type FieldDef = { key: string; label: string; required?: boolean; aliases: string[]; hint?: string };
const f = (key: string, label: string, aliases: string[], required = false, hint?: string): FieldDef => ({ key, label, required, aliases, hint });

export const FIELDS: Record<ImportType, FieldDef[]> = {
  customers: [f('name', 'Nome', ['nome', 'cliente', 'razao social'], true), f('legal_name', 'Razão social', ['razaosocial']), f('document', 'CPF/CNPJ', ['documento', 'cpf', 'cnpj', 'cpfcnpj']), f('email', 'E-mail', ['email']), f('phone', 'Telefone', ['telefone', 'fone', 'celular'])],
  sellers: [f('name', 'Nome', ['nome', 'vendedor'], true), f('code', 'Código', ['codigo', 'cod'], true), f('type', 'Tipo', ['tipo'], false, 'interno, externo ou parceiro'), f('team', 'Equipe', ['equipe', 'time']), f('starts_at', 'Início', ['inicio', 'datainicio', 'admissao'], true, 'DD/MM/AAAA')],
  sales: [
    f('sale_number', 'Número da venda', ['numero', 'numerovenda', 'venda', 'pedido'], true), f('external_reference', 'Referência externa', ['referencia', 'referenciaexterna', 'idexterno']),
    f('date', 'Data', ['data', 'datavenda'], true, 'DD/MM/AAAA'), f('customer', 'Cliente (documento ou nome)', ['cliente', 'documento', 'cpfcnpj']), f('seller', 'Vendedor (código)', ['vendedor', 'codigovendedor'], true),
    f('seller_share', 'Participação do vendedor (%)', ['participacao', 'percentual']), f('seller2', '2º vendedor (código)', ['vendedor2', 'codigovendedor2']), f('seller2_share', 'Participação do 2º (%)', ['participacao2']),
    f('split', 'Divisão (pool/independente)', ['divisao', 'rateio']), f('channel', 'Canal', ['canal']), f('sku', 'SKU do produto', ['sku', 'produto', 'codigoproduto']), f('description', 'Descrição do item', ['descricao']),
    f('quantity', 'Quantidade', ['quantidade', 'qtd'], true), f('unit_price', 'Preço unitário', ['precounitario', 'preco', 'valorunitario'], true), f('discount', 'Desconto do item', ['desconto']),
    f('commissionable', 'Base comissionável do item', ['basecomissionavel', 'comissionavel']), f('cost', 'Custo do item', ['custo']),
  ],
  receipts: [f('sale_number', 'Número da venda', ['numero', 'numerovenda', 'venda'], true), f('amount', 'Valor recebido', ['valor', 'valorrecebido'], true), f('date', 'Data', ['data', 'datarecebimento'], true), f('reference', 'Referência', ['referencia', 'comprovante'])],
  goals: [
    f('name', 'Nome da meta', ['nome', 'meta'], true), f('goal_type', 'Tipo', ['tipo'], true, 'valor vendido, valor recebido, número de vendas, novos clientes'), f('target', 'Valor da meta', ['valor', 'alvo'], true),
    f('start', 'Início', ['inicio', 'datainicio'], true), f('end', 'Fim', ['fim', 'datafim'], true), f('scope', 'Escopo', ['escopo'], true, 'vendedor, equipe ou empresa'), f('reference', 'Código do vendedor ou nome da equipe', ['referencia', 'alvoescopo']),
  ],
};

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export type Parsed = { headers: string[]; rows: string[][]; delimiter: string };
export class ImportFormatError extends Error {}

/** Lê o CSV (BOM, ; ou , automático). Recusa binário, arquivo grande demais e linhas demais. */
export function parseCsv(text: string): Parsed {
  if (text.length > MAX_BYTES) throw new ImportFormatError('Arquivo acima de 5 MB.');
  if (text.includes('\u0000')) throw new ImportFormatError('O arquivo não parece ser um CSV de texto.');
  const clean = text.replace(/^﻿/, '');
  const r = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy', delimitersToGuess: [';', ',', '\t', '|'] });
  const data = r.data.filter((row) => Array.isArray(row));
  if (data.length < 2) throw new ImportFormatError('O arquivo precisa de um cabeçalho e ao menos uma linha.');
  if (data.length - 1 > MAX_ROWS) throw new ImportFormatError(`Máximo de ${MAX_ROWS.toLocaleString('pt-BR')} linhas por arquivo.`);
  const headers = data[0]!.map((h) => String(h ?? '').trim());
  if (headers.some((h) => h.length > 120) || new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new ImportFormatError('Cabeçalho inválido (colunas repetidas ou nomes enormes).');
  const rows = data.slice(1).map((row) => row.map((c) => String(c ?? '').trim().slice(0, 500)));
  return { headers, rows, delimiter: r.meta.delimiter };
}

/** Sugere o mapeamento «campo → índice da coluna» pelos nomes do cabeçalho. */
export function autoMap(type: ImportType, headers: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const nh = headers.map(norm);
  const used = new Set<number>();
  for (const fd of FIELDS[type]) {
    const names = [norm(fd.label), norm(fd.key), ...fd.aliases.map(norm)];
    const i = nh.findIndex((h, ix) => !used.has(ix) && names.includes(h));
    out[fd.key] = i >= 0 ? i : null;
    if (i >= 0) used.add(i);
  }
  return out;
}

// ---- normalização brasileira ------------------------------------------------------------------------------
export function parseDateBR(v: string): string | null {
  const s = v.trim();
  let y: string, m: string, d: string;
  let mm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mm) { d = mm[1]!; m = mm[2]!; y = mm[3]!; }
  else if ((mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = mm[1]!; m = mm[2]!; d = mm[3]!; }
  else return null;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}
export function moneyOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  return parseMoneyToCents(v);
}
export function qtyOrNull(v: string): string | null {
  const s = v.trim().replace(/\./g, (m, i, all) => (all.includes(',') ? '' : m)).replace(',', '.');
  return /^\d{1,10}(\.\d{1,4})?$/.test(s) && Number(s) > 0 ? s : null;
}
export function pctOrNull(v: string): string | null {
  const s = v.trim().replace('%', '').replace(',', '.');
  return /^\d{1,3}(\.\d{1,6})?$/.test(s) && Number(s) > 0 && Number(s) <= 100 ? s : null;
}

export type RowError = { row: number; code: string; message: string };
export const GOAL_TYPE_ALIASES: Record<string, string> = {
  'valor vendido': 'sold_value', 'valor recebido': 'received_value', 'numero de vendas': 'sales_count', 'novos clientes': 'new_customers', 'unidades de um produto': 'product_units', 'valor de um produto': 'product_value',
  sold_value: 'sold_value', received_value: 'received_value', sales_count: 'sales_count', new_customers: 'new_customers',
};
export const normKey = norm;
export const cell = (row: string[], map: Record<string, number | null>, key: string): string => {
  const i = map[key];
  return i === null || i === undefined ? '' : (row[i] ?? '').trim();
};
export const dateOrNull = parseDateBR;
