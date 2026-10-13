import { randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { loginClient, loginStaff, USERS, watchPage } from './pt-helpers';

// Fluxo ponta a ponta entre a equipe e o cliente, com os dados de demonstração (seed). Um cenário por vez, em ordem.
test.describe.configure({ mode: 'serial' });

const tag = randomBytes(3).toString('hex');
const TITLE = `Ajuste urgente no site ${tag}`;
const INTERNAL = `Nota interna secreta ${tag}`;
const SHARED = `Já estamos olhando isso ${tag}`;
const REPLY = `Resposta do cliente ${tag}`;
let requestId = '';
let staffCtx: BrowserContext;
let clientCtx: BrowserContext;
let staff: Page;
let client: Page;

test.beforeAll(async ({ browser }) => {
  staffCtx = await browser.newContext();
  clientCtx = await browser.newContext();
  staff = await staffCtx.newPage();
  client = await clientCtx.newPage();
  for (const p of [staff, client]) p.on('dialog', (d) => void d.accept());
  await loginStaff(staff, USERS.gerente);
  await loginClient(client, USERS.alfaAdmin);
});
test.afterAll(async () => { await staffCtx.close(); await clientCtx.close(); });

test('cliente abre uma solicitação pelo portal', async () => {
  const w = watchPage(client);
  await client.goto('/portal/solicitacoes/nova');
  await client.getByLabel('Título').fill(TITLE);
  await client.getByLabel('Descrição').fill('O formulário de contato parou de enviar mensagens.');
  await client.getByLabel('Categoria').selectOption({ label: 'Suporte' });
  await client.getByRole('button', { name: 'Abrir solicitação' }).click();
  await client.waitForURL(/\/portal\/solicitacoes\/[0-9a-f-]{36}$/);
  requestId = client.url().split('/').pop()!;
  await expect(client.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(client.getByText('Aberta', { exact: true }).first()).toBeVisible();
  // o prazo do nível de serviço foi calculado (prioridade normal = 40 h úteis) e aparece
  await expect(client.getByText(/Prazo do nível de serviço/)).toBeVisible();
  expect(w.csp).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('a equipe atribui, comenta (interno e compartilhado) e pede informação ao cliente', async () => {
  await staff.goto(`/solicitacoes/${requestId}`);
  await expect(staff.getByRole('heading', { name: TITLE })).toBeVisible();
  await staff.getByLabel('Responsável', { exact: true }).selectOption({ label: 'Camila Atendimento' });
  await staff.getByRole('button', { name: 'Atribuir' }).click();
  await expect(staff.getByText('Camila Atendimento').first()).toBeVisible();

  await staff.getByLabel('Novo comentário').fill(INTERNAL);
  await staff.getByLabel('Visibilidade').first().selectOption('internal');
  await staff.getByRole('button', { name: 'Enviar comentário' }).click();
  await expect(staff.getByText(INTERNAL)).toBeVisible();
  await expect(staff.getByText('Nota interna').first()).toBeVisible();

  await staff.getByLabel('Novo comentário').fill(SHARED);
  await staff.getByLabel('Visibilidade').first().selectOption('shared');
  await staff.getByRole('button', { name: 'Enviar comentário' }).click();
  await expect(staff.getByText(SHARED)).toBeVisible();

  await staff.getByLabel('Nova situação').selectOption({ label: 'Aguardando cliente' });
  await staff.getByRole('button', { name: 'Atualizar situação' }).click();
  await expect(staff.getByText('Aguardando cliente').first()).toBeVisible();
});

test('o cliente vê o comentário compartilhado, NUNCA a nota interna, e responde', async () => {
  await client.goto(`/portal/solicitacoes/${requestId}`);
  await expect(client.getByText(SHARED)).toBeVisible();
  await expect(client.getByText(INTERNAL)).toHaveCount(0);
  await expect(client.getByText('Nota interna')).toHaveCount(0);
  await expect(client.getByText('Aguardando você').first()).toBeVisible();
  await expect(client.getByText(/A equipe está aguardando uma resposta sua/)).toBeVisible();
  // a lista e o início também destacam
  await client.goto('/portal');
  await expect(client.getByText(TITLE)).toBeVisible();

  await client.goto(`/portal/solicitacoes/${requestId}`);
  await client.getByLabel('Responder ou comentar').fill(REPLY);
  await client.getByRole('button', { name: 'Enviar comentário' }).click();
  await expect(client.getByText(REPLY)).toBeVisible();
  // responder devolve a bola à equipe
  await expect(client.getByText('Aguardando a equipe').first()).toBeVisible();
});

test('a equipe conclui; o cliente reabre com motivo; o histórico guarda tudo', async () => {
  await staff.goto(`/solicitacoes/${requestId}`);
  await expect(staff.getByText(REPLY)).toBeVisible();
  await staff.getByLabel('Nova situação').selectOption({ label: 'Concluída' });
  await staff.getByRole('button', { name: 'Atualizar situação' }).click();
  await expect(staff.getByText(/Concluída em/)).toBeVisible();

  await client.goto(`/portal/solicitacoes/${requestId}`);
  await expect(client.getByText('Concluída').first()).toBeVisible();
  await client.getByRole('button', { name: 'Reabrir solicitação' }).click();
  await client.getByLabel(/Por que está reabrindo/).fill('O problema voltou a acontecer hoje.');
  await client.getByRole('button', { name: 'Confirmar reabertura' }).click();
  await expect(client.getByText('O problema voltou a acontecer hoje.')).toBeVisible();
  await expect(client.getByText('Aberta', { exact: true }).first()).toBeVisible();
});

test('entrega: rascunho invisível ao cliente → publicada → recebimento confirmado', async () => {
  const title = `Relatório de abril ${tag}`;
  await staff.goto('/entregas/nova');
  await staff.getByLabel('Empresa cliente').selectOption({ label: 'Alfa Comércio de Alimentos' });
  await staff.getByLabel('Título da entrega').fill(title);
  await staff.getByLabel('Descrição').fill('Resumo dos resultados do mês e próximos passos.');
  await staff.getByRole('button', { name: 'Criar entrega (rascunho)' }).click();
  await staff.waitForURL(/\/entregas\/[0-9a-f-]{36}$/);
  const dl = staff.url().split('/').pop()!;

  await client.goto('/portal/entregas');
  await expect(client.getByText(title)).toHaveCount(0); // rascunho: o cliente não vê
  const direct = await client.goto(`/portal/entregas/${dl}`);
  expect(direct?.status()).toBe(404);

  // só se publica a partir de «Pronta para publicar»
  await staff.getByLabel('Mudar situação para').selectOption({ label: 'Pronta para publicar' });
  await staff.getByRole('button', { name: 'Atualizar' }).click();
  await expect(staff.locator('span.rounded-full', { hasText: /^Pronta para publicar$/ })).toBeVisible();
  await staff.getByLabel('Mudar situação para').selectOption({ label: 'Publicada' });
  await staff.getByRole('button', { name: 'Atualizar' }).click();
  await expect(staff.locator('span.rounded-full', { hasText: /^Publicada$/ })).toBeVisible();

  await client.goto('/portal/entregas');
  await expect(client.getByRole('link', { name: title })).toBeVisible();
  await client.getByRole('link', { name: title }).click();
  await client.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(client.getByText('Recebimento confirmado. Obrigado!')).toBeVisible();

  await staff.goto(`/entregas/${dl}`);
  await expect(staff.getByText(/Recebimento confirmado/).first()).toBeVisible();
  await expect(staff.getByText(/Ana Alfa/).first()).toBeVisible();
});

test('documento interno fica escondido; ao compartilhar, o cliente baixa o arquivo certo', async () => {
  const docTitle = `Ata de reunião ${tag}`;
  const content = `Conteúdo confidencial da ata ${tag}\n`;
  await staff.goto('/documentos?client=a5a5a5a5-1000-4000-8000-000000000001');
  await staff.setInputFiles('#upload-file', { name: 'ata.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
  await staff.locator('#upload-title').fill(docTitle);
  await staff.locator('#upload-visibility').selectOption('internal');
  await staff.getByRole('button', { name: 'Enviar documento' }).click();
  await expect(staff.getByText('Documento enviado.')).toBeVisible();
  await expect(staff.getByText(docTitle).first()).toBeVisible();

  await client.goto('/portal/documentos');
  await expect(client.getByText(docTitle)).toHaveCount(0);

  await staff.getByRole('row', { name: new RegExp(docTitle) }).getByRole('button', { name: 'Compartilhar com o cliente' }).click();
  await expect(staff.getByRole('row', { name: new RegExp(docTitle) }).getByText('Compartilhado')).toBeVisible();

  await client.goto('/portal/documentos');
  const row = client.getByRole('row', { name: new RegExp(docTitle) });
  await expect(row).toBeVisible();
  const href = await row.getByRole('link', { name: 'Baixar' }).getAttribute('href');
  const res = await clientCtx.request.get(href!); // segue o redirecionamento para a URL assinada
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(content);

  // o download ficou na trilha de acessos (visível à equipe)
  await staff.reload();
  await expect(staff.getByRole('table', { name: 'Acessos a documentos' }).getByText('Download').first()).toBeVisible();

  // e voltar a «interno» tira o acesso na hora
  await staff.getByRole('row', { name: new RegExp(docTitle) }).getByRole('button', { name: 'Tornar interno' }).click();
  await expect(staff.getByRole('row', { name: new RegExp(docTitle) }).getByText('Interno')).toBeVisible();
  const again = await clientCtx.request.get(href!, { maxRedirects: 0 });
  expect(again.status()).toBe(404);
});

test('comunicado só para a Alfa: a Alfa vê, a Beta não', async ({ browser }) => {
  const title = `Aviso só da Alfa ${tag}`;
  await staff.goto('/comunicados');
  await staff.getByLabel('Título').fill(title);
  await staff.getByLabel('Mensagem').fill('Reunião de resultados na próxima quinta.');
  await staff.getByLabel('Quem recebe').selectOption('selected');
  await staff.getByLabel('Alfa Comércio de Alimentos').check();
  await staff.getByRole('button', { name: 'Publicar comunicado' }).click();
  await expect(staff.getByText('Comunicado publicado.')).toBeVisible();

  await client.goto('/portal/comunicados');
  await expect(client.getByText(title)).toBeVisible();

  const betaCtx = await browser.newContext();
  const beta = await betaCtx.newPage();
  await loginClient(beta, USERS.betaAdmin);
  await beta.goto('/portal/comunicados');
  await expect(beta.getByText(title)).toHaveCount(0);
  await betaCtx.close();
});
