import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { apiLogin, rest, uiLogin } from './helpers';

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

export async function loginStaff(page: Page, email: string) {
  await uiLogin(page, email, DEMO_PASSWORD);
  await page.waitForURL('**/dashboard');
}
export async function loginClient(page: Page, email: string) {
  await uiLogin(page, email, DEMO_PASSWORD);
  await page.waitForURL('**/portal');
}

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
