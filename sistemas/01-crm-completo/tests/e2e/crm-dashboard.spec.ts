import { expect, test } from '@playwright/test';
import { uiLogin } from './helpers';
import { lookupId, restJson, setupOwner, stageId, watchCsp, type Owner } from './crm-helpers';

// Indicadores do painel com dados de valor conhecido (cálculo feito à mão):
//   ganhas 1000,10 + 2000,20 + 500,05 = 3.500,35 (3 negócios) · perdida 300,00 · aberta 1.500,00
//   conversão = 3 / (3 + 1) = 75,00% · ticket médio = 3.500,35 / 3 = 1.166,78 · meta 5.000,00 -> 70,01%
test.describe.configure({ mode: 'serial' });

let owner: Owner;

test.beforeAll(async ({ browser }) => {
  owner = await setupOwner(browser, 'dash');
  const { token, orgId, userId } = owner;
  const [ganho, perdido, proposta, preco, site, indicacao] = await Promise.all([
    stageId(token, orgId, 'Ganho'), stageId(token, orgId, 'Perdido'), stageId(token, orgId, 'Proposta'),
    lookupId(token, 'crm_loss_reasons', orgId, 'Preço'), lookupId(token, 'crm_lead_sources', orgId, 'Site'), lookupId(token, 'crm_lead_sources', orgId, 'Indicação'),
  ]);
  const base = { organization_id: orgId, owner_id: userId };
  await restJson(token, 'crm_opportunities', {
    method: 'POST',
    body: JSON.stringify([
      { ...base, title: 'Ganha A', loss_reason_id: null, value: 1000.1, stage_id: ganho },
      { ...base, title: 'Ganha B', loss_reason_id: null, value: 2000.2, stage_id: ganho },
      { ...base, title: 'Ganha C', loss_reason_id: null, value: 500.05, stage_id: ganho },
      { ...base, title: 'Perdida D', value: 300, stage_id: perdido, loss_reason_id: preco },
      { ...base, title: 'Aberta E', loss_reason_id: null, value: 1500, stage_id: proposta },
    ]),
  });
  await restJson(token, 'crm_leads', {
    method: 'POST',
    body: JSON.stringify([
      { ...base, name: 'Lead Site', status: 'new', source_id: site },
      { ...base, name: 'Lead Indicação', status: 'qualified', source_id: indicacao },
      { ...base, name: 'Lead Desqualificado', status: 'unqualified', source_id: site },
    ]),
  });
  const today = new Date().toISOString().slice(0, 7);
  await restJson(token, 'crm_goals', {
    method: 'POST',
    body: JSON.stringify({ organization_id: orgId, scope: 'user', user_id: userId, period_start: `${today}-01`, period_end: `${today}-28`, target_amount: 5000 }),
  });
});
test.afterAll(async () => {
  await owner?.ctx.close();
});

const card = (page: import('@playwright/test').Page, label: string) => page.getByText(label, { exact: true }).locator('..');

test('os seis indicadores batem com o cálculo feito à mão', async () => {
  const { page } = owner;
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
  await expect(card(page, 'Pipeline ativo')).toContainText('R$ 1.500,00');
  await expect(card(page, 'Pipeline ativo')).toContainText('1 oportunidade(s) aberta(s)');
  await expect(card(page, 'Vendas ganhas')).toContainText('R$ 3.500,35');
  await expect(card(page, 'Vendas ganhas')).toContainText('3 negócio(s) ganho(s)');
  await expect(card(page, 'Taxa de conversão')).toContainText('75,00%');
  await expect(card(page, 'Taxa de conversão')).toContainText('3 ganho(s) ÷ (3 ganho(s) + 1 perdido(s))');
  await expect(card(page, 'Leads ativos')).toContainText('2'); // o desqualificado não conta
  await expect(card(page, 'Ticket médio')).toContainText('R$ 1.166,78');
  await expect(card(page, 'Metas no período')).toContainText('70,01%');
  await expect(card(page, 'Metas no período')).toContainText('R$ 3.500,35 de R$ 5.000,00');
});

test('seis gráficos renderizam com tabela alternativa e dados reais', async () => {
  const { page } = owner;
  const violations = watchCsp(page);
  await page.goto('/dashboard');
  for (const title of ['Evolução de vendas', 'Funil comercial', 'Desempenho por vendedor', 'Origem dos leads', 'Ganhos × perdidos', 'Metas × realizado']) {
    await expect(page.getByRole('region', { name: title })).toBeVisible();
  }
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(5);

  const sales = page.getByRole('region', { name: 'Evolução de vendas' });
  await sales.getByText('Ver dados em tabela').click();
  await expect(sales.getByRole('table')).toContainText('R$ 3.500,35');
  const funnel = page.getByRole('region', { name: 'Funil comercial' });
  await funnel.getByText('Ver dados em tabela').click();
  await expect(funnel.getByRole('row', { name: /Proposta/ })).toContainText('R$ 1.500,00');
  const sources = page.getByRole('region', { name: 'Origem dos leads' });
  await sources.getByText('Ver dados em tabela').click();
  await expect(sources.getByRole('row', { name: /Site/ })).toContainText('2');
  await expect(sources.getByRole('row', { name: /Indicação/ })).toContainText('1');
  const wl = page.getByRole('region', { name: 'Ganhos × perdidos' });
  await wl.getByText('Ver dados em tabela').click();
  await expect(wl.getByRole('table')).toContainText('3');
  expect(violations).toEqual([]);
});

test('período sem dados mostra "sem dados", não zero fingindo resultado; pipeline é instantâneo', async () => {
  const { page } = owner;
  await page.goto('/dashboard');
  await page.getByLabel('Período', { exact: true }).selectOption('custom');
  await page.getByLabel('De', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Até', { exact: true }).fill('2020-01-31');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.waitForURL(/period=custom/);
  await expect(card(page, 'Taxa de conversão')).toContainText('—');
  await expect(card(page, 'Taxa de conversão')).toContainText('Sem negócios encerrados no período');
  await expect(card(page, 'Ticket médio')).toContainText('—');
  await expect(card(page, 'Vendas ganhas')).toContainText('R$ 0,00');
  await expect(card(page, 'Pipeline ativo')).toContainText('R$ 1.500,00'); // situação atual
  await expect(page.getByRole('region', { name: 'Evolução de vendas' })).toContainText('Sem dados no período selecionado');
});

test('filtros inválidos na URL caem no padrão sem quebrar a página', async () => {
  const { page } = owner;
  for (const qs of ['period=custom&from=lixo&to=2020-99-99', 'period=xyz', 'owner=1%27%20or%201=1--&team=x&source=y', 'period=custom&from=2026-09-30&to=2026-09-01']) {
    const res = await page.goto(`/dashboard?${qs}`);
    expect(res!.status(), qs).toBe(200);
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
    await expect(page.getByText('Não foi possível carregar os indicadores')).toHaveCount(0);
    await expect(card(page, 'Vendas ganhas')).toContainText('R$ 3.500,35'); // padrão de 30 dias
  }
});

test('filtro por origem restringe os números', async () => {
  const { page } = owner;
  await page.goto('/dashboard');
  await page.getByLabel('Origem').selectOption({ label: 'Indicação' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.waitForURL(/source=/);
  await expect(card(page, 'Vendas ganhas')).toContainText('R$ 0,00'); // as oportunidades fixas não têm origem
  await expect(card(page, 'Leads ativos')).toContainText('1');
});

test('relatórios: perdas por motivo e exportação dos relatórios em CSV', async () => {
  const { page } = owner;
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
  const lost = page.getByRole('table', { name: 'Perdas por motivo' });
  await expect(lost.getByRole('row', { name: /Preço/ })).toContainText('R$ 300,00');
  const rep = page.getByRole('table', { name: 'Vendas por vendedor' });
  await expect(rep.getByRole('row').nth(1)).toContainText('R$ 3.500,35');

  const csv = await (await page.request.get('/export/lost-reasons?period=30d')).text();
  expect(csv).toContain('"Motivo";"Negócios perdidos";"Valor perdido (R$)"');
  expect(csv).toContain('"Preço";1;300,00');
  const funnel = await (await page.request.get('/export/funnel')).text();
  expect(funnel).toContain('"Proposta";1;1500,00');
  const reps = await (await page.request.get('/export/sales-by-rep?period=30d')).text();
  expect(reps).toContain('3500,35');
  expect(reps).toContain('75,00'); // conversão
});

test('dados de demonstração: gerente vê tudo e vendedor só o que é dele', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await uiLogin(page, 'gerente@demo.exemplo', 'DemoLocal#2026');
  await page.waitForURL('**/dashboard');
  await expect(card(page, 'Pipeline ativo')).toContainText('R$');
  await expect(card(page, 'Pipeline ativo')).not.toContainText('R$ 0,00');
  await expect(page.getByRole('table', { name: 'Ranking de vendedores' })).toContainText('Camila Vendas');
  await expect(page.getByRole('table', { name: 'Ranking de vendedores' })).toContainText('Diego Vendas');
  // filtro por vendedor: só a Camila aparece no ranking
  await page.getByLabel('Vendedor', { exact: true }).selectOption({ label: 'Camila Vendas' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.waitForURL(/owner=/);
  const ranking = page.getByRole('table', { name: 'Ranking de vendedores' });
  await expect(ranking).toContainText('Camila Vendas');
  await expect(ranking).not.toContainText('Diego Vendas');
  await page.goto('/leads');
  await expect(page.getByText(/40 registro\(s\)/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configurações do CRM' })).toHaveCount(0); // gerente não configura

  const seller = await browser.newContext();
  const sp = await seller.newPage();
  await uiLogin(sp, 'vendedor1@demo.exemplo', 'DemoLocal#2026');
  await sp.waitForURL('**/dashboard');
  await sp.goto('/leads');
  await expect(sp.getByText(/20 registro\(s\)/)).toBeVisible();
  await expect(sp.getByRole('table', { name: 'Ranking de vendedores' })).toHaveCount(0);
  await ctx.close();
  await seller.close();
});
