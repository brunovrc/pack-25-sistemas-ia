import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ANON_KEY, BASE_URL, PASSWORD, SUPABASE_URL, apiLogin, rest, uiLogin, waitForAuthLink } from './helpers';

export const DEMO_PASSWORD = 'DemoLocal#2026';
export const ORG = 'a5a5a5a5-0000-4000-8000-000000000001';
export const CLIENT = { alfa: 'a5a5a5a5-1000-4000-8000-000000000001', beta: 'a5a5a5a5-1000-4000-8000-000000000002', gama: 'a5a5a5a5-1000-4000-8000-000000000003' };
export const USERS = {
  gerente: 'gerente@demo.exemplo', colab1: 'colaborador1@demo.exemplo', colab2: 'colaborador2@demo.exemplo', leitor: 'leitor@demo.exemplo',
  alfaAdmin: 'alfa.admin@demo.exemplo', alfaUser: 'alfa.usuario@demo.exemplo', betaAdmin: 'beta.admin@demo.exemplo', betaUser: 'beta.usuario@demo.exemplo', gamaAdmin: 'gama.admin@demo.exemplo',
} as const;

/** Observa violações de CSP e erros de página (JavaScript) durante o teste. */
export function watchPage(page: Page): { csp: string[]; errors: string[] } {
  const out = { csp: [] as string[], errors: [] as string[] };
  page.on('console', (m) => { if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) out.csp.push(m.text()); });
  page.on('pageerror', (e) => out.errors.push(e.message));
  return out;
}

// O app limita tentativas de login (8 a cada 10 min por e-mail e IP — defesa real, que o teste não deve contornar). Por isso cada usuário
// faz o login pela interface UMA vez e as demais telas do teste reaproveitam a sessão (cookies) dele.
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['storageState']>>>();
async function login(page: Page, email: string, landing: string) {
  const cached = sessions.get(email);
  if (cached) {
    await page.context().addCookies(cached.cookies);
    await page.goto(landing);
    await page.waitForURL(`**${landing}`);
    return;
  }
  await uiLogin(page, email, DEMO_PASSWORD);
  await page.waitForURL(`**${landing}`);
  sessions.set(email, await page.context().storageState());
}
export const loginStaff = (page: Page, email: string) => login(page, email, '/dashboard');
export const loginClient = (page: Page, email: string) => login(page, email, '/portal');

export async function restJson<T = unknown>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await rest(token, path, init);
  if (!res.ok) throw new Error(`REST ${path} falhou: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
export async function rpcRaw(token: string, fn: string, args: Record<string, unknown>) {
  const res = await rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
}
export async function tokenFor(email: string): Promise<string> {
  return apiLogin(email, DEMO_PASSWORD);
}

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'a página não pode ter rolagem horizontal').toBeLessThanOrEqual(1);
}

/** Cadastra e CONFIRMA um usuário novo (e-mail confirmado pelo link do Mailpit, reescrito para a porta do app em teste). */
export async function signUpConfirmed(email: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!res.ok) throw new Error(`signup falhou: ${res.status}`);
  const link = new URL(await waitForAuthLink(email, 'signup'));
  await fetch(`${BASE_URL}${link.pathname}${link.search}`, { redirect: 'manual' });
}
