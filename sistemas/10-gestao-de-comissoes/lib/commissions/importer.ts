import 'server-only';
import { createHash } from 'node:crypto';
import type { Context } from '@/lib/auth/session';
import { chunk, fetchAll } from './facts';
import { GOAL_TYPE_ALIASES, ImportFormatError, autoMap, cell, dateOrNull, moneyOrNull, normKey, parseCsv, pctOrNull, qtyOrNull, type ImportType, type RowError } from './import-core';

// Importação CSV: valida TUDO no servidor (formato, vínculos, duplicidades) e grava pelas funções oficiais dos cadastros.
// Nunca aprova comissões nem calcula: vendas importadas ficam aguardando o cálculo do financeiro. Reimportar não duplica (venda por número/referência).

export type ImportOptions = { confirmSales: boolean; createCustomers: boolean; partial: boolean };
export type ImportReport = { ok: boolean; fatal?: string; total: number; accepted: number; rejected: number; errors: RowError[]; preview: string[][]; sameFileBefore: number; applied: boolean };

type Sellers = Map<string, { id: string; status: string }>;
const dedupeKey = (s: string) => normKey(s);

async function refs(ctx: Context) {
  const [sellers, products, teams] = await Promise.all([
    fetchAll<{ id: string; seller_code: string; status: string }>(() => ctx.supabase.from('sellers').select('id, seller_code, status').order('id') as never),
    fetchAll<{ id: string; sku: string; active: boolean }>(() => ctx.supabase.from('products').select('id, sku, active').order('id') as never),
    fetchAll<{ id: string; name: string }>(() => ctx.supabase.from('sales_teams').select('id, name').order('id') as never),
  ]);
  return {
    sellers: new Map(sellers.map((s) => [s.seller_code.toLowerCase(), { id: s.id, status: s.status }])) as Sellers,
    products: new Map(products.map((p) => [p.sku.toLowerCase(), p.id])),
    teams: new Map(teams.map((t) => [dedupeKey(t.name), t.id])),
  };
}

async function existing(ctx: Context, table: string, column: string, values: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk([...new Set(values.filter(Boolean))], 80)) for (const r of ((await ctx.supabase.from(table).select(column).in(column, part)).data ?? []) as unknown as Array<Record<string, string>>) out.add(String(r[column]).toLowerCase());
  return out;
}

export async function runImport(ctx: Context, org: string, a: { type: ImportType; text: string; mapping: Record<string, number | null>; fileName: string; options: ImportOptions; apply: boolean }): Promise<ImportReport> {
  const empty = (fatal: string): ImportReport => ({ ok: false, fatal, total: 0, accepted: 0, rejected: 0, errors: [], preview: [], sameFileBefore: 0, applied: false });
  let parsed;
  try { parsed = parseCsv(a.text); } catch (e) { return empty(e instanceof ImportFormatError ? e.message : 'Não foi possível ler o arquivo.'); }
  const map = a.mapping;
  const errors: RowError[] = [];
  const err = (row: number, code: string, message: string) => errors.push({ row, code, message });
  const R = await refs(ctx);
  const hash = createHash('sha256').update(a.text).digest('hex');
  const rows = parsed.rows;
  const rowNo = (i: number) => i + 2; // linha no arquivo (cabeçalho = 1)
  const preview = [parsed.headers, ...rows.slice(0, 8)];

  // ---- execução por tipo: cada tarefa = { rows: números de linha, run() }
  type Task = { rows: number[]; label: string; run: () => Promise<string | null> };
  const tasks: Task[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
    const { error } = await ctx.supabase.rpc(fn, args);
    return error ? (error.message.length <= 200 && !/violat|constraint|permission denied/i.test(error.message) ? error.message : 'o banco recusou o registro') : null;
  };

  if (a.type === 'customers') {
    const docs = rows.map((r) => cell(r, map, 'document')).filter(Boolean);
    const have = await existing(ctx, 'customers', 'document_number', docs);
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const name = cell(r, map, 'name');
      const doc = cell(r, map, 'document');
      if (!name) return err(rowNo(i), 'NOME_OBRIGATORIO', 'Nome do cliente é obrigatório.');
      if (doc && (have.has(doc.toLowerCase()) || seen.has(doc.toLowerCase()))) return err(rowNo(i), 'DUPLICADO', `Já existe cliente com o documento ${doc}.`);
      if (doc) seen.add(doc.toLowerCase());
      tasks.push({ rows: [rowNo(i)], label: name, run: () => rpc('cm_save_customer', { p_org: org, p_id: null, p_name: name, p_legal: cell(r, map, 'legal_name') || null, p_doc: doc || null, p_email: cell(r, map, 'email') || null, p_phone: cell(r, map, 'phone') || null }) });
    });
  } else if (a.type === 'sellers') {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const name = cell(r, map, 'name'); const code = cell(r, map, 'code'); const starts = dateOrNull(cell(r, map, 'starts_at'));
      const tname = cell(r, map, 'team'); const tp = normKey(cell(r, map, 'type'));
      if (!name || !code) return err(rowNo(i), 'CAMPO_OBRIGATORIO', 'Nome e código são obrigatórios.');
      if (!/^[A-Za-z0-9._-]{1,30}$/.test(code)) return err(rowNo(i), 'CODIGO_INVALIDO', 'Código: use letras, números, ponto, hífen ou sublinhado.');
      if (R.sellers.has(code.toLowerCase()) || seen.has(code.toLowerCase())) return err(rowNo(i), 'DUPLICADO', `Já existe vendedor com o código ${code}.`);
      if (!starts) return err(rowNo(i), 'DATA_INVALIDA', 'Data de início inválida (use DD/MM/AAAA).');
      const team = tname ? R.teams.get(dedupeKey(tname)) : null;
      if (tname && !team) return err(rowNo(i), 'EQUIPE_INEXISTENTE', `Equipe «${tname}» não existe.`);
      const type = tp.startsWith('ext') ? 'external' : tp.startsWith('parc') ? 'partner' : 'internal';
      seen.add(code.toLowerCase());
      tasks.push({ rows: [rowNo(i)], label: name, run: () => rpc('cm_save_seller', { p_org: org, p_id: null, p_name: name, p_code: code, p_type: type, p_team: team ?? null, p_user: null, p_starts_at: starts, p_ends_at: null, p_notes: null, p_status: 'active', p_effective: null }) });
    });
  } else if (a.type === 'receipts') {
    const nums = rows.map((r) => cell(r, map, 'sale_number'));
    const { data: ss } = await ctx.supabase.from('sales').select('id, sale_number').in('sale_number', [...new Set(nums.filter(Boolean))].slice(0, 1000));
    const sale = new Map(((ss ?? []) as Array<{ id: string; sale_number: string }>).map((s) => [s.sale_number.toLowerCase(), s.id]));
    rows.forEach((r, i) => {
      const sid = sale.get(cell(r, map, 'sale_number').toLowerCase());
      let amount: number | null = null;
      try { amount = moneyOrNull(cell(r, map, 'amount')); } catch { amount = null; }
      const date = dateOrNull(cell(r, map, 'date'));
      if (!sid) return err(rowNo(i), 'VENDA_INEXISTENTE', `Venda ${cell(r, map, 'sale_number') || '(vazio)'} não encontrada.`);
      if (!amount || amount <= 0) return err(rowNo(i), 'VALOR_INVALIDO', 'Valor recebido inválido (use 1.234,56, maior que zero).');
      if (!date) return err(rowNo(i), 'DATA_INVALIDA', 'Data inválida (use DD/MM/AAAA).');
      tasks.push({ rows: [rowNo(i)], label: `recebimento ${cell(r, map, 'sale_number')}`, run: () => rpc('cm_register_receipt', { p_org: org, p_sale: sid, p_amount: amount, p_date: date, p_reference: cell(r, map, 'reference') || null, p_notes: null }) });
    });
  } else if (a.type === 'goals') {
    rows.forEach((r, i) => {
      const name = cell(r, map, 'name'); const type = GOAL_TYPE_ALIASES[cell(r, map, 'goal_type').toLowerCase()] ?? GOAL_TYPE_ALIASES[normKey(cell(r, map, 'goal_type'))];
      const start = dateOrNull(cell(r, map, 'start')); const end = dateOrNull(cell(r, map, 'end'));
      const scope = normKey(cell(r, map, 'scope')); const ref = cell(r, map, 'reference');
      if (!name) return err(rowNo(i), 'NOME_OBRIGATORIO', 'Nome da meta é obrigatório.');
      if (!type) return err(rowNo(i), 'TIPO_INVALIDO', 'Tipo de meta não reconhecido (valor vendido, valor recebido, número de vendas ou novos clientes).');
      if (!start || !end || end < start) return err(rowNo(i), 'PERIODO_INVALIDO', 'Período inválido.');
      const isValue = ['sold_value', 'received_value'].includes(type);
      let target: string;
      try { target = isValue ? String(moneyOrNull(cell(r, map, 'target')) ?? 0) : String(Number(cell(r, map, 'target').replace(',', '.'))); } catch { return err(rowNo(i), 'META_INVALIDA', 'Valor da meta inválido.'); }
      if (!(Number(target) > 0)) return err(rowNo(i), 'META_INVALIDA', 'A meta deve ser maior que zero.');
      let sref: string | null = null; let stype = 'organization';
      if (scope.startsWith('vend')) { stype = 'seller'; sref = R.sellers.get(ref.toLowerCase())?.id ?? null; if (!sref) return err(rowNo(i), 'VENDEDOR_INEXISTENTE', `Vendedor ${ref || '(vazio)'} não encontrado.`); }
      else if (scope.startsWith('equ') || scope.startsWith('tim')) { stype = 'team'; sref = R.teams.get(dedupeKey(ref)) ?? null; if (!sref) return err(rowNo(i), 'EQUIPE_INEXISTENTE', `Equipe ${ref || '(vazio)'} não encontrada.`); }
      else if (!scope.startsWith('emp')) return err(rowNo(i), 'ESCOPO_INVALIDO', 'Escopo deve ser vendedor, equipe ou empresa.');
      tasks.push({ rows: [rowNo(i)], label: name, run: () => rpc('cm_save_goal', { p_org: org, p_id: null, p_goal: { name, goal_type: type, target_value: target, period_start: start, period_end: end, scope_type: stype, scope_reference_id: sref, product_id: null }, p_bonus: [] }) });
    });
  } else {
    // ---- vendas: uma linha por ITEM; linhas com o mesmo número formam uma venda
    const nums = rows.map((r) => cell(r, map, 'sale_number'));
    const haveNo = await existing(ctx, 'sales', 'sale_number', nums);
    const haveRef = await existing(ctx, 'sales', 'external_reference', rows.map((r) => cell(r, map, 'external_reference')));
    const docs = rows.map((r) => cell(r, map, 'customer')).filter(Boolean);
    const { data: cs } = docs.length ? await ctx.supabase.from('customers').select('id, name, document_number').is('archived_at', null).limit(5000) : { data: [] };
    const custByDoc = new Map<string, string>(); const custByName = new Map<string, string>();
    for (const c of (cs ?? []) as Array<{ id: string; name: string; document_number: string | null }>) { if (c.document_number) custByDoc.set(c.document_number.toLowerCase(), c.id); custByName.set(dedupeKey(c.name), c.id); }
    const groups = new Map<string, number[]>();
    rows.forEach((r, i) => { const n = cell(r, map, 'sale_number'); if (!n) { err(rowNo(i), 'NUMERO_OBRIGATORIO', 'Número da venda é obrigatório.'); return; } groups.set(n, [...(groups.get(n) ?? []), i]); });
    const refsSeen = new Set<string>();
    for (const [number, idxs] of groups) {
      const lines = idxs.map(rowNo);
      const first = rows[idxs[0]!]!;
      const bad = (code: string, msg: string) => lines.forEach((l) => err(l, code, msg));
      if (haveNo.has(number.toLowerCase())) { bad('DUPLICADO', `A venda ${number} já existe: não foi importada de novo.`); continue; }
      const extRef = cell(first, map, 'external_reference');
      if (extRef && (haveRef.has(extRef.toLowerCase()) || refsSeen.has(extRef.toLowerCase()))) { bad('DUPLICADO', `Referência externa ${extRef} já importada.`); continue; }
      const date = dateOrNull(cell(first, map, 'date'));
      if (!date) { bad('DATA_INVALIDA', 'Data da venda inválida (use DD/MM/AAAA).'); continue; }
      const inconsistent = idxs.some((ix) => cell(rows[ix]!, map, 'date') !== cell(first, map, 'date') || cell(rows[ix]!, map, 'seller') !== cell(first, map, 'seller') || cell(rows[ix]!, map, 'customer') !== cell(first, map, 'customer'));
      if (inconsistent) { bad('CABECALHO_INCONSISTENTE', 'Linhas da mesma venda com data, vendedor ou cliente diferentes.'); continue; }
      const s1 = R.sellers.get(cell(first, map, 'seller').toLowerCase());
      if (!s1) { bad('VENDEDOR_INEXISTENTE', `Vendedor ${cell(first, map, 'seller') || '(vazio)'} não encontrado.`); continue; }
      if (s1.status !== 'active') { bad('VENDEDOR_INATIVO', 'Vendedor inativo ou arquivado.'); continue; }
      const parts: Array<{ seller_id: string; allocation_percentage: string; participation_type: string }> = [];
      const split = normKey(cell(first, map, 'split')).startsWith('ind') ? 'independent' : 'pool';
      const code2 = cell(first, map, 'seller2');
      if (code2) {
        const s2 = R.sellers.get(code2.toLowerCase());
        const p2 = pctOrNull(cell(first, map, 'seller2_share'));
        const p1 = pctOrNull(cell(first, map, 'seller_share')) ?? (p2 ? String(100 - Number(p2)) : null);
        if (!s2 || s2.status !== 'active') { bad('VENDEDOR_INEXISTENTE', `2º vendedor ${code2} não encontrado ou inativo.`); continue; }
        if (!p1 || !p2) { bad('PARTICIPACAO_INVALIDA', 'Informe as participações dos dois vendedores (0–100%).'); continue; }
        if (split === 'pool' && Math.abs(Number(p1) + Number(p2) - 100) > 1e-9) { bad('POOL_NAO_SOMA_100', 'No pool as participações devem somar exatamente 100%.'); continue; }
        parts.push({ seller_id: s1.id, allocation_percentage: p1, participation_type: 'primary' }, { seller_id: s2.id, allocation_percentage: p2, participation_type: 'secondary' });
      } else {
        parts.push({ seller_id: s1.id, allocation_percentage: pctOrNull(cell(first, map, 'seller_share')) ?? '100', participation_type: 'primary' });
        if (split === 'pool' && parts[0]!.allocation_percentage !== '100') { bad('POOL_NAO_SOMA_100', 'Com um só vendedor em pool a participação deve ser 100%.'); continue; }
      }
      const custRaw = cell(first, map, 'customer');
      let customerId: string | null = null;
      let newCustomer: string | null = null;
      if (custRaw) {
        customerId = custByDoc.get(custRaw.toLowerCase()) ?? custByName.get(dedupeKey(custRaw)) ?? null;
        if (!customerId) { if (a.options.createCustomers) newCustomer = custRaw; else { bad('CLIENTE_INEXISTENTE', `Cliente «${custRaw}» não cadastrado (marque «cadastrar clientes ausentes» ou importe os clientes antes).`); continue; } }
      }
      const items: unknown[] = [];
      let itemErr = false;
      for (const ix of idxs) {
        const r = rows[ix]!; const ln = rowNo(ix);
        const sku = cell(r, map, 'sku');
        const pid = sku ? R.products.get(sku.toLowerCase()) ?? null : null;
        if (sku && !pid) { err(ln, 'PRODUTO_INEXISTENTE', `SKU ${sku} não cadastrado.`); itemErr = true; continue; }
        const q = qtyOrNull(cell(r, map, 'quantity'));
        let unit: number | null = null; let disc: number | null = null; let comm: number | null = null; let cost: number | null = null;
        try { unit = moneyOrNull(cell(r, map, 'unit_price')); disc = moneyOrNull(cell(r, map, 'discount')); comm = moneyOrNull(cell(r, map, 'commissionable')); cost = moneyOrNull(cell(r, map, 'cost')); } catch { err(ln, 'VALOR_INVALIDO', 'Valor monetário inválido (use 1.234,56).'); itemErr = true; continue; }
        if (!q) { err(ln, 'QUANTIDADE_INVALIDA', 'Quantidade inválida.'); itemErr = true; continue; }
        if (unit === null || unit < 0) { err(ln, 'VALOR_INVALIDO', 'Preço unitário inválido ou negativo.'); itemErr = true; continue; }
        if ((disc ?? 0) < 0 || (comm ?? 0) < 0 || (cost ?? 0) < 0) { err(ln, 'VALOR_NEGATIVO', 'Desconto, base comissionável e custo não podem ser negativos.'); itemErr = true; continue; }
        items.push({ product_id: pid, description: cell(r, map, 'description') || null, quantity: q, unit_price_cents: unit, discount_cents: disc ?? 0, commissionable_amount_cents: comm, cost_cents: cost });
      }
      if (itemErr) continue;
      if (extRef) refsSeen.add(extRef.toLowerCase());
      tasks.push({
        rows: lines, label: `venda ${number}`,
        run: async () => {
          let cid = customerId;
          if (newCustomer) {
            const { data, error } = await ctx.supabase.rpc('cm_save_customer', { p_org: org, p_id: null, p_name: newCustomer, p_legal: null, p_doc: null, p_email: null, p_phone: null });
            if (error) return 'não foi possível cadastrar o cliente';
            cid = data as string; custByName.set(dedupeKey(newCustomer), cid);
          }
          const { data, error } = await ctx.supabase.rpc('cm_save_sale_draft', { p_org: org, p_id: null, p_header: { sale_number: number, external_reference: extRef || null, sale_date: date, channel: cell(first, map, 'channel') || null, customer_id: cid, split_model: split }, p_items: items, p_participants: parts });
          if (error) return error.message.length <= 200 && !/violat|constraint|permission denied/i.test(error.message) ? error.message : 'o banco recusou a venda';
          if (a.options.confirmSales) { const c = await ctx.supabase.rpc('cm_confirm_sale', { p_org: org, p_id: data as string }); if (c.error) return `rascunho criado, mas não confirmada: ${c.error.message.slice(0, 150)}`; }
          return null;
        },
      });
    }
  }

  const rejectedRows = new Set(errors.map((e) => e.row));
  const total = rows.length;
  const base: ImportReport = { ok: true, total, accepted: 0, rejected: rejectedRows.size, errors: errors.sort((x, y) => x.row - y.row), preview, sameFileBefore: 0, applied: false };
  if (!a.apply) {
    base.accepted = tasks.reduce((s, t) => s + t.rows.length, 0);
    return base;
  }
  if (errors.length > 0 && !a.options.partial) return { ...base, ok: false, fatal: 'Há linhas com erro e a importação parcial não foi autorizada: nada foi importado.' };

  const begin = await ctx.supabase.rpc('cm_import_begin', { p_org: org, p_file_name: a.fileName.slice(0, 200) || 'arquivo.csv', p_hash: hash, p_type: a.type, p_total: total });
  if (begin.error) return { ...base, ok: false, fatal: 'Não foi possível iniciar a importação.' };
  const job = begin.data as { job_id: string; same_file_before: number };
  let accepted = 0;
  for (const t of tasks) {
    const msg = await t.run();
    if (msg) t.rows.forEach((r) => errors.push({ row: r, code: 'RECUSADO', message: `${t.label}: ${msg}` }));
    else accepted += t.rows.length;
  }
  const finalRejected = new Set(errors.map((e) => e.row)).size;
  for (const part of chunk(errors.map((e) => ({ row: e.row, code: e.code, message: e.message })), 500)) await ctx.supabase.rpc('cm_import_errors', { p_org: org, p_job: job.job_id, p_errors: part });
  await ctx.supabase.rpc('cm_import_finish', { p_org: org, p_job: job.job_id, p_accepted: accepted, p_rejected: finalRejected, p_failed: accepted === 0 && total > 0 });
  return { ...base, accepted, rejected: finalRejected, errors: errors.sort((x, y) => x.row - y.row), sameFileBefore: job.same_file_before, applied: true };
}

export { autoMap };
