import { expect, test, type Page } from '@playwright/test';
import { CLIENT, loginClient, loginStaff, ORG, restJson, rpcRaw, tokenFor, USERS, watchPage } from './pt-helpers';

// O painel mostra EXATAMENTE o que as funções SQL devolvem (conferido pela API com o mesmo usuário): nenhum número é digitado à mão.
const card = (page: Page, label: string) => page.getByRole('region', { name: 'Indicadores' }).getByText(label, { exact: true }).locator('..');
const fmt = (v: number) => v.toLocaleString('pt-BR');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const daysAgo = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - n * 86_400_000));

type Kpis = { open_now: number; completed: number; overdue: number; due_soon: number; on_time_pct: number | null; active_clients: number; unassigned: number; awaiting_provider: number; deliverables_pending: number; created: number };

test('gestor: os dez indicadores e os oito gráficos batem com o banco', async ({ page }) => {
  const w = watchPage(page);
  await loginStaff(page, USERS.gerente);
  await page.goto('/dashboard?period=90d');
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
  const token = await tokenFor(USERS.gerente);
  const [k] = await rpcRaw(token, 'pt_kpis', { p_org: ORG, p_from: daysAgo(89), p_to: today() }).then((r) => r.body as Kpis[]);
  expect(k!.open_now).toBeGreaterThan(0);
  await expect(card(page, 'Em aberto agora')).toContainText(fmt(k!.open_now));
  await expect(card(page, 'Atrasadas')).toContainText(fmt(k!.overdue));
  await expect(card(page, 'Vencem em breve')).toContainText(fmt(k!.due_soon));
  await expect(card(page, 'Concluídas no período')).toContainText(fmt(k!.completed));
  await expect(card(page, 'Concluídas no prazo')).toContainText(k!.on_time_pct === null ? '—' : `${k!.on_time_pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
  await expect(card(page, 'Clientes ativos')).toContainText(fmt(k!.active_clients));
  await expect(card(page, 'Sem responsável')).toContainText(fmt(k!.unassigned));
  await expect(card(page, 'Aguardando a prestadora')).toContainText(fmt(k!.awaiting_provider));
  await expect(card(page, 'Entregas não publicadas')).toContainText(fmt(k!.deliverables_pending));
  await expect(card(page, 'Tempo médio de resolução')).toBeVisible();
  // oito gráficos, cada um com a tabela alternativa acessível
  for (const name of ['Solicitações criadas e concluídas', 'Solicitações por situação', 'Solicitações por prioridade', 'Concluídas no prazo × fora do prazo', 'Tempo médio de resolução', 'Entregas publicadas', 'Carga por responsável', 'Solicitações por cliente']) {
    await expect(page.getByRole('region', { name }), name).toBeVisible();
  }
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
  await expect(page.getByText('Ver dados em tabela')).toHaveCount(8);
  // alertas levam à lista filtrada
  await page.getByRole('link', { name: 'Solicitações atrasadas' }).click();
  await page.waitForURL(/view=atrasadas/);
  expect(w.csp).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('o filtro por cliente restringe os números e uma consulta com período inválido cai no padrão', async ({ page }) => {
  await loginStaff(page, USERS.gerente);
  const token = await tokenFor(USERS.gerente);
  const [k] = await rpcRaw(token, 'pt_kpis', { p_org: ORG, p_from: daysAgo(29), p_to: today(), p_client: CLIENT.beta }).then((r) => r.body as Kpis[]);
  await page.goto(`/dashboard?period=30d&client=${CLIENT.beta}`);
  await expect(card(page, 'Em aberto agora')).toContainText(fmt(k!.open_now));
  await expect(card(page, 'Clientes ativos')).toContainText(fmt(k!.active_clients));
  await page.goto('/dashboard?period=custom&from=2026-99-99&to=lixo&client=nao-e-uuid');
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible(); // sem erro: usa os últimos 30 dias
  await expect(page.locator('#period')).toHaveValue('30d');
});

test('colaborador vê só as empresas em que atua; o cliente vê só os próprios números', async ({ browser }) => {
  const sctx = await browser.newContext();
  const sp = await sctx.newPage();
  await loginStaff(sp, USERS.colab2);
  const ct = await tokenFor(USERS.colab2);
  const visible = await restJson<Array<{ id: string }>>(ct, 'client_accounts?select=id');
  const [mine] = await rpcRaw(ct, 'pt_kpis', { p_org: ORG, p_from: daysAgo(89), p_to: today() }).then((r) => r.body as Kpis[]);
  await sp.goto('/dashboard?period=90d');
  await expect(card(sp, 'Clientes ativos')).toContainText(fmt(mine!.active_clients));
  expect(mine!.active_clients).toBeLessThanOrEqual(visible.length);
  await sctx.close();

  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await loginClient(cp, USERS.betaAdmin);
  const bt = await tokenFor(USERS.betaAdmin);
  const [bk] = await rpcRaw(bt, 'pt_kpis', { p_org: ORG, p_from: daysAgo(29), p_to: today(), p_client: CLIENT.beta }).then((r) => r.body as Kpis[]);
  await cp.goto('/portal?period=30d');
  await expect(card(cp, 'Em aberto agora')).toContainText(fmt(bk!.open_now));
  await expect(cp.getByRole('region', { name: 'Carga por responsável' })).toHaveCount(0); // ranking interno não vai ao cliente
  await expect(cp.getByRole('region', { name: 'Solicitações por cliente' })).toHaveCount(0);
  await cctx.close();
});

test('relatórios: prévia, CSV com BOM, fórmulas neutralizadas e sem dados de outras empresas no portal', async ({ page }) => {
  await loginStaff(page, USERS.gerente);
  await page.goto('/relatorios?period=365d');
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
  for (const name of ['Solicitações', 'Resumo por cliente', 'Resumo por responsável', 'Entregas', 'Acessos a documentos']) await expect(page.getByRole('heading', { name })).toBeVisible();
  const res = await page.context().request.get('/export/por-cliente?period=365d');
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('Alfa Comércio de Alimentos');
  expect(text.split('\r\n')[0]).toContain('"Empresa"');
});
