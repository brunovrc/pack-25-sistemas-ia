import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { totp } from './helpers';

export const DEMO_PASSWORD = 'DemoLocal#2026';
export const DEMO = { admin: 'admin@demo.exemplo', gestor: 'gestor@demo.exemplo', gestor2: 'gestor2@demo.exemplo', financeiro: 'financeiro@demo.exemplo', vend1: 'vend1@demo.exemplo', vend2: 'vend2@demo.exemplo', vend3: 'vend3@demo.exemplo', vend4: 'vend4@demo.exemplo', consulta: 'consulta@demo.exemplo' };

type Cookies = Awaited<ReturnType<ReturnType<Page['context']>['cookies']>>;
const sessions = new Map<string, Cookies>();
const SECRET_FILE = 'node_modules/.cache/cm-e2e-admin-secret.txt'; // segredo TOTP do administrador semeado (válido até o próximo `supabase db reset`)
let adminSecret: string | null = (() => { try { return readFileSync(SECRET_FILE, 'utf8').trim() || null; } catch { return null; } })();
const saveSecret = (s: string) => { mkdirSync('node_modules/.cache', { recursive: true }); writeFileSync(SECRET_FILE, s); };

/** Sessão reaproveitada por e-mail (o limitador de login do app barra logins repetidos da mesma conta). */
export async function loginAs(page: Page, email: string): Promise<void> {
  const cached = sessions.get(email);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto('/dashboard');
    if (!page.url().includes('/login') && !page.url().includes('/mfa')) return;
  }
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  // o app redireciona para onde falta algo (2º fator): goto segue os redirecionamentos até o destino final
  for (let i = 0; i < 4; i++) {
    await page.goto('/dashboard');
    const u = page.url();
    if (u.includes('/mfa/enroll')) {
      await page.getByRole('button', { name: 'Gerar QR Code' }).click();
      adminSecret = (await page.locator('code').first().innerText()).trim();
      saveSecret(adminSecret);
      await page.getByLabel('Código de 6 dígitos').fill(totp(adminSecret));
      await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
      await page.waitForURL('**/dashboard');
    } else if (u.includes('/mfa/verify')) {
      if (!adminSecret) throw new Error('administrador já tem 2º fator e o segredo não é conhecido: rode `supabase db reset` antes do E2E');
      await page.getByLabel('Código de 6 dígitos').fill(totp(adminSecret));
      await page.getByRole('button', { name: 'Verificar' }).click();
      await page.waitForURL('**/dashboard');
    } else if (u.includes('/dashboard')) break;
  }
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  sessions.set(email, await page.context().cookies());
}

export const norm = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
export async function expectNoServerError(page: Page, label: string) {
  await expect(page.locator('body'), `${label}: sem tela de erro`).not.toContainText(/Algo deu errado|Application error|Internal Server Error/);
}
/** BRL como o app mostra (espaço não separável normalizado). */
export const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n).replace(/ /g, ' ');
/** Datas de busca explícitas: o E2E não depende do «mês atual». */
export const WIDE = 'p=custom&from=2026-01-01&to=2028-12-31';
