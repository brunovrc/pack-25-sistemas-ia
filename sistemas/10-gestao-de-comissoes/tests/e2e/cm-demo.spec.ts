// Dados de demonstração (NovaSales): telas por perfil com números reais do banco, escopo de cada perfil e isolamento por URL.
import { expect, test } from '@playwright/test';
import { ANON_KEY, SUPABASE_URL } from './helpers';
import { DEMO, DEMO_PASSWORD, WIDE, brl, expectNoServerError, loginAs, norm } from './cm-helpers';

test.describe.configure({ mode: 'serial' });

async function token(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) });
  return ((await res.json()) as { access_token: string }).access_token;
}
async function rest<T>(tk: string, path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${tk}` } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

test('financeiro: todas as telas abrem e o painel bate com o banco', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  const routes = ['/dashboard', '/vendedores', '/equipes', '/clientes', '/produtos', '/vendas', '/recebimentos', '/importacoes', '/planos', '/regras', '/simulador', '/metas', '/comissoes', '/aprovacoes', '/contestacoes', '/fechamentos', '/pagamentos', '/demonstrativos', '/relatorios', '/notificacoes'];
  for (const r of routes) {
    const res = await page.goto(r);
    expect(res?.status(), r).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 }).first(), r).toBeVisible();
    await expectNoServerError(page, r);
  }
  // painel × REST independente
  const tk = await token(DEMO.financeiro);
  const entries = await rest<Array<{ amount_cents: number; approval_status: string; entry_type: string }>>(tk, 'commission_entries?select=amount_cents,approval_status,entry_type&limit=1000');
  const calc = entries.filter((e) => e.approval_status !== 'rejected').reduce((a, e) => a + e.amount_cents, 0);
  const approved = entries.filter((e) => ['approved', 'adjusted'].includes(e.approval_status)).reduce((a, e) => a + e.amount_cents, 0);
  const pending = entries.filter((e) => ['calculated', 'pending_review', 'contested'].includes(e.approval_status)).reduce((a, e) => a + e.amount_cents, 0);
  await page.goto(`/dashboard?${WIDE}`);
  const kpi = async (label: string) => norm(await page.locator('section', { has: page.locator('p', { hasText: new RegExp(`^${label}$`) }) }).locator('p.text-2xl').first().innerText());
  expect(await kpi('Comissões calculadas')).toBe(brl(calc / 100));
  expect(await kpi('Comissões aprovadas')).toBe(brl(approved / 100));
  expect(await kpi('Comissões pendentes')).toBe(brl(pending / 100));
  await expect(page.getByText('sem filtro')).toHaveCount(0);
});

test('gerenciamento: gestor vê só a equipe que gere (e quem ainda não tem equipe)', async ({ page }) => {
  await loginAs(page, DEMO.gestor);
  await page.goto('/vendedores');
  await expect(page.getByRole('link', { name: 'Marina Costa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rafael Prado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aline Moura' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Juliana Freitas' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Bernardo Lopes' })).toHaveCount(0);
  // extrato: só lançamentos da equipe Norte
  await page.goto(`/comissoes?${WIDE}`);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Juliana Freitas' })).toHaveCount(0);
  // não acessa cadastros de planos nem configurações
  expect((await page.goto('/configuracoes'))?.status()).toBe(404);
  await expect(page.getByRole('button', { name: 'Criar plano' })).toHaveCount(0);
});

test('vendedor: enxerga somente o próprio extrato; colega e plano alheio não existem para ele', async ({ page }) => {
  await loginAs(page, DEMO.vend2);
  await expect(page.getByRole('heading', { name: 'Meu painel de comissões' })).toBeVisible();
  await page.goto(`/comissoes?${WIDE}`);
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const names = await rows.locator('td:nth-child(2)').allInnerTexts();
  expect(names.every((n) => n.trim() === 'Rafael Prado')).toBe(true);
  // lançamentos de outro vendedor: pelo id, 404
  const fin = await token(DEMO.financeiro);
  const others = await rest<Array<{ id: string; seller_id: string }>>(fin, 'commission_entries?select=id,seller_id&limit=1000');
  const mine = await rest<Array<{ id: string }>>(await token(DEMO.vend2), 'commission_entries?select=id&limit=1000');
  const mineIds = new Set(mine.map((m) => m.id));
  const foreign = others.find((o) => !mineIds.has(o.id))!;
  expect((await page.goto(`/comissoes/${foreign.id}`))?.status()).toBe(404);
  for (const r of ['/vendedores', '/equipes', '/aprovacoes', '/importacoes', '/simulador', '/configuracoes', '/regras']) expect((await page.goto(r))?.status(), r).toBe(404);
  // memória de cálculo do próprio lançamento é visível
  await page.goto(`/comissoes/${mine[0]!.id}`);
  await expect(page.getByRole('heading', { name: 'Memória de cálculo' })).toBeVisible();
  await expect(page.getByText('Arredondamento:')).toBeVisible();
});

test('consulta: só agregados da empresa, nunca remuneração individual', async ({ page }) => {
  await loginAs(page, DEMO.consulta);
  await expect(page.getByText('Remuneração individual não é exibida')).toBeVisible();
  await expect(page.getByText('Comissões calculadas').first()).toBeVisible();
  for (const r of ['/comissoes', '/vendedores', '/vendas', '/fechamentos', '/pagamentos']) expect((await page.goto(r))?.status(), r).toBe(404);
  await page.goto(`/relatorios?${WIDE}`);
  await expect(page.getByRole('heading', { name: 'Resumo agregado da empresa' })).toBeVisible();
  await expect(page.getByText('Marina Costa')).toHaveCount(0);
});

test('anônimo e rotas de exportação protegidas', async ({ browser, request }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('/comissoes');
  await expect(p).toHaveURL(/\/login/);
  await ctx.close();
  for (const u of ['/api/exportar/relatorio?r=vendas_periodo', '/api/demonstrativos/00000000-0000-4000-8000-000000000000', '/api/exportar/simulacao']) {
    const r = await request.get(u, { maxRedirects: 0 });
    expect([307, 308, 401, 403]).toContain(r.status());
  }
});
