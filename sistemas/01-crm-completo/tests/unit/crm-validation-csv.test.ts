import { describe, expect, it } from 'vitest';
import { activitySchema, companySchema, contactSchema, goalSchema, leadSchema, opportunitySchema, stageSchema } from '@/lib/crm/validation';
import { csvNumber, csvText, int, normalizeHeader, parseLeadsCsv, toCsv } from '@/lib/crm/csv';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('leadSchema', () => {
  const base = { name: 'Maria Souza', company_name: '', email: '  MARIA@Empresa.com ', phone: '', job_title: '', source_id: '', status: 'new', temperature: 'warm', owner_id: '', notes: '' };
  it('normaliza e converte vazios em null', () => {
    const r = leadSchema.parse(base);
    expect(r.email).toBe('maria@empresa.com');
    expect(r.company_name).toBeNull();
    expect(r.source_id).toBeNull();
    expect(r.owner_id).toBeNull();
  });
  it('recusa dados inválidos', () => {
    expect(leadSchema.safeParse({ ...base, name: 'A' }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, email: 'sem-arroba' }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, status: 'converted' }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, source_id: 'nao-uuid' }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, notes: 'x'.repeat(4001) }).success).toBe(false);
  });
});

describe('companySchema: site só http(s) (sem javascript:)', () => {
  const base = { name: 'Lima & Filhos', document: '', website: '', segment: '', phone: '', notes: '', owner_id: '' };
  it('aceita http/https e vazio', () => {
    expect(companySchema.safeParse({ ...base, website: 'https://lima.com.br' }).success).toBe(true);
    expect(companySchema.safeParse({ ...base, website: '' }).success).toBe(true);
  });
  it.each(['javascript:alert(1)', 'ftp://x.com', 'lima.com.br', 'data:text/html,x', 'https://a b.com'])('recusa %j', (website) => {
    expect(companySchema.safeParse({ ...base, website }).success).toBe(false);
  });
});

describe('contactSchema', () => {
  it('empresa opcional e e-mail validado', () => {
    expect(contactSchema.safeParse({ company_id: '', name: 'Ana', email: '', phone: '', job_title: '', notes: '', owner_id: '' }).success).toBe(true);
    expect(contactSchema.safeParse({ company_id: UUID, name: 'Ana', email: 'x@y', phone: '', job_title: '', notes: '', owner_id: '' }).success).toBe(false);
  });
});

describe('opportunitySchema', () => {
  const base = { title: 'Projeto X', value: '1.500,50', stage_id: UUID, company_id: '', contact_id: '', source_id: '', expected_close_date: '2026-12-31', probability: '', owner_id: '', notes: '' };
  it('converte valor em reais para número', () => {
    const r = opportunitySchema.parse(base);
    expect(r.value).toBe(1500.5);
    expect(r.probability).toBeNull();
    expect(r.expected_close_date).toBe('2026-12-31');
  });
  it('recusa valor inválido, negativo, data impossível e probabilidade fora do limite', () => {
    expect(opportunitySchema.safeParse({ ...base, value: 'abc' }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...base, value: '' }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...base, value: '-5' }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...base, expected_close_date: '2026-02-30' }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...base, probability: '101' }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...base, probability: '50' }).success).toBe(true);
    expect(opportunitySchema.safeParse({ ...base, stage_id: '' }).success).toBe(false);
  });
});

describe('activitySchema', () => {
  const base = { kind: 'follow_up', title: 'Ligar', description: '', due_at: '', priority: 'high', owner_id: '', lead_id: '', contact_id: '', company_id: '', opportunity_id: '' };
  it('converte data/hora local de Brasília para ISO', () => {
    expect(activitySchema.parse({ ...base, due_at: '2026-09-30T23:59' }).due_at).toBe('2026-09-30T23:59:00-03:00');
    expect(activitySchema.parse(base).due_at).toBeNull();
  });
  it('recusa data inválida e tipo desconhecido', () => {
    expect(activitySchema.safeParse({ ...base, due_at: '30/09/2026' }).success).toBe(false);
    expect(activitySchema.safeParse({ ...base, kind: 'sms' }).success).toBe(false);
  });
});

describe('goalSchema', () => {
  const base = { scope: 'user', user_id: UUID, team_id: '', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: '5.000,00' };
  it('meta válida', () => {
    expect(goalSchema.parse(base).target_amount).toBe(5000);
  });
  it('exige vendedor ou equipe conforme o tipo, período coerente e meta positiva', () => {
    expect(goalSchema.safeParse({ ...base, user_id: '' }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, scope: 'team', user_id: '', team_id: '' }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, scope: 'team', user_id: '', team_id: UUID }).success).toBe(true);
    expect(goalSchema.safeParse({ ...base, period_end: '2026-08-31' }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, target_amount: '0' }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, period_end: '2040-01-01' }).success).toBe(false);
  });
});

describe('stageSchema', () => {
  it('cor opcional em #RRGGBB e limites', () => {
    const base = { name: 'Negociação', position: '40', probability: '75', kind: 'open', color: '', is_active: true };
    expect(stageSchema.parse(base).color).toBeNull();
    expect(stageSchema.parse({ ...base, color: '#AA2244' }).color).toBe('#aa2244');
    expect(stageSchema.safeParse({ ...base, color: 'red' }).success).toBe(false);
    expect(stageSchema.safeParse({ ...base, probability: '101' }).success).toBe(false);
    expect(stageSchema.safeParse({ ...base, position: '-1' }).success).toBe(false);
  });
});

describe('CSV: exportação segura', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x', '\r=x'])('neutraliza fórmula %j', (v) => {
    expect(csvText(v)).toBe(`"'${v}"`);
  });
  it('mantém texto comum e escapa aspas', () => {
    expect(csvText('Maria "Mi" Souza')).toBe('"Maria ""Mi"" Souza"');
    expect(csvText(null)).toBe('');
    expect(csvText('')).toBe('');
  });
  it('números com vírgula decimal e sem neutralização', () => {
    expect(csvNumber(1234.5)).toBe('1234,50');
    expect(csvNumber(-10)).toBe('-10,00');
    expect(csvNumber(null)).toBe('');
  });
  it('contagens saem como inteiros, sem casas decimais', () => {
    expect(toCsv(['n'], [[int(3)], [int(0)]])).toContain('\r\n3\r\n0\r\n');
  });
  it('monta CSV com BOM, separador ; e CRLF', () => {
    const out = toCsv(['Nome', 'Valor'], [['=x', 10], ['Ana', 0.5]]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toContain('"Nome";"Valor"\r\n');
    expect(out).toContain('"\'=x";10,00\r\n');
    expect(out).toContain('"Ana";0,50\r\n');
  });
});

describe('CSV: importação', () => {
  it('mapeia cabeçalhos em português e ignora colunas desconhecidas', () => {
    const r = parseLeadsCsv('Nome;E-mail;Telefone;Empresa;Origem;Cor Favorita\nAna;ana@x.com;1199;Alfa;Site;azul\n');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toEqual({ line: 2, values: { name: 'Ana', email: 'ana@x.com', phone: '1199', company_name: 'Alfa', source: 'Site' } });
      expect(r.unknownHeaders).toEqual(['Cor Favorita']);
    }
  });
  it('aceita vírgula, BOM e cabeçalhos com acento', () => {
    const r = parseLeadsCsv('\uFEFFnome,observações\nBia,"gosta de café, muito"\n');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]?.values).toEqual({ name: 'Bia', notes: 'gosta de café, muito' });
  });
  it('recusa arquivo sem nome, vazio, grande e com linhas demais', () => {
    expect(parseLeadsCsv('email\na@b.com\n')).toMatchObject({ ok: false });
    expect(parseLeadsCsv('nome\n')).toMatchObject({ ok: false });
    expect(parseLeadsCsv('nome\n' + 'x'.repeat(1_000_001))).toMatchObject({ ok: false });
    expect(parseLeadsCsv('nome\n' + Array.from({ length: 2001 }, (_, i) => `L${i}`).join('\n'))).toMatchObject({ ok: false });
    expect(parseLeadsCsv('nome\n' + Array.from({ length: 2000 }, (_, i) => `L${i}`).join('\n'))).toMatchObject({ ok: true });
  });
  it('preserva conteúdo malicioso como TEXTO (a defesa é na exportação)', () => {
    const r = parseLeadsCsv('nome\n=HYPERLINK("http://x")\n');
    if (r.ok) expect(r.rows[0]?.values.name).toBe('=HYPERLINK("http://x")');
  });
  it('normaliza cabeçalhos', () => {
    expect(normalizeHeader('  E-mail ')).toBe('e_mail');
    expect(normalizeHeader('Classificação')).toBe('classificacao');
  });
});
