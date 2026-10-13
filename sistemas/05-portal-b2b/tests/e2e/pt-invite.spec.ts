import { expect, test, type Page } from '@playwright/test';
import { uiLogin, uniqueEmail } from './helpers';
import { CLIENT, loginStaff, signUpConfirmed, USERS } from './pt-helpers';

// Convites seguros: o link aparece UMA vez, vale para um único e-mail e um único uso, e quem aceita entra só na empresa do convite.
test.describe.configure({ mode: 'serial' });

let link = '';
const invitee = uniqueEmail('convidado');
const intruder = uniqueEmail('intruso');

async function createInvite(page: Page, email: string, role: 'Usuário do cliente' | 'Administrador do cliente' = 'Usuário do cliente') {
  await page.goto(`/clientes/${CLIENT.alfa}`);
  await page.getByLabel('E-mail do convidado').fill(email);
  await page.locator('select[name="role"]').selectOption({ label: role });
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  const field = page.getByLabel('Link do convite');
  await expect(field).toBeVisible();
  return field.inputValue();
}

test('a equipe gera o convite; o link aparece uma vez e o banco guarda só o hash', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await loginStaff(page, USERS.gerente);
  link = await createInvite(page, invitee);
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{20,}$/);
  // depois de recarregar, o link NÃO existe mais em lugar nenhum da página
  await page.reload();
  await expect(page.getByLabel('Link do convite')).toHaveCount(0);
  await expect(page.getByText(invitee).first()).toBeVisible(); // aparece só como «convite pendente»
  expect(await page.content()).not.toContain(link.split('/').pop()!);
});

test('a página do convite sem sessão não revela nada e leva ao login com retorno', async ({ page }) => {
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole('heading', { name: 'Você recebeu um convite' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Já tenho conta/ })).toHaveAttribute('href', /\/login\?next=%2Fconvite%2F/);
  // token malformado: mesma mensagem genérica
  await page.goto('/convite/curto');
  await expect(page.getByText('Convite inválido ou expirado.')).toBeVisible();
});

test('um e-mail DIFERENTE não aceita o convite (mensagem genérica) e o convite continua válido', async ({ page }) => {
  await signUpConfirmed(intruder);
  await uiLogin(page, intruder);
  await page.waitForURL('**/onboarding');
  await expect(page.getByText(/Recebeu um convite/)).toBeVisible();
  await page.goto(new URL(link).pathname);
  await page.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(page.getByText('Convite inválido ou expirado.')).toBeVisible();
  await expect(page).toHaveURL(/\/convite\//);
});

test('o convidado aceita, entra SÓ na empresa do convite e o link não funciona de novo', async ({ page, browser }) => {
  await signUpConfirmed(invitee);
  await uiLogin(page, invitee);
  await page.waitForURL('**/onboarding');
  await page.goto(new URL(link).pathname);
  await page.getByRole('button', { name: 'Aceitar convite' }).click();
  await page.waitForURL('**/portal');
  await expect(page.getByRole('heading', { name: /Alfa Comércio de Alimentos/ })).toBeVisible();
  // usuário comum: sem a gestão de usuários; nunca vê a Beta; nunca entra no painel da equipe
  await expect(page.getByRole('link', { name: 'Usuários da empresa' })).toHaveCount(0);
  await page.goto('/dashboard');
  await page.waitForURL('**/portal');

  // reutilizar o mesmo link (inclusive pelo mesmo usuário) falha
  await page.goto(new URL(link).pathname);
  await page.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(page.getByText('Convite inválido ou expirado.')).toBeVisible();

  // a equipe vê o novo usuário na empresa
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  await loginStaff(sp, USERS.gerente);
  await sp.goto(`/clientes/${CLIENT.alfa}`);
  await expect(sp.getByText(/Usuário do cliente · desde/).first()).toBeVisible();
  await staff.close();
});

test('convite revogado não funciona; administrador do cliente convida colega; usuário comum não convida', async ({ page, browser }) => {
  page.on('dialog', (d) => void d.accept());
  await loginStaff(page, USERS.gerente);
  const revokedEmail = uniqueEmail('revogado');
  const revokedLink = await createInvite(page, revokedEmail);
  await page.reload();
  await page.getByText(revokedEmail).locator('..').getByRole('button', { name: 'Revogar' }).click();
  await expect(page.getByText(revokedEmail)).toHaveCount(0);
  await signUpConfirmed(revokedEmail);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await uiLogin(p2, revokedEmail);
  await p2.waitForURL('**/onboarding');
  await p2.goto(new URL(revokedLink).pathname);
  await p2.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(p2.getByText('Convite inválido ou expirado.')).toBeVisible();
  await ctx.close();

  // administrador do cliente convida um colega pelo portal
  const admin = await browser.newContext();
  const pa = await admin.newPage();
  await uiLogin(pa, USERS.alfaAdmin, 'DemoLocal#2026');
  await pa.waitForURL('**/portal');
  await pa.goto('/portal/equipe');
  await pa.getByLabel('E-mail do convidado').fill(uniqueEmail('colega'));
  await pa.getByRole('button', { name: 'Gerar convite' }).click();
  await expect(pa.getByLabel('Link do convite')).toBeVisible();
  await admin.close();
});
