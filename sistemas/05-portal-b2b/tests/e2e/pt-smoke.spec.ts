import { expect, test } from '@playwright/test';
import { loginClient, loginStaff, USERS, watchPage } from './pt-helpers';

// Percorre TODAS as telas como equipe e como cliente: nenhuma pode quebrar, violar a CSP ou lançar erro de JavaScript.
const STAFF_PAGES = ['/dashboard', '/clientes', '/clientes/novo', '/solicitacoes', '/solicitacoes/nova', '/entregas', '/entregas/nova', '/documentos', '/comunicados', '/relatorios', '/notificacoes', '/convites', '/configuracoes'];
const CLIENT_PAGES = ['/portal', '/portal/solicitacoes', '/portal/solicitacoes/nova', '/portal/entregas', '/portal/documentos', '/portal/comunicados', '/portal/equipe', '/portal/notificacoes'];

test('gestor: todas as telas da equipe abrem sem erro', async ({ page }) => {
  const w = watchPage(page);
  await loginStaff(page, USERS.gerente);
  for (const path of STAFF_PAGES) {
    // /convites e /configuracoes são só de administradores: para o gestor devolvem 404 (não é falha)
    const res = await page.goto(path);
    const adminOnly = path === '/convites' || path === '/configuracoes';
    expect(res?.status(), path).toBe(adminOnly ? 404 : 200);
    if (!adminOnly) await expect(page.locator('main h1').first(), path).toBeVisible();
  }
  expect(w.csp).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('administrador do cliente: todas as telas do portal abrem sem erro', async ({ page }) => {
  const w = watchPage(page);
  await loginClient(page, USERS.alfaAdmin);
  for (const path of CLIENT_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('main h1').first(), path).toBeVisible();
  }
  expect(w.csp).toEqual([]);
  expect(w.errors).toEqual([]);
});
