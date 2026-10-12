import { test } from '@playwright/test';
import { uiLogin } from './helpers';
import { setupOwner } from './crm-helpers';

// Capturas para revisão visual (dados de demonstração). Saída: test-results/screens/
const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, colorScheme: 'light' as const },
  { name: 'mobile', viewport: { width: 390, height: 844 }, colorScheme: 'light' as const },
  { name: 'dark', viewport: { width: 1280, height: 800 }, colorScheme: 'dark' as const },
];

for (const v of VIEWS) {
  test(`capturas ${v.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.colorScheme });
    const page = await ctx.newPage();
    await uiLogin(page, 'gerente@demo.exemplo', 'DemoLocal#2026');
    await page.waitForURL('**/dashboard');
    for (const [n, path] of [['dashboard', '/dashboard'], ['pipeline', '/pipeline'], ['leads', '/leads'], ['reports', '/reports'], ['goals', '/goals'], ['activities', '/activities'], ['companies', '/companies']] as const) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `test-results/screens/${v.name}-${n}.png`, fullPage: true });
    }
    // detalhe de uma oportunidade e de um lead
    await page.goto('/opportunities');
    await page.getByRole('link', { name: /Projeto|Contrato|Proposta/ }).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/screens/${v.name}-opportunity.png`, fullPage: true });
    await ctx.close();
  });
}

test('captura da configuração (proprietário)', async ({ browser }) => {
  const owner = await setupOwner(browser, 'telas');
  await owner.page.setViewportSize({ width: 1280, height: 800 });
  await owner.page.goto('/crm-settings');
  await owner.page.waitForLoadState('networkidle');
  await owner.page.screenshot({ path: 'test-results/screens/desktop-crm-settings.png', fullPage: true });
  await owner.ctx.close();
});
