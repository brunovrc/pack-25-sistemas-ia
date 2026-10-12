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

export async function stageId(token: string, orgId: string, name: string): Promise<string> {
  const rows = await restJson<Array<{ id: string }>>(token, `crm_pipeline_stages?organization_id=eq.${orgId}&name=eq.${encodeURIComponent(name)}&select=id`);
  if (!rows[0]) throw new Error(`etapa ${name} não encontrada`);
  return rows[0].id;
}

export async function lookupId(token: string, table: string, orgId: string, name: string): Promise<string> {
  const rows = await restJson<Array<{ id: string }>>(token, `${table}?organization_id=eq.${orgId}&name=eq.${encodeURIComponent(name)}&select=id`);
  if (!rows[0]) throw new Error(`${table}/${name} não encontrado`);
  return rows[0].id;
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
