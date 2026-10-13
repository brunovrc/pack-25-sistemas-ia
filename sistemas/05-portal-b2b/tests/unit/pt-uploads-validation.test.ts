import { describe, expect, it } from 'vitest';
import { assigneeRows, clientRows, flowRows, priorityRows, statusRows } from '@/lib/portal/chart-rows';
import { safeFileName, sniffMime, titleFromFile } from '@/lib/portal/uploads';
import { announcementSchema, clientAccountSchema, commentSchema, dueSchema, inviteSchema, inviteTokenSchema, portalSettingsSchema, requestCreateSchema } from '@/lib/portal/validation';
// geradores dos arquivos de demonstração: servem aqui como exemplos VÁLIDOS de cada formato
import { demoDocx, demoPdf, demoPng, demoTxt, demoXlsx } from '@/scripts/demo-files.mjs';

const bytes = (s: string) => new TextEncoder().encode(s);
const uuid = '11111111-2222-4333-8444-555555555555';

describe('tipo REAL do arquivo (assinatura), não o declarado', () => {
  it('aceita arquivos válidos de cada tipo permitido', () => {
    expect(sniffMime(demoPdf('t'), 'a.pdf')).toBe('application/pdf');
    expect(sniffMime(demoPng(), 'a.png')).toBe('image/png');
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'foto.JPG')).toBe('image/jpeg');
    expect(sniffMime(demoTxt('t'), 'nota.txt')).toBe('text/plain');
    expect(sniffMime(demoDocx('t'), 'a.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(sniffMime(demoXlsx('t'), 'a.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
  it('recusa executável, HTML e script disfarçados com extensão permitida', () => {
    expect(sniffMime(bytes('MZ\x90\x00 programa'), 'fatura.pdf')).toBeNull();
    expect(sniffMime(bytes('<html><script>alert(1)</script>'), 'pagina.png')).toBeNull();
    expect(sniffMime(bytes('#!/bin/sh\nrm -rf /'), 'x.jpg')).toBeNull();
    expect(sniffMime(bytes('%PDF-1.4'), 'x.png')).toBeNull(); // PDF verdadeiro com extensão de imagem
  });
  it('um arquivo de Word não passa por Excel e vice-versa; ZIP qualquer não é Office', () => {
    expect(sniffMime(demoDocx('t'), 'a.xlsx')).toBeNull();
    expect(sniffMime(demoXlsx('t'), 'a.docx')).toBeNull();
    expect(sniffMime(bytes('PK\x03\x04 qualquer coisa sem estrutura office'), 'a.docx')).toBeNull();
  });
  it('texto: sem bytes de controle e UTF-8 válido', () => {
    expect(sniffMime(bytes('olá, mundo ✓\nlinha 2\r\n'), 'a.txt')).toBe('text/plain');
    expect(sniffMime(new Uint8Array([0x61, 0x00, 0x62]), 'a.txt')).toBeNull(); // byte nulo
    expect(sniffMime(new Uint8Array([0xc3, 0x28]), 'a.txt')).toBeNull(); // UTF-8 inválido
  });
  it('extensões fora da lista e sem extensão são recusadas', () => {
    for (const n of ['a.exe', 'a.svg', 'a.html', 'a.js', 'a.zip', 'a', 'a.pdf.exe']) expect(sniffMime(demoPdf('t'), n), n).toBeNull();
  });
  it('nome de arquivo seguro: sem caminho, sem controle, sem pontos iniciais', () => {
    expect(safeFileName('../../etc/passwd')).toBe('.._.._etc_passwd'.replace(/^\.+/, ''));
    expect(safeFileName('C:\\Users\\x\\rel.pdf')).toBe('C:_Users_x_rel.pdf');
    expect(safeFileName('a\u0000b\u001f.txt')).toBe('ab.txt');
    expect(safeFileName('   ')).toBe('arquivo');
    expect(safeFileName('x'.repeat(500)).length).toBe(200);
    expect(titleFromFile('Relatório de abril.final.pdf')).toBe('Relatório de abril.final');
  });
});

describe('validações compartilhadas (navegador e servidor)', () => {
  it('CNPJ/CPF: dígitos verificadores', () => {
    const ok = clientAccountSchema.safeParse({ name: 'Empresa', document_number: '11.222.333/0001-81' });
    expect(ok.success && ok.data.document_number).toBe('11222333000181');
    expect(clientAccountSchema.safeParse({ name: 'Empresa', document_number: '529.982.247-25' }).success).toBe(true);
    expect(clientAccountSchema.safeParse({ name: 'Empresa', document_number: '11.222.333/0001-82' }).success).toBe(false);
    expect(clientAccountSchema.safeParse({ name: 'Empresa', document_number: '111.111.111-11' }).success).toBe(false);
    expect(clientAccountSchema.safeParse({ name: 'Empresa', document_number: '' }).success).toBe(true);
    expect(clientAccountSchema.safeParse({ name: 'E' }).success).toBe(false);
    expect(clientAccountSchema.safeParse({ name: 'Empresa', email: 'sem-arroba' }).success).toBe(false);
  });
  it('solicitação: título mínimo, prioridade e UUIDs', () => {
    expect(requestCreateSchema.safeParse({ client: uuid, title: 'Ok!' }).success).toBe(true);
    expect(requestCreateSchema.safeParse({ client: uuid, title: 'ab' }).success).toBe(false);
    expect(requestCreateSchema.safeParse({ client: 'x', title: 'Título válido' }).success).toBe(false);
    expect(requestCreateSchema.safeParse({ client: uuid, title: 'Título válido', priority: 'critica' }).success).toBe(false);
    expect(requestCreateSchema.safeParse({ client: uuid, title: 'Título válido', category: '', assigned_to: '' }).success).toBe(true);
  });
  it('comentário: vazio e só espaços são recusados; visibilidade padrão compartilhada', () => {
    expect(commentSchema.safeParse({ body: '   ' }).success).toBe(false);
    const c = commentSchema.safeParse({ body: ' olá ' });
    expect(c.success && c.data).toEqual({ body: 'olá', visibility: 'shared' });
    expect(commentSchema.safeParse({ body: 'x'.repeat(5001) }).success).toBe(false);
    expect(commentSchema.safeParse({ body: 'x', visibility: 'secreta' }).success).toBe(false);
  });
  it('prazo: data, hora e motivo obrigatórios', () => {
    expect(dueSchema.safeParse({ date: '2026-10-20', time: '17:30', kind: 'agreed', reason: 'Combinado' }).success).toBe(true);
    expect(dueSchema.safeParse({ date: '20/10/2026', time: '17:30', kind: 'agreed', reason: 'Combinado' }).success).toBe(false);
    expect(dueSchema.safeParse({ date: '2026-10-20', time: '25:00', kind: 'agreed', reason: 'Combinado' }).success).toBe(false);
    expect(dueSchema.safeParse({ date: '2026-10-20', time: '17:30', kind: 'policy', reason: 'Combinado' }).success).toBe(false);
    expect(dueSchema.safeParse({ date: '2026-10-20', time: '17:30', kind: 'agreed', reason: '' }).success).toBe(false);
  });
  it('convite: papel compatível com o tipo, e-mail normalizado, empresa obrigatória para cliente', () => {
    const ok = inviteSchema.safeParse({ kind: 'client', client: uuid, email: ' Pessoa@Exemplo.COM ', role: 'client_user' });
    expect(ok.success && ok.data.email).toBe('pessoa@exemplo.com');
    expect(inviteSchema.safeParse({ kind: 'client', client: uuid, email: 'a@b.co', role: 'admin' }).success).toBe(false);
    expect(inviteSchema.safeParse({ kind: 'staff', client: '', email: 'a@b.co', role: 'client_admin' }).success).toBe(false);
    expect(inviteSchema.safeParse({ kind: 'client', client: '', email: 'a@b.co', role: 'client_user' }).success).toBe(false);
    expect(inviteSchema.safeParse({ kind: 'staff', client: '', email: 'a@b.co', role: 'manager' }).success).toBe(true);
  });
  it('token de convite: só o alfabeto base64url e tamanho plausível', () => {
    expect(inviteTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    for (const t of ['curto', 'A'.repeat(200), 'com espaço com espaço com', "'; drop table--------", '../../../../etc/passwd/x']) expect(inviteTokenSchema.safeParse(t).success, t).toBe(false);
  });
  it('comunicado dirigido exige ao menos um cliente', () => {
    const base = { title: 'Aviso', body: 'Texto' };
    expect(announcementSchema.safeParse({ ...base, audience: 'all' }).success).toBe(true);
    expect(announcementSchema.safeParse({ ...base, audience: 'selected', recipients: [] }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, audience: 'selected', recipients: [uuid] }).success).toBe(true);
  });
  it('configurações: cores, fuso, expediente e limites', () => {
    const base = { portal_name: 'Portal', primary_color: '#0F4C81', secondary_color: '#F59E0B', timezone: 'America/Sao_Paulo', business_days: [1, 2, 3, 4, 5], business_start: '09:00', business_end: '18:00', alert_due_soon_hours: '24', alert_stale_days: '7', reopen_window_days: '15', doc_max_mb: '20' };
    expect(portalSettingsSchema.safeParse(base).success).toBe(true);
    expect(portalSettingsSchema.safeParse({ ...base, primary_color: 'azul' }).success).toBe(false);
    expect(portalSettingsSchema.safeParse({ ...base, primary_color: 'url(javascript:alert(1))' }).success).toBe(false);
    expect(portalSettingsSchema.safeParse({ ...base, timezone: 'Marte/Olympus' }).success).toBe(false);
    expect(portalSettingsSchema.safeParse({ ...base, business_start: '18:00', business_end: '09:00' }).success).toBe(false);
    expect(portalSettingsSchema.safeParse({ ...base, business_days: [] }).success).toBe(false);
    expect(portalSettingsSchema.safeParse({ ...base, doc_max_mb: '51' }).success).toBe(false);
    expect(portalSettingsSchema.safeParse({ ...base, doc_max_mb: '0' }).success).toBe(false);
  });
});

describe('linhas dos gráficos', () => {
  it('situações e prioridades em ordem fixa, com zeros', () => {
    const s = statusRows([{ status: 'completed', requests: 3 }, { status: 'open', requests: 1 }]);
    expect(s.map((r) => r.key)).toEqual(['open', 'in_review', 'in_progress', 'waiting_client', 'waiting_provider', 'completed', 'cancelled']);
    expect(s.find((r) => r.key === 'completed')?.value).toBe(3);
    expect(s.find((r) => r.key === 'cancelled')?.value).toBe(0);
    expect(priorityRows([{ priority: 'high', requests: 2 }]).map((r) => `${r.key}:${r.value}`)).toEqual(['low:0', 'normal:0', 'high:2', 'urgent:0']);
    expect(statusRows([], { waiting_client: 'Aguardando você' }).find((r) => r.key === 'waiting_client')?.name).toBe('Aguardando você');
  });
  it('série, responsáveis e clientes', () => {
    expect(flowRows([{ bucket: '2026-10-13', granularity: 'day', created: 2, completed: 1, on_time: 1, late: 0, avg_resolution_hours: null, deliverables_published: 0 }])).toEqual([{ label: '13/10', created: 2, completed: 1 }]);
    const labels = new Map([['u1', 'Camila']]);
    expect(assigneeRows([{ assignee_id: 'u1', open_requests: 2, completed: 3, avg_resolution_hours: 5, on_time_pct: 50 }, { assignee_id: null, open_requests: 1, completed: 0, avg_resolution_hours: null, on_time_pct: null }, { assignee_id: 'u9', open_requests: 0, completed: 1, avg_resolution_hours: 1, on_time_pct: 100 }], labels).map((r) => r.name)).toEqual(['Camila', 'Sem responsável', 'Usuário']);
    expect(clientRows([{ client_id: 'c', name: 'Uma empresa com nome realmente muito longo', created: 1, open_requests: 1, overdue: 0, completed: 0 }])[0]!.name.length).toBeLessThanOrEqual(22);
  });
});
