// Responsividade e acessibilidade básica: nenhuma tela estoura a largura no celular, tem título, um h1, landmark principal e campos com nome acessível.
import { expect, test, type Page } from '@playwright/test';
import { DEMO, WIDE, loginAs } from './cm-helpers';

test.describe.configure({ mode: 'serial' });

const ROUTES = ['/dashboard', '/vendedores', '/equipes', '/planos', '/vendas', '/vendas/nova', '/comissoes', '/aprovacoes', '/fechamentos', '/pagamentos', '/demonstrativos', '/metas', '/simulador', '/relatorios', '/importacoes', '/notificacoes'];

async function audit(page: Page, route: string) {
  const res = await page.goto(route.includes('?') ? route : `${route}?${WIDE}`);
  expect(res?.status(), route).toBeLessThan(400);
  await expect(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible();
  const r = await page.evaluate(() => {
    const unnamed = [...document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((el) => {
      const labelled = (el.labels && el.labels.length > 0) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
      return !labelled;
    }).map((el) => `${el.tagName.toLowerCase()}#${el.id || el.getAttribute('name') || '?'}`);
    const unlabeledButtons = [...document.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => !(el.textContent ?? '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img[alt]:not([alt=""])')).length;
    const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      title: document.title.trim(),
      h1: document.querySelectorAll('h1').length,
      main: document.querySelectorAll('main, [role=main]').length,
      lang: document.documentElement.lang,
      unnamed, unlabeledButtons, noAlt,
    };
  });
  expect(r.overflow, `${route}: rolagem horizontal`).toBeLessThanOrEqual(1);
  expect(r.title.length, `${route}: título da página`).toBeGreaterThan(2);
  expect(r.h1, `${route}: exatamente um h1`).toBe(1);
  expect(r.main, `${route}: landmark principal`).toBeGreaterThanOrEqual(1);
  expect(r.lang, `${route}: idioma`).toMatch(/^pt/i);
  expect(r.unnamed, `${route}: campos sem nome acessível`).toEqual([]);
  expect(r.unlabeledButtons, `${route}: botões/links sem nome`).toBe(0);
  expect(r.noAlt, `${route}: imagens sem alt`).toBe(0);
}

test('celular (375 px): financeiro percorre as telas sem rolagem horizontal e com estrutura acessível', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, DEMO.financeiro);
  for (const r of ROUTES) await audit(page, r);
});

test('celular (375 px): o vendedor vê o próprio painel e extrato sem estourar a largura', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, DEMO.vend1);
  for (const r of ['/dashboard', '/comissoes', '/metas', '/demonstrativos', '/notificacoes']) await audit(page, r);
});

test('tablet (768 px) e desktop largo (1440 px): painel e extrato sem rolagem horizontal', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  for (const w of [768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const r of ['/dashboard', '/comissoes', '/fechamentos']) await audit(page, r);
  }
});

test('teclado: o primeiro Tab leva ao link «pular para o conteúdo» ou a um controle visível do menu', async ({ page }) => {
  await loginAs(page, DEMO.financeiro);
  await page.goto('/dashboard');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const box = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), visible: box.width > 0 && box.height > 0 };
  });
  expect(focused).not.toBeNull();
  expect(focused!.visible).toBe(true);
});
