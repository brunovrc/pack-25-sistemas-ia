import { expect, test } from '@playwright/test';
import { onboardAndEnrollMfa, uiLogin, uniqueEmail, apiSignUp } from './helpers';

// Específico do painel genérico do Core. Sistemas que substituem o painel listam este arquivo em .core-overrides.
test('painel do Core mostra indicadores calculados do banco', async ({ page }) => {
  const email = uniqueEmail('painel');
  await apiSignUp(email);
  await uiLogin(page, email);
  await onboardAndEnrollMfa(page, 'Empresa Painel Core');
  await expect(page.getByText('Membros da equipe')).toBeVisible();
  await expect(page.getByText('Solicitações LGPD em aberto')).toBeVisible();
  await expect(page.getByText('Eventos de auditoria (7 dias)')).toBeVisible();
});
