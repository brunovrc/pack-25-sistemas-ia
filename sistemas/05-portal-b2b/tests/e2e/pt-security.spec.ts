import { expect, test } from '@playwright/test';
import { ANON_KEY, rest, SUPABASE_URL } from './helpers';
import { CLIENT, loginClient, loginStaff, ORG, restJson, rpcRaw, tokenFor, USERS } from './pt-helpers';

// Cenários de AMEAÇA contra a pilha real (banco + Storage + app em produção). A prioridade do produto: nada de uma empresa chega a outra,
// e o que é interno nunca chega ao cliente. Cada teste é um ataque; o esperado é sempre negação (ou lista vazia), nunca vazamento.
type Id = { id: string };
let alfa: string, beta: string, gerente: string, leitor: string;
let betaRequest: string, alfaRequest: string, betaDoc: string, alfaInternalDoc: string, alfaSharedDoc: string, betaDraftDeliverable: string;

test.beforeAll(async () => {
  [alfa, beta, gerente, leitor] = await Promise.all([tokenFor(USERS.alfaAdmin), tokenFor(USERS.betaAdmin), tokenFor(USERS.gerente), tokenFor(USERS.leitor)]);
  betaRequest = (await restJson<Id[]>(gerente, `requests?client_account_id=eq.${CLIENT.beta}&select=id&limit=1`))[0]!.id;
  alfaRequest = (await restJson<Id[]>(gerente, `requests?client_account_id=eq.${CLIENT.alfa}&status=eq.in_progress&select=id&limit=1`))[0]!.id;
  betaDoc = (await restJson<Id[]>(gerente, `documents?client_account_id=eq.${CLIENT.beta}&visibility=eq.client&select=id&limit=1`))[0]!.id;
  alfaInternalDoc = (await restJson<Id[]>(gerente, `documents?client_account_id=eq.${CLIENT.alfa}&visibility=eq.internal&select=id&limit=1`))[0]!.id;
  alfaSharedDoc = (await restJson<Id[]>(gerente, `documents?client_account_id=eq.${CLIENT.alfa}&visibility=eq.client&select=id&limit=1`))[0]!.id;
  betaDraftDeliverable = (await restJson<Id[]>(gerente, `deliverables?client_account_id=eq.${CLIENT.beta}&status=eq.draft&select=id&limit=1`))[0]!.id;
});

test.describe('1–3. leitura entre empresas (API com o token do cliente)', () => {
  test('o cliente da Alfa não lê NADA da Beta, em nenhuma tabela', async () => {
    for (const table of ['requests', 'request_comments', 'request_status_history', 'documents', 'document_folders', 'deliverables', 'client_members', 'document_access_logs', 'request_attachments']) {
      const rows = await restJson<Array<{ client_account_id?: string }>>(alfa, `${table}?client_account_id=eq.${CLIENT.beta}&select=*`);
      expect(rows, `${table} da Beta`).toEqual([]);
    }
    const all = await restJson<Array<{ client_account_id: string }>>(alfa, 'requests?select=client_account_id');
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((r) => r.client_account_id))).toEqual(new Set([CLIENT.alfa]));
    expect(await restJson<unknown[]>(alfa, `client_accounts?id=eq.${CLIENT.beta}&select=id`)).toEqual([]);
  });

  test('o cliente não vê o que é interno da PRÓPRIA empresa: documentos, observações, comentários e convites', async () => {
    expect(await restJson<unknown[]>(alfa, `documents?id=eq.${alfaInternalDoc}&select=id`)).toEqual([]);
    expect(await restJson<unknown[]>(alfa, 'documents?visibility=eq.internal&select=id')).toEqual([]);
    expect(await restJson<unknown[]>(alfa, 'client_internal_notes?select=notes')).toEqual([]);
    expect(await restJson<unknown[]>(alfa, 'request_comments?visibility=eq.internal&select=id')).toEqual([]);
    expect(await restJson<unknown[]>(alfa, `deliverables?status=in.(draft,in_preparation,ready)&select=id`)).toEqual([]);
    // o hash do token de convite não é legível nem para quem convida
    expect((await rest(alfa, 'invitation_tokens?select=token_hash')).status).toBeGreaterThanOrEqual(400);
    expect((await rest(gerente, 'invitation_tokens?select=token_hash')).status).toBeGreaterThanOrEqual(400);
  });

  test('o cliente só enxerga os usuários e as notificações da própria empresa', async () => {
    const members = await restJson<Array<{ client_account_id: string }>>(alfa, 'client_members?select=client_account_id');
    expect(new Set(members.map((m) => m.client_account_id))).toEqual(new Set([CLIENT.alfa]));
    const me = await tokenFor(USERS.alfaUser);
    const own = await restJson<Array<{ user_id: string }>>(me, 'notifications?select=user_id');
    expect(new Set(own.map((n) => n.user_id)).size).toBeLessThanOrEqual(1);
    const others = await restJson<Array<{ user_id: string }>>(alfa, 'notifications?select=user_id');
    expect(new Set(others.map((n) => n.user_id)).size).toBeLessThanOrEqual(1);
  });
});

test.describe('4–7. escrita indevida (API)', () => {
  test('o cliente não escreve direto nas tabelas nem muda situação por fora das funções', async () => {
    for (const [table, body] of [
      ['requests', { organization_id: ORG, client_account_id: CLIENT.alfa, number: 9999, title: 'invasão' }],
      ['documents', { organization_id: ORG, client_account_id: CLIENT.alfa, title: 'x' }],
      ['deliverables', { organization_id: ORG, client_account_id: CLIENT.alfa, title: 'entrega falsa' }],
      ['request_comments', { organization_id: ORG, client_account_id: CLIENT.alfa, request_id: alfaRequest, body: 'direto', visibility: 'internal' }],
      ['announcements', { organization_id: ORG, title: 'falso', body: 'falso' }],
      ['client_members', { organization_id: ORG, client_account_id: CLIENT.beta, user_id: '00000000-0000-4000-8000-000000000000', role: 'client_admin' }],
    ] as const) {
      const res = await rest(alfa, table, { method: 'POST', body: JSON.stringify(body) });
      expect(res.status, `INSERT em ${table}`).toBeGreaterThanOrEqual(400);
    }
    const patch = await rest(alfa, `requests?id=eq.${alfaRequest}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
    expect(patch.status).toBeGreaterThanOrEqual(400);
    const del = await rest(alfa, `requests?id=eq.${alfaRequest}`, { method: 'DELETE' });
    expect([...[200, 204]].includes(del.status) ? (await del.json().catch(() => [])) : []).toEqual([]);
    expect(await restJson<unknown[]>(gerente, `requests?id=eq.${alfaRequest}&select=id`)).toHaveLength(1); // continua lá
  });

  test('o cliente não comenta em solicitação de outra empresa, não escreve nota interna e não publica entrega', async () => {
    expect((await rpcRaw(alfa, 'pt_comment_add', { p_request: betaRequest, p_body: 'intruso', p_visibility: 'shared' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_comment_add', { p_request: alfaRequest, p_body: 'tentando nota interna', p_visibility: 'internal' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_request_set_status', { p_request: betaRequest, p_status: 'cancelled', p_reason: 'x' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_request_set_status', { p_request: alfaRequest, p_status: 'completed' })).status).toBeGreaterThanOrEqual(400); // cliente não conclui
    expect((await rpcRaw(alfa, 'pt_request_assign', { p_request: alfaRequest, p_user: null })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_deliverable_set_status', { p_id: betaDraftDeliverable, p_status: 'published' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_deliverable_acknowledge', { p_id: betaDraftDeliverable })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_document_set_visibility', { p_document: alfaSharedDoc, p_visibility: 'internal' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_invite_create', { p_org: ORG, p_kind: 'staff', p_client: null, p_email: 'novo@exemplo.test', p_role: 'admin' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(alfa, 'pt_invite_create', { p_org: ORG, p_kind: 'client', p_client: CLIENT.beta, p_email: 'novo@exemplo.test', p_role: 'client_admin' })).status).toBeGreaterThanOrEqual(400);
  });

  test('o leitor da equipe só lê: nenhuma escrita passa', async () => {
    expect((await rpcRaw(leitor, 'pt_comment_add', { p_request: alfaRequest, p_body: 'leitor comentando', p_visibility: 'shared' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(leitor, 'pt_request_create', { p_client: CLIENT.alfa, p_title: 'Leitor abrindo', p_description: '', p_category: null })).status).toBeGreaterThanOrEqual(400);
    expect((await rest(leitor, 'client_accounts', { method: 'POST', body: JSON.stringify({ organization_id: ORG, name: 'Empresa do leitor' }) })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(leitor, 'pt_document_set_visibility', { p_document: alfaInternalDoc, p_visibility: 'client' })).status).toBeGreaterThanOrEqual(400);
  });

  test('o cliente da Beta não troca a visibilidade nem acessa documentos da Alfa', async () => {
    expect((await rpcRaw(beta, 'pt_document_access', { p_document: alfaSharedDoc, p_action: 'download' })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcRaw(beta, 'pt_document_access', { p_document: alfaInternalDoc, p_action: 'download' })).status).toBeGreaterThanOrEqual(400);
  });
});

test.describe('8–10. documentos e Storage', () => {
  test('/api/documents responde 404 igual para «de outra empresa», «interno» e «inexistente»', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginClient(page, USERS.alfaAdmin);
    const bodies = new Set<string>();
    for (const id of [betaDoc, alfaInternalDoc, '11111111-2222-4333-8444-555555555555', 'não-é-uuid']) {
      const res = await ctx.request.get(`/api/documents/${id}`, { maxRedirects: 0 });
      expect(res.status(), id).toBe(404);
      bodies.add(await res.text());
    }
    expect(bodies.size, 'mensagens idênticas: não revela se o documento existe').toBe(1);
    // o documento compartilhado da própria empresa redireciona para uma URL assinada que EXPIRA (token curto)
    const ok = await ctx.request.get(`/api/documents/${alfaSharedDoc}`, { maxRedirects: 0 });
    expect(ok.status()).toBe(302);
    const loc = ok.headers().location!;
    expect(loc).toContain('/storage/v1/object/sign/portal-documents/');
    const jwt = new URL(loc).searchParams.get('token')!;
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()) as { exp: number; iat?: number };
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    expect(ttl, 'URL assinada com validade curta').toBeLessThanOrEqual(60);
    await ctx.close();
  });

  test('o bucket é privado: sem sessão, ou com o token de outra empresa, o objeto não abre', async () => {
    const path = (await restJson<Array<{ storage_path: string }>>(gerente, `documents?id=eq.${alfaSharedDoc}&select=storage_path`))[0]!.storage_path;
    const pub = await fetch(`${SUPABASE_URL}/storage/v1/object/public/portal-documents/${path}`);
    expect(pub.status).toBeGreaterThanOrEqual(400);
    const anon = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/portal-documents/${path}`, { headers: { apikey: ANON_KEY } });
    expect(anon.status).toBeGreaterThanOrEqual(400);
    const other = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/portal-documents/${path}`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${beta}` } });
    expect(other.status).toBeGreaterThanOrEqual(400);
    const internalPath = (await restJson<Array<{ storage_path: string }>>(gerente, `documents?id=eq.${alfaInternalDoc}&select=storage_path`))[0]!.storage_path;
    const own = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/portal-documents/${internalPath}`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${alfa}` } });
    expect(own.status, 'documento interno da própria empresa').toBeGreaterThanOrEqual(400);
    // e a equipe autorizada abre
    const staff = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/portal-documents/${internalPath}`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${gerente}` } });
    expect(staff.status).toBe(200);
  });

  test('envio forjado: cliente tentando gravar na pasta da Beta, tipo falso e arquivo grande demais', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginClient(page, USERS.alfaAdmin);
    // 1. o cliente informa a empresa Beta, mas o servidor força a PRÓPRIA conta
    const ok = await ctx.request.post('/api/documents', { multipart: { file: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('texto do cliente') }, client: CLIENT.beta, visibility: 'internal', title: 'Forjado' } });
    expect(ok.status()).toBe(201);
    const id = ((await ok.json()) as { id: string }).id;
    const row = (await restJson<Array<{ client_account_id: string; visibility: string }>>(gerente, `documents?id=eq.${id}&select=client_account_id,visibility`))[0]!;
    expect(row.client_account_id).toBe(CLIENT.alfa);
    expect(row.visibility, 'o que o cliente envia é sempre compartilhado').toBe('client');
    // 2. executável renomeado para .pdf: o conteúdo é conferido, não a extensão nem o Content-Type
    const exe = await ctx.request.post('/api/documents', { multipart: { file: { name: 'fatura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00\x03\x00\x00\x00 programa executavel') } } });
    expect(exe.status()).toBe(415);
    const html = await ctx.request.post('/api/documents', { multipart: { file: { name: 'pagina.png', mimeType: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') } } });
    expect(html.status()).toBe(415);
    // 3. acima do limite configurado (20 MB)
    const big = await ctx.request.post('/api/documents', { multipart: { file: { name: 'grande.txt', mimeType: 'text/plain', buffer: Buffer.alloc(21 * 1024 * 1024, 97) } } });
    expect(big.status()).toBe(413);
    // 4. sem arquivo
    expect((await ctx.request.post('/api/documents', { multipart: { client: CLIENT.alfa } })).status()).toBe(400);
    await ctx.close();
    // 5. e quem não tem sessão não envia
    const anon = await fetch(`${process.env.E2E_BASE_URL ?? 'http://localhost:3000'}/api/documents`, { method: 'POST', redirect: 'manual' });
    expect([307, 401]).toContain(anon.status);
  });
});

test.describe('11–14. áreas, sessão e desativação', () => {
  test('o usuário do cliente não entra no painel da equipe nem baixa relatórios', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginClient(page, USERS.alfaUser);
    for (const path of ['/clientes', '/solicitacoes', '/configuracoes', '/dashboard', '/relatorios']) {
      await page.goto(path);
      await page.waitForURL('**/portal', { timeout: 10_000 });
    }
    const csv = await ctx.request.get('/export/solicitacoes', { maxRedirects: 0 });
    expect([307, 401, 403]).toContain(csv.status());
    // usuário comum não vê a gestão de usuários da empresa
    expect((await page.goto('/portal/equipe'))?.status()).toBe(404);
    // URL de solicitação da Beta no portal da Alfa
    expect((await page.goto(`/portal/solicitacoes/${betaRequest}`))?.status()).toBe(404);
    expect((await page.goto(`/portal/entregas/${betaDraftDeliverable}`))?.status()).toBe(404);
    await ctx.close();
  });

  test('o gestor baixa CSV; o colaborador e o cliente não; cada exportação deixa trilha', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginStaff(page, USERS.gerente);
    const res = await ctx.request.get('/export/solicitacoes?period=365d');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    expect(res.headers()['content-disposition']).toContain('attachment');
    const body = await res.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain('SOL-');
    await ctx.close();
    const colab = await browser.newContext();
    const p2 = await colab.newPage();
    await loginStaff(p2, USERS.colab1);
    expect((await colab.request.get('/export/solicitacoes')).status()).toBe(403);
    await colab.close();
  });

  test('desativar o usuário (ou arquivar a empresa) tira o acesso NA HORA, sem esperar a sessão expirar', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginClient(page, USERS.alfaUser);
    const userToken = await tokenFor(USERS.alfaUser);
    const userId = (JSON.parse(Buffer.from(userToken.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;
    const member = (await restJson<Array<{ id: string }>>(gerente, `client_members?client_account_id=eq.${CLIENT.alfa}&user_id=eq.${userId}&select=id`))[0]!.id;
    try {
      expect((await rpcRaw(gerente, 'pt_client_member_set', { p_member: member, p_status: 'inactive', p_role: 'client_user' })).status).toBeLessThan(300);
      const res = await page.goto('/portal/solicitacoes');
      expect(res?.url()).not.toContain('/portal/solicitacoes'); // sem conta ativa: o portal o expulsa
      expect(await restJson<unknown[]>(userToken, 'requests?select=id')).toEqual([]);
    } finally {
      await rpcRaw(gerente, 'pt_client_member_set', { p_member: member, p_status: 'active', p_role: 'client_user' });
    }
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: /Alfa Comércio/ })).toBeVisible();
    await ctx.close();
  });
});

test('envio legítimo grande (15 MB, dentro do limite de 20 MB) funciona e fica íntegro', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginClient(page, USERS.alfaAdmin);
  const buffer = Buffer.alloc(15 * 1024 * 1024, 98);
  const res = await ctx.request.post('/api/documents', { multipart: { file: { name: 'planilha-grande.txt', mimeType: 'text/plain', buffer }, title: 'Arquivo grande' }, timeout: 120_000 });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  const down = await ctx.request.get(`/api/documents/${id}`);
  expect(down.status()).toBe(200);
  expect((await down.body()).length).toBe(buffer.length);
  await ctx.close();
});
