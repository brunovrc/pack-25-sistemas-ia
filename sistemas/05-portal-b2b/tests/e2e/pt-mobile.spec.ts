import { expect, test } from '@playwright/test';
import { expectNoOverflow, loginClient, loginStaff, USERS } from './pt-helpers';

// Celular (390 px): nenhuma tela pode ter rolagem horizontal da PÁGINA (tabelas rolam dentro do próprio contêiner) e o menu precisa abrir.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('portal do cliente no celular: menu, telas principais e envio de solicitação', async ({ page }) => {
  await loginClient(page, USERS.alfaAdmin);
  await page.getByText('Menu', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Documentos' })).toBeVisible();
  for (const path of ['/portal', '/portal/solicitacoes', '/portal/solicitacoes/nova', '/portal/entregas', '/portal/documentos', '/portal/comunicados', '/portal/equipe', '/portal/notificacoes']) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expectNoOverflow(page);
  }
});

test('painel da equipe no celular: sem rolagem horizontal da página', async ({ page }) => {
  await loginStaff(page, USERS.gerente);
  for (const path of ['/dashboard', '/clientes', '/solicitacoes', '/entregas', '/documentos', '/comunicados', '/relatorios', '/notificacoes']) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expectNoOverflow(page);
  }
  await page.goto('/solicitacoes');
  await page.getByRole('link', { name: /SOL-0001/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Conversa e histórico' })).toBeVisible();
  await expectNoOverflow(page);
});
