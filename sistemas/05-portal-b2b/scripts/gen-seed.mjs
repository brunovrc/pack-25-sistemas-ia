#!/usr/bin/env node
// Gera supabase/seed.sql (dados de DEMONSTRAÇÃO, fictícios e determinísticos). Rode: node scripts/gen-seed.mjs
// A agência «Agência Horizonte Digital» (prestadora) atende três empresas fictícias: Alfa, Beta e Gama.
// Aqui nascem os FATOS (solicitações, conversas, entregas, documentos, comunicados). Prazos de SLA são calculados pela mesma função
// do sistema (pt_add_business_hours); nenhum indicador do painel é digitado à mão.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoFile } from './demo-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let seed = 20270501;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const chance = (p) => rnd() < p;
const sq = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

export const ORG = 'a5a5a5a5-0000-4000-8000-000000000001';
const U = { dono: '0a1', gerente: '0a2', colab1: '0a3', colab2: '0a4', leitor: '0a5' }; // staff
const CU = { alfaAdmin: '0c1', alfaUser: '0c2', betaAdmin: '0c3', betaUser: '0c4', gamaAdmin: '0c5' }; // clientes
const uid = (k) => `a5a5a5a5-0000-4000-8000-000000000${k}`;
const CLIENTS = [
  { n: 1, name: 'Alfa Comércio de Alimentos', legal: 'Alfa Comércio de Alimentos Ltda', doc: '11222333000181', email: 'contato@alfa.exemplo', phone: '(11) 4000-1001', status: 'active', manager: U.gerente, reqs: 26 },
  { n: 2, name: 'Beta Engenharia', legal: 'Beta Engenharia e Projetos S.A.', doc: '45723174000110', email: 'contato@beta.exemplo', phone: '(21) 4000-2002', status: 'active', manager: U.colab1, reqs: 18 },
  { n: 3, name: 'Gama Clínica Odontológica', legal: 'Gama Serviços Odontológicos Ltda', doc: '11444777000161', email: 'contato@gama.exemplo', phone: '(31) 4000-3003', status: 'active', manager: null, reqs: 10 },
];
const clientId = (n) => `a5a5a5a5-1000-4000-8000-${String(n).padStart(12, '0')}`;
const docId = (i) => `a5a5a5a5-4000-4000-8000-${String(i).padStart(12, '0')}`;

const STAFF_WORKERS = [U.gerente, U.colab1, U.colab2];
const CLIENT_AUTHORS = { 1: [CU.alfaAdmin, CU.alfaUser], 2: [CU.betaAdmin, CU.betaUser], 3: [CU.gamaAdmin] };
const CATS = ['Suporte', 'Dúvida', 'Nova demanda', 'Documentos', 'Financeiro', 'Outros'];
const SLA = { low: 80, normal: 40, high: 16, urgent: 4 };

const TITLES = {
  Suporte: ['Ajuste no banner da home', 'Erro no formulário de contato', 'Site fora do ar em horário de pico', 'Pixel de rastreamento não dispara', 'E-mail de boas-vindas com layout quebrado', 'Correção de link na newsletter'],
  Dúvida: ['Como acompanhar o desempenho da campanha?', 'Qual o prazo de publicação dos posts?', 'Dúvida sobre o relatório mensal', 'Quais formatos de imagem vocês aceitam?'],
  'Nova demanda': ['Criar landing page da promoção de aniversário', 'Série de posts para o lançamento', 'Novo material institucional (PDF)', 'Campanha de e-mail marketing de reativação', 'Vídeo curto para redes sociais', 'Redesenho do cartão de visita'],
  Documentos: ['Enviar contrato assinado', 'Solicitar segunda via da proposta', 'Atualizar cadastro da empresa', 'Briefing da campanha de fim de ano'],
  Financeiro: ['Dúvida sobre a nota de setembro', 'Alterar dados de cobrança', 'Reajuste do contrato anual'],
  Outros: ['Reunião de alinhamento trimestral', 'Sugestão de melhoria no atendimento'],
};
const BODIES_CLIENT = ['Podem verificar com urgência? Estamos com evento amanhã.', 'Enviei os arquivos pedidos em anexo.', 'Perfeito, pode seguir com essa opção.', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'Obrigado pelo retorno! Fico no aguardo.', 'Aprovado. Pode publicar.'];
const BODIES_STAFF = ['Recebemos sua solicitação e já estamos analisando.', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'Enviamos uma primeira versão para sua avaliação.', 'Combinamos o prazo de entrega para o final da semana.', 'Publicado conforme combinado. Qualquer ajuste, é só responder aqui.'];
const BODIES_INTERNAL = ['Cliente sensível a prazo: priorizar.', 'Conferir com o time de design antes de responder.', 'Orçamento extra necessário, falar com o gestor da conta.', 'Reincidência do mesmo problema: abrir tarefa interna.'];

// ----------------------------------------------------------------- solicitações
const reqs = [];
let ri = 1;
for (const c of CLIENTS) {
  for (let k = 0; k < c.reqs; k += 1) {
    const cat = pick(CATS);
    const prio = chance(0.08) ? 'urgent' : chance(0.25) ? 'high' : chance(0.2) ? 'low' : 'normal';
    const ago = k < 3 ? int(0, 4) : k < 9 ? int(5, 30) : int(20, 118); // as últimas ficam abertas; as antigas, em sua maioria, concluídas
    const draw = rnd();
    let status;
    if (ago <= 4) status = pick(['open', 'open', 'in_review', 'in_progress', 'waiting_provider']);
    else if (ago <= 14) status = pick(['in_progress', 'waiting_client', 'waiting_provider', 'in_review', 'completed', 'completed', 'completed']);
    else status = draw < 0.88 ? 'completed' : 'cancelled';
    const resolve = status === 'completed' ? Math.max(3, Math.round(SLA[prio] * (0.4 + rnd() * 2.4) * 1.9)) : 0; // horas corridas até concluir (parte dentro, parte fora do prazo)
    reqs.push({
      i: ri, client: c.n, cat, prio, ago, status, resolve, title: `${pick(TITLES[cat])}`, assignee: status === 'open' && chance(0.5) ? null : pick(STAFF_WORKERS), by: pick(CLIENT_AUTHORS[c.n]),
      reopened: status === 'completed' && chance(0.07) ? 1 : 0, comments: int(0, 5),
    });
    ri += 1;
  }
}
// casos para o painel de alertas (determinísticos): atrasada, vence em breve, parada, sem responsável
const special = [
  { cl: 1, title: 'Relatório mensal ainda não recebido', prio: 'high', ago: 14, status: 'in_progress', who: U.colab1, note: 'overdue' },
  { cl: 2, title: 'Aprovar arte do outdoor', prio: 'urgent', ago: 1, status: 'waiting_provider', who: U.colab2, note: 'soon' },
  { cl: 1, title: 'Cadastro de novos produtos no catálogo', prio: 'normal', ago: 16, status: 'in_review', who: U.gerente, note: 'stale' },
  { cl: 3, title: 'Preciso de ajuda com a campanha de Black Friday', prio: 'high', ago: 0, status: 'open', who: null, note: 'unassigned' },
];
for (const s of special) {
  reqs.push({ i: ri, client: s.cl, cat: 'Suporte', prio: s.prio, ago: s.ago, status: s.status, resolve: 0, title: s.title, assignee: s.who, by: pick(CLIENT_AUTHORS[s.cl]), reopened: 0, comments: s.note === 'stale' ? 1 : 2, note: s.note });
  ri += 1;
}

// ----------------------------------------------------------------- documentos (arquivos reais são enviados por scripts/seed-files.mjs)
const KINDS = [
  ['Contrato de prestação de serviços', 'pdf', 'application/pdf'], ['Proposta comercial', 'pdf', 'application/pdf'], ['Relatório mensal de desempenho', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['Briefing da campanha', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['Identidade visual (logotipo)', 'png', 'image/png'], ['Roteiro dos vídeos', 'txt', 'text/plain'],
];
const docs = [];
let di = 1;
const folders = [];
let fi = 1;
for (const c of CLIENTS) {
  const fContracts = fi++, fReports = fi++, fInternal = fi++;
  folders.push({ i: fContracts, client: c.n, name: 'Contratos e propostas', parent: null, vis: 'client' }, { i: fReports, client: c.n, name: 'Relatórios mensais', parent: null, vis: 'client' }, { i: fInternal, client: c.n, name: 'Material interno da agência', parent: null, vis: 'internal' });
  KINDS.forEach(([title, ext, mime], k) => {
    const internal = k === 5; // o roteiro é interno
    docs.push({ i: di++, client: c.n, folder: k < 2 ? fContracts : k === 2 ? fReports : internal ? fInternal : null, title: `${title} — ${c.name.split(' ')[0]}`, ext, mime, vis: internal ? 'internal' : 'client', by: k === 3 || k === 4 ? pick(CLIENT_AUTHORS[c.n]) : U.colab1, ago: int(2, 90), size: 0 });
  });
  docs.slice(-KINDS.length).forEach((d) => {
    d.size = demoFile(d.ext, d.title).length;
  });
}
// entregas
const DELIVS = [];
let dli = 1;
for (const c of CLIENTS) {
  const mine = reqs.filter((r) => r.client === c.n && r.status === 'completed').slice(0, 3);
  mine.forEach((r, k) => {
    DELIVS.push({ i: dli++, client: c.n, req: r.i, title: `Entrega: ${r.title}`, status: k === 0 ? 'acknowledged' : k === 1 ? 'published' : 'draft', ago: Math.max(1, r.ago - 2), doc: docs.find((d) => d.client === c.n && d.ext === 'pdf' && d.vis === 'client' && !DELIVS.some((x) => x.doc === d.i))?.i ?? null });
  });
}

// ----------------------------------------------------------------- SQL
const reqRows = reqs.map((r) => `(${r.i}, ${r.client}, ${sq(r.cat)}, ${sq(r.prio)}, ${r.ago}, ${sq(r.status)}, ${r.resolve}, ${sq(r.title)}, ${r.assignee ? sq(uid(r.assignee)) : 'null'}, ${sq(uid(r.by))}, ${r.reopened}, ${r.comments}, ${sq(r.note ?? null)})`);
const cmtTexts = (r) => Array.from({ length: r.comments }, (_, k) => {
  const fromClient = k % 2 === 0;
  const internal = !fromClient && chance(0.35);
  return { i: r.i, k, who: fromClient ? r.by : r.assignee ?? pick(STAFF_WORKERS), body: internal ? pick(BODIES_INTERNAL) : fromClient ? pick(BODIES_CLIENT) : pick(BODIES_STAFF), vis: internal ? 'internal' : 'shared' };
});
const cmtRows = reqs.flatMap(cmtTexts).map((c) => `(${c.i}, ${c.k}, ${sq(uid(c.who))}, ${sq(c.body)}, ${sq(c.vis)})`);
const folderRows = folders.map((f) => `(${f.i}, ${f.client}, ${sq(f.name)}, ${sq(f.vis)})`);
const docRows = docs.map((d) => `(${d.i}, ${d.client}, ${d.folder ?? 'null'}, ${sq(d.title)}, ${sq(d.ext)}, ${sq(d.mime)}, ${sq(d.vis)}, ${sq(uid(d.by))}, ${d.ago}, ${d.size})`);
const dlvRows = DELIVS.map((d) => `(${d.i}, ${d.client}, ${d.req}, ${sq(d.title)}, ${sq(d.status)}, ${d.ago}, ${d.doc ?? 'null'})`);

const sql = `-- ARQUIVO GERADO por scripts/gen-seed.mjs — NÃO edite à mão. Dados de DEMONSTRAÇÃO, fictícios e determinísticos.
-- Prestadora: «Agência Horizonte Digital». Usuários (senha local: DemoLocal#2026), todos @demo.exemplo:
--   equipe: dono@ (proprietário), gerente@ (gestor), colaborador1@, colaborador2@ (colaboradores), leitor@ (leitor);
--   clientes: alfa.admin@, alfa.usuario@, beta.admin@, beta.usuario@, gama.admin@.
-- Só valem em ambiente local/demonstração; nunca use este seed em produção. Os arquivos dos documentos vão ao Storage por «pnpm seed:files».
create or replace function pg_temp.d(n int, t time default time '12:00') returns timestamptz language sql stable as $f$
  select (((now() at time zone 'America/Sao_Paulo')::date - n)::timestamp + t) at time zone 'America/Sao_Paulo' $f$;

create temp table seed_r (i int, client int, cat text, prio text, ago int, status text, resolve int, title text, assignee uuid, by_user uuid, reopened int, ncomments int, note text) on commit drop;
create temp table seed_c (i int, k int, who uuid, body text, vis text) on commit drop;
create temp table seed_f (i int, client int, name text, vis text) on commit drop;
create temp table seed_d (i int, client int, folder int, title text, ext text, mime text, vis text, by_user uuid, ago int, size int) on commit drop;
create temp table seed_l (i int, client int, req int, title text, status text, ago int, doc int) on commit drop;

insert into seed_r values
  ${reqRows.join(',\n  ')};
insert into seed_c values
  ${cmtRows.join(',\n  ')};
insert into seed_f values
  ${folderRows.join(',\n  ')};
insert into seed_d values
  ${docRows.join(',\n  ')};
insert into seed_l values
  ${dlvRows.join(',\n  ')};

do $seed$
declare
  org uuid := '${ORG}';
  pw text := extensions.crypt('DemoLocal#2026', extensions.gen_salt('bf'));
  tz text := 'America/Sao_Paulo';
begin
  if exists (select 1 from public.organizations where id = org) then
    return; -- já semeado
  end if;

  -- ---------------------------------------------------------------- usuários
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email, pw, now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v.nome), now(), now(), '', '', '', ''
  from (values
    ('${uid(U.dono)}', 'dono@demo.exemplo', 'Helena Proprietária'), ('${uid(U.gerente)}', 'gerente@demo.exemplo', 'Rafael Gestor'), ('${uid(U.colab1)}', 'colaborador1@demo.exemplo', 'Camila Atendimento'),
    ('${uid(U.colab2)}', 'colaborador2@demo.exemplo', 'Diego Criação'), ('${uid(U.leitor)}', 'leitor@demo.exemplo', 'Lívia Leitora'),
    ('${uid(CU.alfaAdmin)}', 'alfa.admin@demo.exemplo', 'Ana Alfa'), ('${uid(CU.alfaUser)}', 'alfa.usuario@demo.exemplo', 'Alberto Alfa'),
    ('${uid(CU.betaAdmin)}', 'beta.admin@demo.exemplo', 'Beatriz Beta'), ('${uid(CU.betaUser)}', 'beta.usuario@demo.exemplo', 'Bruno Beta'), ('${uid(CU.gamaAdmin)}', 'gama.admin@demo.exemplo', 'Gabriela Gama')
  ) as v(id, email, nome);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.email, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u where u.email like '%@demo.exemplo';
  update public.profiles p set full_name = u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p.id and u.email like '%@demo.exemplo';

  -- ---------------------------------------------------------------- prestadora (configurações, categorias e SLAs nascem por gatilho)
  insert into public.organizations (id, name, slug) values (org, 'Agência Horizonte Digital (dados fictícios)', 'horizonte');
  insert into public.organization_settings (organization_id, display_name, theme) values (org, 'Agência Horizonte Digital', '{"primary":"#0f4c81"}'::jsonb);
  update public.portal_settings set portal_name = 'Portal Horizonte', welcome_message = 'Aqui você acompanha seus pedidos, recebe as entregas da agência e acessa seus documentos com segurança.',
    footer_text = 'Agência Horizonte Digital — atendimento de segunda a sexta, das 9h às 18h.', contact_email = 'atendimento@horizonte.exemplo', contact_phone = '(11) 4000-0000', primary_color = '#0F4C81', secondary_color = '#F59E0B'
   where organization_id = org;
  insert into public.organization_members (organization_id, user_id, role) values
    (org, '${uid(U.dono)}', 'owner'), (org, '${uid(U.gerente)}', 'manager'), (org, '${uid(U.colab1)}', 'member'), (org, '${uid(U.colab2)}', 'member'), (org, '${uid(U.leitor)}', 'viewer');

  -- Carga em massa dos FATOS históricos sem acionar gatilhos de imutabilidade (a auditoria não registra a carga).
  set local session_replication_role = replica;

  insert into public.client_accounts (id, organization_id, name, legal_name, document_number, email, phone, status, assigned_manager_id, created_at, updated_at) values
    ${CLIENTS.map((c) => `('${clientId(c.n)}', org, ${sq(c.name)}, ${sq(c.legal)}, ${sq(c.doc)}, ${sq(c.email)}, ${sq(c.phone)}, ${sq(c.status)}, ${c.manager ? sq(uid(c.manager)) : 'null'}, pg_temp.d(130), pg_temp.d(130))`).join(',\n    ')};
  insert into public.client_internal_notes (client_account_id, organization_id, notes, updated_by) values
    ('${clientId(1)}', org, 'Cliente estratégico. Prefere contato por e-mail. Renovação do contrato em dezembro.', '${uid(U.gerente)}'),
    ('${clientId(2)}', org, 'Costuma pedir ajustes de última hora; alinhar prazos com antecedência.', '${uid(U.colab1)}');
  insert into public.client_members (organization_id, client_account_id, user_id, role, status, invited_at, joined_at, created_at) values
    (org, '${clientId(1)}', '${uid(CU.alfaAdmin)}', 'client_admin', 'active', pg_temp.d(125), pg_temp.d(124), pg_temp.d(124)), (org, '${clientId(1)}', '${uid(CU.alfaUser)}', 'client_user', 'active', pg_temp.d(100), pg_temp.d(99), pg_temp.d(99)),
    (org, '${clientId(2)}', '${uid(CU.betaAdmin)}', 'client_admin', 'active', pg_temp.d(120), pg_temp.d(119), pg_temp.d(119)), (org, '${clientId(2)}', '${uid(CU.betaUser)}', 'client_user', 'active', pg_temp.d(90), pg_temp.d(89), pg_temp.d(89)),
    (org, '${clientId(3)}', '${uid(CU.gamaAdmin)}', 'client_admin', 'active', pg_temp.d(60), pg_temp.d(59), pg_temp.d(59));

  -- ---------------------------------------------------------------- solicitações, prazos (SLA em horas úteis), histórico e conversa
  insert into public.requests (id, organization_id, client_account_id, number, category_id, title, description, status, priority, created_by, assigned_to, due_at, due_kind, started_at, completed_at, closed_at, reopened_count, last_activity_at, created_at, updated_at)
  select ('a5a5a5a5-2000-4000-8000-' || lpad(r.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(r.client::text, 12, '0'))::uuid, r.i,
         (select id from public.service_categories sc where sc.organization_id = org and sc.name = r.cat), r.title,
         'Descrição de demonstração da solicitação «' || r.title || '». Contexto, resultado esperado e prazo desejado.', r.status::public.pt_request_status, r.prio::public.pt_priority, r.by_user, r.assignee,
         case when r.note = 'soon' then now() + interval '10 hours' else public.pt_add_business_hours(pg_temp.d(r.ago, time '10:00'), (select target_hours from public.service_level_policies p where p.organization_id = org and p.priority = r.prio::public.pt_priority), tz, '{1,2,3,4,5}', time '09:00', time '18:00') end,
         case when r.note = 'soon' then 'agreed' else 'policy' end,
         case when r.status in ('in_progress', 'waiting_client', 'waiting_provider', 'completed') then pg_temp.d(r.ago, time '14:00') end,
         case when r.status = 'completed' then least(now() - interval '1 hour', pg_temp.d(r.ago, time '10:00') + make_interval(hours => r.resolve)) end,
         case when r.status = 'cancelled' then pg_temp.d(greatest(r.ago - 1, 0), time '15:00') end, r.reopened,
         case when r.note = 'stale' then pg_temp.d(12) when r.status = 'completed' then least(now() - interval '1 hour', pg_temp.d(r.ago, time '10:00') + make_interval(hours => r.resolve)) else greatest(pg_temp.d(r.ago, time '10:00'), now() - make_interval(hours => (r.i * 7) % 60)) end,
         pg_temp.d(r.ago, time '10:00'), pg_temp.d(r.ago, time '10:00')
  from seed_r r;
  update public.request_counters set last_number = (select max(i) from seed_r) where organization_id = org;

  insert into public.request_deadline_events (organization_id, client_account_id, request_id, policy_id, due_kind, target_at, reason, breached_at, changed_by, calculated_at)
  select org, rq.client_account_id, rq.id, case when rq.due_kind = 'policy' then (select p.id from public.service_level_policies p where p.organization_id = org and p.priority = rq.priority) end, rq.due_kind::text, rq.due_at,
         case when rq.due_kind = 'agreed' then 'Prazo combinado por telefone com o cliente.' end, case when rq.status = 'completed' and rq.completed_at > rq.due_at then rq.due_at end, rq.assigned_to, rq.created_at
  from public.requests rq where rq.organization_id = org;

  -- histórico de situação: criação + etapas até a situação atual
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, null, 'open', rq.created_by, null, rq.created_at from public.requests rq where rq.organization_id = org;
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'open', 'in_review', coalesce(rq.assigned_to, '${uid(U.gerente)}'), null, rq.created_at + interval '2 hours'
  from public.requests rq where rq.organization_id = org and rq.status <> 'open';
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_review', 'in_progress', coalesce(rq.assigned_to, '${uid(U.gerente)}'), null, rq.created_at + interval '6 hours'
  from public.requests rq where rq.organization_id = org and rq.status in ('in_progress', 'waiting_client', 'waiting_provider', 'completed');
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_progress', rq.status, coalesce(rq.assigned_to, '${uid(U.gerente)}'), null, rq.last_activity_at
  from public.requests rq where rq.organization_id = org and rq.status in ('waiting_client', 'waiting_provider');
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_progress', 'completed', coalesce(rq.assigned_to, '${uid(U.gerente)}'), null, rq.completed_at from public.requests rq where rq.organization_id = org and rq.status = 'completed';
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_review', 'cancelled', rq.created_by, 'Não precisamos mais deste pedido.', rq.closed_at from public.requests rq where rq.organization_id = org and rq.status = 'cancelled';

  -- conversa: comentários compartilhados e notas internas
  insert into public.request_comments (organization_id, client_account_id, request_id, author_id, body, visibility, created_at)
  select org, rq.client_account_id, rq.id, c.who, c.body, c.vis::public.pt_comment_visibility, rq.created_at + (c.k + 1) * interval '5 hours'
  from seed_c c join public.requests rq on rq.id = ('a5a5a5a5-2000-4000-8000-' || lpad(c.i::text, 12, '0'))::uuid
  where rq.created_at + (c.k + 1) * interval '5 hours' < now();

  -- ---------------------------------------------------------------- documentos e pastas (os arquivos reais são enviados por «pnpm seed:files»)
  insert into public.document_folders (id, organization_id, client_account_id, parent_folder_id, name, visibility, created_by, created_at)
  select ('a5a5a5a5-3000-4000-8000-' || lpad(f.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(f.client::text, 12, '0'))::uuid, null, f.name, f.vis::public.pt_visibility, '${uid(U.gerente)}', pg_temp.d(120) from seed_f f;
  insert into public.documents (id, organization_id, client_account_id, folder_id, title, description, original_file_name, storage_path, mime_type, size_bytes, visibility, uploaded_by, created_at)
  select ('a5a5a5a5-4000-4000-8000-' || lpad(d.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(d.client::text, 12, '0'))::uuid,
         case when d.folder is null then null else ('a5a5a5a5-3000-4000-8000-' || lpad(d.folder::text, 12, '0'))::uuid end, d.title, 'Documento de demonstração (conteúdo fictício).',
         lower(regexp_replace(translate(d.title, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc' || 'AAAAEEIOOOUC'), '[^A-Za-z0-9]+', '-', 'g')) || '.' || d.ext,
         org::text || '/a5a5a5a5-1000-4000-8000-' || lpad(d.client::text, 12, '0') || '/a5a5a5a5-4000-4000-8000-' || lpad(d.i::text, 12, '0'), d.mime, d.size, d.vis::public.pt_visibility, d.by_user, pg_temp.d(d.ago)
  from seed_d d;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action, occurred_at)
  select org, dc.client_account_id, dc.id, dc.uploaded_by, 'upload', dc.created_at from public.documents dc where dc.organization_id = org;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action, occurred_at)
  select org, dc.client_account_id, dc.id, case when dc.client_account_id = '${clientId(1)}' then '${uid(CU.alfaAdmin)}'::uuid when dc.client_account_id = '${clientId(2)}' then '${uid(CU.betaAdmin)}'::uuid else '${uid(CU.gamaAdmin)}'::uuid end, 'download', dc.created_at + interval '1 day'
  from public.documents dc where dc.organization_id = org and dc.visibility = 'client' and dc.created_at + interval '1 day' < now();
  -- alguns anexos de solicitações
  insert into public.request_attachments (organization_id, client_account_id, request_id, document_id)
  select org, d.client_account_id, rq.id, d.id
  from (select dd.*, row_number() over (partition by dd.client_account_id order by dd.created_at) as n from public.documents dd where dd.organization_id = org and dd.visibility = 'client') d
  join lateral (select r2.id from public.requests r2 where r2.client_account_id = d.client_account_id order by r2.number offset (d.n::int) limit 1) rq on true where d.n <= 3;

  -- ---------------------------------------------------------------- entregas
  insert into public.deliverables (id, organization_id, client_account_id, request_id, title, description, status, delivered_at, published_by, acknowledged_at, acknowledged_by, created_by, created_at, updated_at)
  select ('a5a5a5a5-5000-4000-8000-' || lpad(l.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(l.client::text, 12, '0'))::uuid, ('a5a5a5a5-2000-4000-8000-' || lpad(l.req::text, 12, '0'))::uuid,
         l.title, 'Material pronto para uso. Confira os arquivos e confirme o recebimento.', l.status::public.pt_deliverable_status,
         case when l.status in ('published', 'acknowledged') then pg_temp.d(l.ago) end, case when l.status in ('published', 'acknowledged') then '${uid(U.colab1)}'::uuid end,
         case when l.status = 'acknowledged' then pg_temp.d(greatest(l.ago - 1, 0)) end,
         case when l.status = 'acknowledged' then (select m.user_id from public.client_members m where m.client_account_id = ('a5a5a5a5-1000-4000-8000-' || lpad(l.client::text, 12, '0'))::uuid and m.role = 'client_admin' limit 1) end,
         '${uid(U.colab1)}', pg_temp.d(l.ago + 1), pg_temp.d(l.ago)
  from seed_l l;
  insert into public.deliverable_files (organization_id, client_account_id, deliverable_id, document_id)
  select org, dv.client_account_id, dv.id, ('a5a5a5a5-4000-4000-8000-' || lpad(l.doc::text, 12, '0'))::uuid
  from seed_l l join public.deliverables dv on dv.id = ('a5a5a5a5-5000-4000-8000-' || lpad(l.i::text, 12, '0'))::uuid where l.doc is not null;

  -- ---------------------------------------------------------------- comunicados
  insert into public.announcements (id, organization_id, title, body, audience, published_at, expires_at, notified_at, created_by, created_at, updated_at) values
    ('a5a5a5a5-6000-4000-8000-000000000001', org, 'Recesso de fim de ano', 'Entre 24/12 e 02/01 o atendimento funciona em horário reduzido. Pedidos urgentes continuam sendo atendidos pelo portal.', 'all', pg_temp.d(10), null, pg_temp.d(10), '${uid(U.gerente)}', pg_temp.d(10), pg_temp.d(10)),
    ('a5a5a5a5-6000-4000-8000-000000000002', org, 'Nova ferramenta de relatórios para Alfa e Beta', 'A partir deste mês os relatórios mensais passam a ser publicados como entregas no portal. Você é avisado a cada publicação.', 'selected', pg_temp.d(4), null, pg_temp.d(4), '${uid(U.gerente)}', pg_temp.d(4), pg_temp.d(4)),
    ('a5a5a5a5-6000-4000-8000-000000000003', org, 'Pesquisa de satisfação (encerrada)', 'Obrigado a todos que responderam! Os resultados serão compartilhados em breve.', 'all', pg_temp.d(60), pg_temp.d(30), pg_temp.d(60), '${uid(U.gerente)}', pg_temp.d(60), pg_temp.d(60));
  insert into public.announcement_recipients (announcement_id, client_account_id, organization_id) values
    ('a5a5a5a5-6000-4000-8000-000000000002', '${clientId(1)}', org), ('a5a5a5a5-6000-4000-8000-000000000002', '${clientId(2)}', org);

  set local session_replication_role = origin;

  -- ---------------------------------------------------------------- avisos: rotina do sistema (prazos próximos/vencidos) + alguns avisos de conversa
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '${uid(U.dono)}', 'aal', 'aal2')::text, true);
  perform public.pt_refresh(org);
  perform set_config('request.jwt.claims', '', true);
  insert into public.notifications (organization_id, client_account_id, user_id, type, title, body, resource_type, resource_id, dedup_key, created_at)
  select org, rq.client_account_id, m.user_id, 'request_comment', 'Nova resposta na solicitação #' || rq.number, rq.title, 'request', rq.id, 'seed:' || rq.id || ':' || m.user_id, now() - interval '3 hours'
  from public.requests rq join public.client_members m on m.client_account_id = rq.client_account_id and m.role = 'client_admin'
  where rq.organization_id = org and rq.status = 'waiting_client' limit 6;
end
$seed$;
`;

writeFileSync(join(root, 'supabase', 'seed.sql'), sql);
writeFileSync(join(root, 'scripts', 'seed-files.json'), JSON.stringify(docs.map((d) => ({ id: docId(d.i), client: clientId(d.client), org: ORG, ext: d.ext, mime: d.mime, title: d.title })), null, 2));
console.log(`seed.sql: ${CLIENTS.length} clientes, ${reqs.length} solicitações, ${docs.length} documentos, ${DELIVS.length} entregas.`);
