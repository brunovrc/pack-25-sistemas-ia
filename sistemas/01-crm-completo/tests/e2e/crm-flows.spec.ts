import { expect, test } from '@playwright/test';
import { apiSignUp, uiLogin, uniqueEmail } from './helpers';
import { addMember, restJson, setupOwner, suffix, watchCsp, type Owner } from './crm-helpers';

// Fluxos de ponta a ponta do CRM com o navegador e o Supabase reais.
test.describe.configure({ mode: 'serial' });

let owner: Owner;
const run = suffix();
const leadName = `Lead Teste ${run}`;
const leadEmail = `lead.${run}@exemplo.invalid`;

test.beforeAll(async ({ browser }) => {
  owner = await setupOwner(browser, 'crm');
});
test.afterAll(async () => {
  await owner?.ctx.close();
});

test('configuração do CRM: nova origem e nova etapa aparecem', async () => {
  const { page } = owner;
  await page.goto('/crm-settings');
  await expect(page.getByRole('heading', { name: 'Configurações do CRM' })).toBeVisible();
  // padrões criados junto com a organização
  await expect(page.getByText('Prospecção').first()).toBeVisible();
  await expect(page.getByText('Escolheu a concorrência')).toBeVisible();

  await page.getByText('Adicionar origem').click();
  const source = page.locator('details', { hasText: 'Adicionar origem' });
  await source.getByLabel('Nome').fill('Parceiros');
  await source.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Parceiros').first()).toBeVisible();

  await page.locator('summary', { hasText: 'Adicionar etapa' }).click();
  const stage = page.locator('details', { hasText: 'Adicionar etapa' });
  await stage.getByLabel('Nome', { exact: true }).fill('Revisão jurídica');
  await stage.getByLabel('Posição').fill('35');
  await stage.getByLabel('Probabilidade (%)').fill('60');
  await stage.getByRole('button', { name: 'Adicionar etapa' }).click();
  await expect(page.getByText('Revisão jurídica').first()).toBeVisible();

  // o funil precisa manter etapa de Ganho e de Perdido ativas: o banco recusa desativar a única de ganho
  await page.locator('details', { hasText: 'Ganho' }).first().locator('summary').click();
});

test('lead: criar, editar, persistir, bloquear duplicado, arquivar e restaurar', async () => {
  const { page } = owner;
  await page.goto('/leads');
  await expect(page.getByText('Nenhum lead ainda')).toBeVisible(); // estado vazio
  await page.getByRole('link', { name: 'Novo lead' }).first().click();
  await page.getByLabel('Nome', { exact: true }).fill(leadName);
  await page.getByLabel('Empresa').fill('Empresa do Lead');
  await page.getByLabel('E-mail').fill(leadEmail);
  await page.getByLabel('Telefone').fill('(11) 98888-7777');
  await page.getByLabel('Origem').selectOption({ label: 'Parceiros' });
  await page.getByLabel('Classificação').selectOption({ label: 'Quente' });
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: leadName })).toBeVisible();

  await page.getByLabel('Observações').fill('Pediu retorno na sexta');
  await page.getByRole('button', { name: 'Salvar lead' }).click();
  await expect(page.getByText('Lead atualizado.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Observações')).toHaveValue('Pediu retorno na sexta');
  await expect(page.getByLabel('E-mail')).toHaveValue(leadEmail);

  // duplicidade de e-mail entre leads ativos (sem diferenciar maiúsculas)
  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill('Outro Lead');
  await page.getByLabel('E-mail').fill(leadEmail.toUpperCase());
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByText('Já existe um lead ativo com este e-mail.')).toBeVisible();

  // validações do formulário
  await page.getByLabel('Nome', { exact: true }).fill('A');
  await page.getByLabel('E-mail').fill('sem-arroba');
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByText('Informe ao menos 2 caracteres.')).toBeVisible();
  await expect(page.getByText('E-mail inválido.')).toBeVisible();

  // arquivar tira da lista e restaurar traz de volta
  await page.goto('/leads');
  await page.getByRole('link', { name: leadName }).click();
  await page.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByRole('button', { name: 'Restaurar' })).toBeVisible(); // ação concluída no servidor
  await page.goto('/leads');
  await expect(page.getByRole('link', { name: leadName })).toHaveCount(0);
  await page.goto('/leads?view=archived');
  await page.getByRole('link', { name: leadName }).click();
  await page.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('button', { name: 'Arquivar' })).toBeVisible();
  await page.goto('/leads');
  await expect(page.getByRole('link', { name: leadName })).toBeVisible();

  // busca e filtro
  await page.goto(`/leads?q=${encodeURIComponent(leadName)}`);
  await expect(page.getByRole('link', { name: leadName })).toBeVisible();
  await page.goto('/leads?q=naoexiste999');
  await expect(page.getByText('Nenhum lead encontrado')).toBeVisible();
});

test('importação CSV: validar sem gravar, depois importar e detectar duplicados', async () => {
  const { page } = owner;
  const csv = [
    'nome;e-mail;empresa;origem;temperatura',
    `Importada Um ${run};imp1.${run}@exemplo.invalid;Alfa;Parceiros;quente`,
    `Importada Dois ${run};imp2.${run}@exemplo.invalid;Beta;OrigemInexistente;frio`,
    `Duplicada ${run};${leadEmail};Gama;;morno`,
    `;sem-nome@exemplo.invalid;Delta;;`,
    `Repetida ${run};imp1.${run}@exemplo.invalid;Alfa;;`,
  ].join('\n');
  await page.goto('/leads/import');
  await page.setInputFiles('input[type=file]', { name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.getByRole('button', { name: 'Enviar' }).click(); // "apenas validar" vem marcado
  await expect(page.getByText('Validação concluída. Nada foi gravado.')).toBeVisible();
  const report = page.getByRole('region', { name: 'Relatório da importação' });
  await expect(report.getByText('Duplicados').locator('..')).toContainText('2'); // já existente + repetida no arquivo
  await expect(report.getByText('Com erro').locator('..')).toContainText('1');
  await expect(report.getByText('Avisos').locator('..')).toContainText('1');
  await expect(report).toContainText('origem não reconhecida');
  await expect(report).toContainText(`já existe um lead ativo com o e-mail ${leadEmail}`);
  await page.goto(`/leads?q=${encodeURIComponent(`Importada Um ${run}`)}`);
  await expect(page.getByText('Nenhum lead encontrado')).toBeVisible(); // nada foi gravado

  await page.goto('/leads/import');
  await page.setInputFiles('input[type=file]', { name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.getByLabel(/Apenas validar/).uncheck();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('2 lead(s) importado(s).')).toBeVisible();
  await page.goto(`/leads?q=${encodeURIComponent(`Importada`)}`);
  await expect(page.getByRole('link', { name: `Importada Um ${run}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Importada Dois ${run}` })).toBeVisible();

  // arquivo inválido: sem coluna de nome
  await page.goto('/leads/import');
  await page.setInputFiles('input[type=file]', { name: 'ruim.csv', mimeType: 'text/csv', buffer: Buffer.from('email\nx@y.com\n', 'utf8') });
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(/Não encontrei a coluna de nome/)).toBeVisible();
});

test('empresa, contato e conversão de lead em oportunidade', async () => {
  const { page } = owner;
  await page.goto('/companies/new');
  await page.getByLabel('Nome da empresa').fill(`Cliente SA ${run}`);
  await page.getByLabel('Segmento').fill('Varejo');
  await page.getByLabel('Site').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Criar empresa' }).click();
  await expect(page.getByText('Use um endereço iniciado por http:// ou https://.')).toBeVisible();
  await page.getByLabel('Site').fill('https://cliente.exemplo.invalid');
  await page.getByRole('button', { name: 'Criar empresa' }).click();
  await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: `Cliente SA ${run}` })).toBeVisible();

  await page.getByText('Adicionar contato').click();
  await page.getByLabel('Nome', { exact: true }).fill(`Contato ${run}`);
  await page.getByLabel('E-mail').fill(`contato.${run}@exemplo.invalid`);
  await page.getByRole('button', { name: 'Criar contato' }).click();
  await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);

  // converter o lead criado antes
  await page.goto(`/leads?q=${encodeURIComponent(leadName)}`);
  await page.getByRole('link', { name: leadName }).click();
  await page.getByLabel('Valor (R$)').fill('12.500,75');
  await page.getByLabel('Previsão de fechamento').last().fill('2030-12-31');
  await page.getByRole('button', { name: 'Converter em oportunidade' }).click();
  await page.waitForURL(/\/opportunities\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: new RegExp(leadName) })).toBeVisible();
  await expect(page.getByText(/R\$\s12\.500,75/).first()).toBeVisible();
  await expect(page.getByText('Criada em Prospecção')).toBeVisible(); // histórico gravado pelo banco

  // o lead agora aparece como convertido e não pode ser convertido de novo
  await page.goto(`/leads?q=${encodeURIComponent(leadName)}`);
  await page.getByRole('link', { name: leadName }).click();
  await expect(page.getByText('Convertido', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Converter em oportunidade' })).toHaveCount(0);
  // a empresa e o contato do lead foram criados na conversão
  await page.goto('/companies?q=Empresa do Lead');
  await expect(page.getByRole('link', { name: 'Empresa do Lead' })).toBeVisible();
});

test('pipeline: mover por seletor e por arrastar, persistir, perdida exige motivo', async () => {
  const { page } = owner;
  const title = `Negócio Kanban ${run}`;
  await page.goto('/opportunities/new');
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Valor (R$)').fill('3.000,00');
  await page.getByRole('button', { name: 'Criar oportunidade' }).click();
  await page.waitForURL(/\/opportunities\/[0-9a-f-]{36}$/);

  await page.goto('/pipeline');
  const col = (name: string) => page.getByRole('region', { name: `Etapa ${name}` });
  await expect(col('Prospecção')).toBeVisible();
  await expect(col('Revisão jurídica')).toBeVisible(); // etapa criada na configuração
  await expect(col('Prospecção').getByRole('link', { name: title })).toBeVisible();

  // 1) alternativa acessível: seletor "Mover para…"
  await page.getByLabel(`Mover ${title} para`).selectOption({ label: 'Qualificação' });
  await expect(col('Qualificação').getByRole('link', { name: title })).toBeVisible();
  await page.reload();
  await expect(col('Qualificação').getByRole('link', { name: title })).toBeVisible(); // persistiu

  // 2) arrastar e soltar com o mouse
  const handle = page.getByRole('button', { name: `Arrastar ${title}` });
  const hb = (await handle.boundingBox())!;
  const tb = (await col('Proposta').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 90, { steps: 20 });
  await page.mouse.up();
  await expect(col('Proposta').getByRole('link', { name: title })).toBeVisible();
  await page.reload();
  await expect(col('Proposta').getByRole('link', { name: title })).toBeVisible();

  // histórico de movimentações no detalhe
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByText('Prospecção → Qualificação')).toBeVisible();
  await expect(page.getByText('Qualificação → Proposta')).toBeVisible();

  // perdida exige motivo
  await page.goto('/pipeline');
  await page.getByLabel(`Mover ${title} para`).selectOption({ label: 'Perdido' });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Motivo da perda')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Marcar como perdida' })).toBeDisabled();
  await dialog.getByLabel('Motivo').selectOption({ label: 'Preço' });
  await dialog.getByRole('button', { name: 'Marcar como perdida' }).click();
  await expect(col('Perdido').getByRole('link', { name: title })).toBeVisible();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByText('Motivo: Preço')).toBeVisible();

  // reabrir pelo detalhe limpa o encerramento; depois ganhar
  await page.getByLabel('Etapa').selectOption({ label: 'Negociação' });
  await page.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByText('Oportunidade movida.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Aberta', { exact: true })).toBeVisible();
  await page.getByLabel('Etapa').selectOption({ label: 'Ganho' });
  await page.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByText('Oportunidade movida.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ganha', { exact: true })).toBeVisible();
});

test('atividades: atrasada gera alerta no painel; concluir resolve', async () => {
  const { page } = owner;
  const title = `Ligar para o cliente ${run}`;
  await page.goto('/activities');
  await page.getByText('Nova atividade').first().click();
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Prazo').fill('2020-01-02T10:00');
  await page.getByRole('button', { name: 'Criar atividade' }).click();
  await expect(page.getByText('Atividade criada.')).toBeVisible();

  await page.goto('/activities');
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText('atrasada');

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Follow-ups atrasados/ })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  await page.goto('/activities');
  await page.getByRole('row', { name: new RegExp(title) }).getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
  await page.goto('/activities?state=done');
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
});

test('exportação CSV neutraliza fórmulas e respeita o formato', async () => {
  const { page } = owner;
  await restJson(owner.token, 'crm_leads', {
    method: 'POST',
    body: JSON.stringify({ organization_id: owner.orgId, name: '=HYPERLINK("http://evil.example","clique")', owner_id: owner.userId }),
  });
  const res = await page.request.get('/export/leads');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(res.headers()['content-disposition']).toMatch(/attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
  const body = await res.text();
  expect(body.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
  expect(body).toContain('"Nome";"Empresa";"E-mail"');
  expect(body).toContain(`"'=HYPERLINK(""http://evil.example"",""clique"")"`);
  expect(body).not.toMatch(/(^|[;\n])"=HYPERLINK/);
  expect(body).toContain(leadName);

  const opps = await page.request.get('/export/opportunities');
  expect(opps.status()).toBe(200);
  expect((await opps.text())).toContain('12500,75');

  const anon = await (await import('@playwright/test')).request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' });
  const denied = await anon.get('/export/leads', { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(denied.status()); // sem sessão não exporta
  await anon.dispose();
  expect((await page.request.get('/export/inexistente')).status()).toBe(404);
});

test('vendedor só vê o que é dele e não acessa a configuração', async ({ browser }) => {
  const sellerEmail = uniqueEmail('vend');
  const seller = await apiSignUp(sellerEmail);
  await addMember(owner, seller.id, 'member');

  await restJson(owner.token, 'crm_leads', { method: 'POST', body: JSON.stringify({ organization_id: owner.orgId, name: `Lead do Dono ${run}`, owner_id: owner.userId }) });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await uiLogin(page, sellerEmail);
  await page.waitForURL('**/dashboard');
  await expect(page.getByText('Você vê os números dos seus próprios leads e oportunidades.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configurações do CRM' })).toHaveCount(0);

  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill(`Lead do Vendedor ${run}`);
  await expect(page.getByLabel('Responsável')).toHaveCount(0); // vendedor não escolhe o responsável
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);

  await page.goto('/leads');
  await expect(page.getByRole('link', { name: `Lead do Vendedor ${run}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Lead do Dono ${run}` })).toHaveCount(0);
  await expect(page.getByRole('link', { name: leadName })).toHaveCount(0);

  const res = await page.goto('/crm-settings');
  expect(res!.status()).toBe(404);
  await expect(page.getByText('Página não encontrada')).toBeVisible();

  const ownerLeadId = (await restJson<Array<{ id: string }>>(owner.token, `crm_leads?organization_id=eq.${owner.orgId}&name=eq.${encodeURIComponent(`Lead do Dono ${run}`)}&select=id`))[0]!.id;
  const hidden = await page.goto(`/leads/${ownerLeadId}`);
  expect(hidden!.status()).toBe(404);

  const csv = await (await page.request.get('/export/leads')).text();
  expect(csv).toContain(`Lead do Vendedor ${run}`);
  expect(csv).not.toContain(`Lead do Dono ${run}`);

  await page.goto('/goals');
  await expect(page.getByRole('heading', { name: 'Nova meta' })).toHaveCount(0); // vendedor não define metas
  await ctx.close();
});

test('outra organização não enxerga nada desta', async ({ browser }) => {
  const other = await setupOwner(browser, 'crmb');
  const { page } = other;
  await page.goto('/leads');
  await expect(page.getByText('Nenhum lead ainda')).toBeVisible();
  await page.goto('/opportunities');
  await expect(page.getByText('Nenhuma oportunidade ainda')).toBeVisible();
  const myLead = (await restJson<Array<{ id: string }>>(owner.token, `crm_leads?organization_id=eq.${owner.orgId}&select=id&limit=1`))[0]!.id;
  const res = await page.goto(`/leads/${myLead}`);
  expect(res!.status()).toBe(404);
  // a API também recusa
  const leaked = await restJson<unknown[]>(other.token, `crm_leads?organization_id=eq.${owner.orgId}&select=id`);
  expect(leaked).toEqual([]);
  await other.ctx.close();
});

test('CSP sem violações (gráficos e arrastar) e sem rolagem horizontal no celular', async () => {
  const { page } = owner;
  const violations = watchCsp(page);
  await page.goto('/dashboard');
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await page.goto('/pipeline');
  await expect(page.getByRole('region', { name: 'Etapa Prospecção' })).toBeVisible();
  await page.goto('/leads');
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  expect(violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/dashboard', '/leads', '/pipeline', '/opportunities', '/reports']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} não pode rolar na horizontal`).toBeLessThanOrEqual(1);
  }
  await page.goto('/dashboard');
  await page.getByText('Menu', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Pipeline' }).last()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('estados de erro: página inexistente e identificador inválido', async () => {
  const { page } = owner;
  for (const path of ['/leads/00000000-0000-4000-8000-000000000000', '/opportunities/nao-e-uuid', '/companies/00000000-0000-4000-8000-000000000000']) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(404);
    await expect(page.getByText('Página não encontrada')).toBeVisible();
  }
});

test('metas: criar e acompanhar no painel; vendedor sem metas não vê formulário', async () => {
  const { page } = owner;
  await page.goto('/goals');
  await expect(page.getByText('Nenhuma meta definida')).toBeVisible();
  await page.getByLabel('Vendedor').selectOption({ index: 1 });
  await page.getByLabel('Início').fill('2026-01-01');
  await page.getByLabel('Fim').fill('2026-01-31');
  await page.getByLabel(/Meta de vendas ganhas/).fill('0');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.getByText('A meta deve ser maior que zero.')).toBeVisible();
  await page.getByLabel(/Meta de vendas ganhas/).fill('10.000,00');
  await page.getByLabel('Fim').fill('2026-01-01');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.getByText('Meta criada.')).toBeVisible();
  // o formulário é limpo após criar: selecionar o vendedor de novo para tentar duplicar
  await page.getByLabel('Vendedor').selectOption({ index: 1 });
  await page.getByLabel('Início').fill('2026-01-01');
  await page.getByLabel(/Meta de vendas ganhas/).fill('9.000,00');
  await page.getByLabel('Fim').fill('2026-01-01');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.getByText('Já existe uma meta para este vendedor/equipe neste período.')).toBeVisible();
  await page.goto('/goals');
  await expect(page.getByText(/de R\$\s10\.000,00/).first()).toBeVisible();
});
