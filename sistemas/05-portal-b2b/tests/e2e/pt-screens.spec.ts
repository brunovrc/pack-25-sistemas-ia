import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { loginClient, loginStaff, USERS } from './pt-helpers';

// Capturas das telas principais (desktop e celular) para a revisão visual e para o README. Saem em docs/screenshots/.
const OUT = join(process.cwd(), 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const staff = [['dashboard', '/dashboard'], ['solicitacoes', '/solicitacoes'], ['clientes', '/clientes'], ['entregas', '/entregas'], ['documentos', '/documentos'], ['relatorios', '/relatorios']] as const;
const client = [['portal-inicio', '/portal'], ['portal-solicitacoes', '/portal/solicitacoes'], ['portal-documentos', '/portal/documentos'], ['portal-entregas', '/portal/entregas']] as const;

for (const [label, size] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
  test(`capturas — ${label}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: size, locale: 'pt-BR' });
    const page = await ctx.newPage();
    await loginStaff(page, USERS.gerente);
    for (const [name, path] of staff) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: true });
    }
    // detalhe de uma solicitação com conversa
    await page.goto('/solicitacoes');
    await page.getByRole('link', { name: /SOL-0001/ }).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(OUT, `solicitacao-detalhe-${label}.png`), fullPage: true });
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: size, locale: 'pt-BR' });
    const p2 = await ctx2.newPage();
    await loginClient(p2, USERS.alfaAdmin);
    for (const [name, path] of client) {
      await p2.goto(path);
      await p2.waitForLoadState('networkidle');
      await p2.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: true });
    }
    await ctx2.close();
  });
}
