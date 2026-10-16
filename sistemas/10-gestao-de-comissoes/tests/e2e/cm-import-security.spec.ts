// Importação CSV (mapeamento, prévia, duplicidade, erros) e segurança por perfil: exportação sem injeção de fórmula, acesso direto à API REST e a RPCs.
import { expect, test, type Page } from '@playwright/test';
import { ANON_KEY, SUPABASE_URL } from './helpers';
import { DEMO, DEMO_PASSWORD, WIDE, loginAs } from './cm-helpers';

test.describe.configure({ mode: 'serial' });

const tag = Date.now().toString().slice(-6);
const SALE = `IMP-${tag}`;
const csv = [
  'numero;referencia;data;cliente;vendedor;sku;quantidade;preco;desconto',
  `${SALE};ERP-${SALE};10/09/2026;=2+2;V001;NS-100;2;1.500,00;100,00`,
  'V-2001;ERP-V-2001;06/07/2026;Mercado Central Ltda;V001;NS-100;1;800,00;0',
  `IMP-X${tag};;12/09/2026;;V999;NS-100;1;100,00;0`,
].join('\n');

async function token(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) });
  return ((await res.json()) as { access_token: string }).access_token;
}
const cookieHeader = async (page: Page) => (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');

test('importação de vendas: prévia, linhas rejeitadas com motivo, duplicidade nunca silenciosa e reimportação sem duplicar', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/importacoes');
  await page.getByLabel('O que importar').selectOption('sales');
  await page.locator('#imp-file').setInputFiles({ name: 'vendas.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(page.getByRole('heading', { name: 'Mapeamento de colunas' })).toBeVisible();
  await page.getByLabel(/Cadastrar clientes ausentes/).check();
  await page.getByLabel(/Importar as linhas válidas/).check();
  await page.getByRole('button', { name: '1. Validar e ver prévia' }).click();
  await expect(page.getByText(/Prévia da validação: 3 linha\(s\) · 1 válida\(s\) · 2 rejeitada\(s\)/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'DUPLICADO' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'VENDEDOR_INEXISTENTE' })).toBeVisible();
  await page.getByRole('button', { name: '2. Confirmar importação' }).click();
  await expect(page.getByText(/Importação concluída: 3 linha\(s\) · 1 aceita\(s\) · 2 rejeitada\(s\)/)).toBeVisible();
  // a venda entrou como rascunho (nada de comissão aprovada ou calculada)
  await page.goto(`/vendas?q=${SALE}`);
  const row = page.locator('tbody tr', { hasText: SALE });
  await expect(row).toContainText('Rascunho');
  // reimportar o mesmo arquivo: tudo duplicado, nada novo
  await page.goto('/importacoes');
  await page.getByLabel('O que importar').selectOption('sales');
  await page.locator('#imp-file').setInputFiles({ name: 'vendas.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.getByLabel(/Cadastrar clientes ausentes/).check();
  await page.getByRole('button', { name: '1. Validar e ver prévia' }).click();
  await expect(page.getByText(/0 válida\(s\) · 3 rejeitada\(s\)/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'DUPLICADO' }).first()).toBeVisible();
  // arquivo malicioso/binário é recusado
  await page.goto('/importacoes');
  await page.locator('#imp-file').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01]) });
  await expect(page.getByText(/não parece ser um CSV/)).toBeVisible();
});

test('exportação CSV: separador e BOM brasileiros, fórmula neutralizada, auditada; vendedor exporta só o que enxerga', async ({ page, request }) => {
  await loginAs(page, DEMO.financeiro);
  const hdr = { cookie: await cookieHeader(page) };
  const res = await request.get(`/api/exportar/relatorio?r=vendas_periodo&${WIDE}&fmt=csv`, { headers: hdr });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body.split('\r\n')[0]).toContain(';');
  expect(body).toContain("'=2+2"); // célula que parece fórmula vira texto
  expect(body).not.toMatch(/(^|;)=2\+2/m);
  const pdf = await request.get(`/api/exportar/relatorio?r=comissoes_vendedor&${WIDE}&fmt=pdf`, { headers: hdr });
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  // vendedor: o relatório traz só ele mesmo
  await loginAs(page, DEMO.vend1);
  const mine = await request.get(`/api/exportar/relatorio?r=comissoes_vendedor&${WIDE}&fmt=csv`, { headers: { cookie: await cookieHeader(page) } });
  const text = await mine.text();
  expect(text).toContain('Marina Costa');
  expect(text).not.toContain('Rafael Prado');
  expect(text).not.toContain('Bernardo Lopes');
  // exportação ficou na auditoria (sem valores)
  await loginAs(page, DEMO.admin);
  await page.goto('/audit');
  await expect(page.getByText('export').first()).toBeVisible();
});

test('API direta: perfis sem permissão são barrados pelo banco (RLS e funções), não só pela tela', async () => {
  const seller = await token(DEMO.vend1);
  const fin = await token(DEMO.financeiro);
  const h = (tk: string) => ({ apikey: ANON_KEY, authorization: `Bearer ${tk}`, 'content-type': 'application/json' });
  const org = ((await (await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id`, { headers: h(fin) })).json()) as Array<{ id: string }>)[0]!.id;
  // vendedor não escreve em lançamentos nem em planos
  expect((await fetch(`${SUPABASE_URL}/rest/v1/commission_entries`, { method: 'POST', headers: h(seller), body: JSON.stringify({ organization_id: org }) })).status).toBeGreaterThanOrEqual(401);
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/commission_rules?id=not.is.null`, { method: 'PATCH', headers: h(seller), body: JSON.stringify({ rate_decimal: 0.9 }) });
  expect(upd.status).toBeGreaterThanOrEqual(401);
  // vendedor não aprova nem registra pagamento
  const ents = (await (await fetch(`${SUPABASE_URL}/rest/v1/commission_entries?select=id&limit=1`, { headers: h(seller) })).json()) as Array<{ id: string }>;
  const ap = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cm_review_entries`, { method: 'POST', headers: h(seller), body: JSON.stringify({ p_org: org, p_ids: [ents[0]!.id], p_decision: 'approve', p_justification: null }) });
  expect(ap.status).toBeGreaterThanOrEqual(400);
  expect(await ap.text()).toContain('sem permissão');
  const pay = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cm_record_payout`, { method: 'POST', headers: h(seller), body: JSON.stringify({ p_org: org, p_seller: '00000000-0000-4000-8000-000000000001', p_date: '2026-09-01', p_method: 'pix', p_ref: 'x', p_notes: null, p_alloc: [] }) });
  expect(pay.status).toBeGreaterThanOrEqual(400);
  // financeiro não reabre período (somente administrador)
  const per = ((await (await fetch(`${SUPABASE_URL}/rest/v1/commission_periods?select=id&status=eq.closed&limit=1`, { headers: h(fin) })).json()) as Array<{ id: string }>)[0];
  if (per) {
    const re = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cm_reopen_period`, { method: 'POST', headers: h(fin), body: JSON.stringify({ p_org: org, p_period: per.id, p_reason: 'tentativa indevida de reabertura pelo financeiro' }) });
    expect(re.status).toBeGreaterThanOrEqual(400);
  }
  // sem token nenhum: nada
  expect((await fetch(`${SUPABASE_URL}/rest/v1/commission_entries?select=id`, { headers: { apikey: ANON_KEY } })).status).toBeGreaterThanOrEqual(401);
  // vendedor lê apenas os próprios lançamentos pela API
  const all = (await (await fetch(`${SUPABASE_URL}/rest/v1/commission_entries?select=seller_id`, { headers: h(seller) })).json()) as Array<{ seller_id: string }>;
  expect(new Set(all.map((e) => e.seller_id)).size).toBe(1);
});

test('demonstrativo: id adulterado e demonstrativo de outro vendedor respondem 404', async ({ page, request }) => {
  await loginAs(page, DEMO.financeiro);
  const fin = await token(DEMO.financeiro);
  const st = (await (await fetch(`${SUPABASE_URL}/rest/v1/commission_closings?select=id,seller_id&status=eq.closed&limit=50`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${fin}` } })).json()) as Array<{ id: string; seller_id: string }>;
  const mineRows = (await (await fetch(`${SUPABASE_URL}/rest/v1/commission_closings?select=id`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${await token(DEMO.vend3)}` } })).json()) as Array<{ id: string }>;
  const mine = new Set(mineRows.map((r) => r.id));
  const foreign = st.find((c) => !mine.has(c.id))!;
  await loginAs(page, DEMO.vend3);
  const r = await request.get(`/api/demonstrativos/${foreign.id}?fmt=csv`, { headers: { cookie: await cookieHeader(page) } });
  expect(r.status()).toBe(404);
  const r2 = await request.get('/api/demonstrativos/não-é-um-uuid', { headers: { cookie: await cookieHeader(page) } });
  expect(r2.status()).toBe(404);
  expect((await page.goto(`/demonstrativos/${foreign.id}`))?.status()).toBe(404);
});
