import type { Browser, BrowserContext, Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { apiAal2Token, apiLogin, apiSignUp, onboardAndEnrollMfa, rest, uiLogin, uniqueEmail } from './helpers';

export type Owner = { ctx: BrowserContext; page: Page; email: string; userId: string; secret: string; orgId: string; token: string };

export const suffix = () => randomBytes(3).toString('hex');

/** Cria um proprietário com organização e MFA ativo, mais um token AAL2 para preparar dados via API. */
export async function setupOwner(browser: Browser, tag: string): Promise<Owner> {
  const email = uniqueEmail(tag);
  const { id: userId } = await apiSignUp(email);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  await uiLogin(page, email);
  const secret = await onboardAndEnrollMfa(page, `Empresa ${tag} ${suffix()}`);
  const orgId = (await ctx.cookies()).find((c) => c.name === 'pack25_org')!.value;
  const token = await apiAal2Token(await apiLogin(email), secret);
  return { ctx, page, email, userId, secret, orgId, token };
}

export async function restJson<T = unknown>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await rest(token, path, init);
  if (!res.ok) throw new Error(`REST ${path} falhou: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Registra violações de Content-Security-Policy vistas no console do navegador. */
export function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}

export async function addMember(owner: Owner, userId: string, role: 'member' | 'manager' | 'viewer') {
  await restJson(owner.token, 'organization_members', { method: 'POST', body: JSON.stringify({ organization_id: owner.orgId, user_id: userId, role }) });
}

/** Data (YYYY-MM-DD) daqui a `days` dias, no horário de Brasília. */
export function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}
