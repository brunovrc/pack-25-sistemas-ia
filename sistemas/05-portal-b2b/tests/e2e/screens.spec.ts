import { test } from '@playwright/test';
import { apiSignUp, onboardAndEnrollMfa, uiLogin, uniqueEmail } from './helpers';

// Gera capturas para revisão visual (não faz asserções de pixel). Saída: test-results/screens/
const VIEWS = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, colorScheme: 'light' as const },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, colorScheme: 'light' as const },
  { name: 'desktop-dark', viewport: { width: 1280, height: 800 }, colorScheme: 'dark' as const },
];

for (const v of VIEWS) {
  test(`capturas ${v.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.colorScheme });
    const page = await ctx.newPage();
    const shot = (n: string) => page.screenshot({ path: `test-results/screens/${v.name}-${n}.png`, fullPage: true });

    await page.goto('/login');
    await shot('login');
    await page.goto('/signup');
    await shot('signup');

    const email = uniqueEmail(`shot${v.name}`);
    await apiSignUp(email);
    await uiLogin(page, email);
    await page.waitForURL('**/onboarding');
    await shot('onboarding');
    await onboardAndEnrollMfa(page, 'Distribuidora Aurora Ltda');
    await shot('dashboard');
    for (const p of ['members', 'settings', 'privacy', 'audit']) {
      await page.goto(`/${p}`);
      await page.waitForLoadState('networkidle');
      await shot(p);
    }
    await ctx.close();
  });
}
