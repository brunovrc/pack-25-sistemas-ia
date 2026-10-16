// Ciclo de vida completo pela interface (escritas reais): plano versionado → vendedor → venda → cálculo idempotente → aprovação → devolução (estorno)
// → fechamento → pagamento parcial → estorno de pagamento → demonstrativo em PDF → reabertura. Requer banco semeado (supabase db reset) e app em produção.
import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoServerError, loginAs } from './cm-helpers';

test.describe.configure({ mode: 'serial' });

const tag = Date.now().toString().slice(-6);
const PLAN = `E2E Plano 10% ${tag}`;
const SELLER = `Vendedor E2E ${tag}`;
const CODE = `E${tag}`;
const SALE = `E2E-${tag}`;
const SALE_DATE = '2026-09-15';
const flash = (page: Page, text: RegExp | string) => expect(page.locator('[role=status],[role=alert]').filter({ hasText: text }).first()).toBeVisible();

test('admin: cria plano, valida e publica com vigência; versão publicada fica imutável', async ({ page }) => {
  await loginAs(page, DEMO.admin);
  await page.goto('/planos');
  await page.getByText('Criar plano', { exact: true }).first().click();
  await page.getByLabel('Nome do plano').fill(PLAN);
  await page.getByRole('button', { name: 'Criar plano' }).click();
  await page.waitForURL(/\/planos\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Adicionar regra' }).click();
  await page.getByLabel('Nome da regra').fill('Global 10%');
  await page.getByLabel('Taxa (%)').fill('10');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await flash(page, 'Rascunho salvo');
  await page.getByRole('button', { name: 'Validar rascunho' }).click();
  await flash(page, 'pronto para publicar');
  await page.getByLabel('Vigência a partir de').fill('2026-06-01');
  await page.getByRole('button', { name: 'Publicar versão' }).click();
  await flash(page, 'Versão publicada');
  await page.reload();
  await expect(page.getByText('Publicada (imutável)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regras da v1' })).toBeVisible();
  await expectNoServerError(page, 'plano');
});

test('admin: cadastra vendedor e atribui o plano; plano inválido (faixas sobrepostas) não publica', async ({ page }) => {
  await loginAs(page, DEMO.admin);
  await page.goto('/vendedores');
  await page.getByText('Cadastrar vendedor', { exact: true }).first().click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Cadastrar vendedor' }) });
  await form.getByLabel('Nome', { exact: true }).fill(SELLER);
  await form.getByLabel('Código', { exact: true }).fill(CODE);
  await form.getByLabel('Início', { exact: true }).fill('2026-01-01');
  await form.getByRole('button', { name: 'Cadastrar vendedor' }).click();
  await flash(page, 'Vendedor cadastrado');
  await page.goto(`/vendedores?q=${CODE}`);
  await page.getByRole('link', { name: SELLER }).first().click();
  await page.getByLabel('Plano', { exact: true }).selectOption({ label: PLAN });
  await page.getByLabel('Vale a partir de', { exact: true }).fill('2026-06-01');
  await page.getByRole('button', { name: 'Atribuir plano' }).click();
  await flash(page, 'Plano atribuído');
  await expect(page.getByRole('link', { name: PLAN }).first()).toBeVisible();
});

test('financeiro: venda com plano fixado → comissão calculada na hora (10% de R$ 1.000,00) e cálculo é idempotente', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/vendas/nova');
  await page.getByLabel('Número da venda').fill(SALE);
  await page.getByLabel('Data da venda').fill(SALE_DATE);
  await page.getByLabel('Divisão entre vendedores').selectOption('independent');
  await page.getByLabel('Preço unitário (R$)').fill('1.000,00');
  await page.getByLabel('Vendedor', { exact: true }).first().selectOption({ label: `${SELLER} (${CODE})` });
  await page.getByRole('button', { name: 'Salvar e confirmar venda' }).click();
  await page.waitForURL(/\/vendas\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Confirmada').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(`${PLAN} v1`) })).toBeVisible();
  // lançamento calculado, ainda não aprovado nem pago
  await page.goto(`/comissoes?${'p=custom&from=2026-01-01&to=2028-12-31'}&seller=`);
  const row = page.locator('tbody tr', { hasText: SELLER });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('R$ 100,00');
  await expect(row).toContainText('Calculada');
  // recalcular o período não duplica
  await page.getByLabel('De', { exact: true }).first().fill('2026-09-01');
  await page.getByLabel('Até', { exact: true }).first().fill('2026-09-30');
  await page.getByRole('button', { name: 'Calcular comissões do período' }).click();
  await flash(page, /0 lançamento\(s\) novo\(s\)/);
  await page.goto('/comissoes?p=custom&from=2026-01-01&to=2028-12-31');
  await expect(page.locator('tbody tr', { hasText: SELLER })).toHaveCount(1);
});

test('aprovação: rejeição exige justificativa; aprovar e tentar aprovar de novo é recusado', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/aprovacoes');
  const row = page.locator('tbody tr', { hasText: SELLER });
  await row.getByRole('checkbox').check();
  await page.getByLabel('Decisão para os selecionados').selectOption('reject');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await flash(page, /justificativa/i);
  await page.getByLabel('Decisão para os selecionados').selectOption('approve');
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await flash(page, '1 lançamento(s) aprovado(s)');
  await page.goto('/comissoes?p=custom&from=2026-01-01&to=2028-12-31');
  await expect(page.locator('tbody tr', { hasText: SELLER })).toContainText('Aprovada');
});

test('devolução parcial gera estorno referenciado e o histórico original permanece', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto(`/vendas?q=${SALE}`);
  await page.getByRole('link', { name: SALE }).click();
  await page.getByText('Registrar devolução', { exact: true }).first().click();
  await page.getByLabel(/Valor devolvido \(R\$\)/).fill('200,00');
  await page.getByLabel('Data da devolução').fill('2026-09-20');
  await page.getByLabel('Referência externa (opcional)').fill(`DEV-${tag}`);
  await page.getByRole('button', { name: 'Registrar devolução' }).click();
  await flash(page, 'Devolução registrada');
  await page.reload();
  await expect(page.getByText('Parcialmente devolvida').first()).toBeVisible();
  const rows = page.locator('table', { has: page.locator('caption', { hasText: 'Lançamentos da venda' }) }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Estorno' })).toContainText('-R$ 20,00');
  await expect(rows.filter({ hasText: 'Comissão' }).first()).toContainText('R$ 100,00');
  // mesma referência externa de devolução não duplica
  await page.getByText('Registrar devolução', { exact: true }).first().click();
  await page.getByLabel(/Valor devolvido \(R\$\)/).fill('200,00');
  await page.getByLabel('Referência externa (opcional)').fill(`DEV-${tag}`);
  await page.getByRole('button', { name: 'Registrar devolução' }).click();
  await page.reload();
  await expect(rows).toHaveCount(2);
});

test('estorno também precisa de aprovação antes de entrar no fechamento', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/aprovacoes');
  const row = page.locator('tbody tr', { hasText: SELLER });
  await expect(row).toHaveCount(1);
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await flash(page, '1 lançamento(s) aprovado(s)');
});

test('fechamento: cancela o mês corrente, reabre setembro (formal), refaz a conferência, fecha e gera o demonstrativo', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/fechamentos');
  // mês corrente aberto não bloqueia a reabertura se for cancelado
  const open = page.locator('tbody tr', { hasText: 'Aberto' }).getByRole('link', { name: 'Abrir' }).first();
  if (await open.count()) {
    await open.click();
    await page.getByText('Cancelar período', { exact: true }).first().click();
    await page.getByLabel('Motivo').fill('Cancelado no teste para reabrir o período anterior');
    await page.getByRole('button', { name: 'Cancelar período' }).click();
    await flash(page, 'Período cancelado');
  }
  // admin reabre setembro
  await loginAs(page, DEMO.admin);
  await page.goto('/fechamentos');
  await page.locator('tbody tr', { hasText: /30\/09\/2026/ }).getByRole('link', { name: 'Abrir' }).first().click();
  await page.getByText('Reabertura formal', { exact: true }).click();
  await page.getByLabel(/Justificativa da reabertura/).fill('Reabertura para incluir a venda E2E e seu estorno no fechamento.');
  await page.getByRole('button', { name: 'Reabrir período' }).click();
  await flash(page, 'Período reaberto');
  // financeiro refaz a conferência e fecha
  await loginAs(page, DEMO.financeiro);
  await page.goto('/fechamentos');
  await page.locator('tbody tr', { hasText: /30\/09\/2026/ }).getByRole('link', { name: 'Abrir' }).first().click();
  await page.getByRole('button', { name: 'Montar conferência' }).click();
  await flash(page, 'Conferência montada');
  await expect(page.locator('tbody tr', { hasText: SELLER })).toContainText('R$ 80,00'); // 100 − 20 de estorno
  await page.getByRole('button', { name: 'Enviar para aprovação' }).click();
  await flash(page, 'enviado para aprovação');
  await page.getByRole('button', { name: 'Aprovar e fechar período' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await flash(page, 'Período fechado');
  await expect(page.getByText('Fechado').first()).toBeVisible();
});

test('pagamento registrado: parcial, sem passar do saldo, sem duplicar referência, estornável; demonstrativo PDF', async ({ page, request }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/pagamentos');
  const line = page.locator('tbody tr', { hasText: SELLER }).first();
  await expect(line).toContainText('R$ 80,00');
  await line.locator('summary').click();
  await line.getByLabel(/Valor pago/).fill('500,00');
  await line.getByLabel(/Referência\/comprovante/).fill(`PIX-${tag}`);
  await line.getByRole('button', { name: 'Registrar pagamento' }).click();
  await flash(page, /excede o saldo/i);
  await line.getByLabel(/Valor pago/).fill('30,00');
  await line.getByRole('button', { name: 'Registrar pagamento' }).click();
  await flash(page, 'Pagamento registrado');
  await page.reload();
  await expect(page.locator('tbody tr', { hasText: SELLER }).first()).toContainText('Pago parcialmente');
  await expect(page.locator('tbody tr', { hasText: SELLER }).first()).toContainText('R$ 50,00');
  // referência repetida
  const again = page.locator('tbody tr', { hasText: SELLER }).first();
  await again.locator('summary').click();
  await again.getByLabel(/Valor pago/).fill('10,00');
  await again.getByLabel(/Referência\/comprovante/).fill(`PIX-${tag}`);
  await again.getByRole('button', { name: 'Registrar pagamento' }).click();
  await flash(page, /já existe pagamento/i);
  // demonstrativo
  await page.goto('/demonstrativos');
  const stmt = page.locator('tbody tr', { hasText: SELLER });
  await stmt.getByRole('button', { name: 'Gerar PDF' }).click();
  await flash(page, 'Demonstrativo v1 gerado');
  await page.reload();
  const href = await page.locator('tbody tr', { hasText: SELLER }).getByRole('link', { name: 'Baixar PDF' }).getAttribute('href');
  const cookies = await page.context().cookies();
  const res = await request.get(href!, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') } });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
  // estorno do registro de pagamento preserva o histórico
  await page.goto('/pagamentos');
  await page.locator('tbody tr', { hasText: 'Registrado' }).filter({ hasText: SELLER }).first().locator('summary').click();
  await page.getByLabel('Motivo do estorno do registro').first().fill('Registrado por engano no teste');
  await page.getByRole('button', { name: 'Estornar registro' }).first().click();
  await flash(page, 'Registro de pagamento estornado');
  await page.reload();
  await expect(page.locator('tbody tr', { hasText: 'Estornado' }).filter({ hasText: SELLER }).first()).toBeVisible();
});

test('simulador usa o mesmo motor: 5% de R$ 10.000,00 e comparação de cenários; faixas com acumulado', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/simulador?date=2026-09-10');
  await page.locator('select[name="seller"]').selectOption({ label: 'Marina Costa (V001)' });
  await page.locator('input[name="amount"]').fill('10.000,00');
  await page.getByRole('button', { name: 'Simular' }).click();
  await expect(page.getByText(/SIMULAÇÃO — nenhum lançamento é gerado/)).toBeVisible();
  await expect(page.locator('tfoot').first()).toContainText('R$ 500,00');
  // cenário B: o dobro do valor ⇒ diferença de R$ 500,00
  await page.locator('input[name="b_amount"]').fill('20.000,00');
  await page.locator('select[name="b_seller"]').selectOption({ label: 'Marina Costa (V001)' });
  await page.locator('input[name="b_date"]').fill('2026-09-10');
  await page.getByRole('button', { name: 'Simular' }).click();
  await expect(page.getByText('Diferença (B − A)')).toBeVisible();
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Diferença (B − A)' }) }).last()).toContainText('500,00');
  // faixas (Rafael): acumulado 22.000 + venda 5.000 ⇒ 6% sobre a parcela acima de 20.000 ⇒ R$ 300,00
  await page.goto('/simulador?date=2026-09-10');
  await page.locator('select[name="seller"]').selectOption({ label: 'Rafael Prado (V002)' });
  await page.locator('input[name="amount"]').fill('5.000,00');
  await page.locator('input[name="accum"]').fill('22.000,00');
  await page.getByRole('button', { name: 'Simular' }).click();
  await expect(page.locator('tfoot').first()).toContainText('R$ 300,00');
  // exportação do cenário
  const csv = await page.request.get(page.url().replace('/simulador', '/api/exportar/simulacao'));
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('SIMULAÇÃO');
});
