-- Indicadores: KPIs, séries, distribuições, rankings e alertas, com expectativas calculadas à mão; fronteiras de dia/fuso; escopo de cada papel (equipe e cliente).
-- Prestadora A: MA (gestor), CA (colaborador). Clientes Alfa (UA1) e Beta (UB1). Prestadora B (OB): fronteiras de fuso.
--
-- Solicitações de A (dias relativos a hoje; «d(n)» = n dias atrás ao meio-dia no fuso da organização):
--  R1 Alfa concluída  normal CA  criada d20 concluída d10 prazo d8   → no prazo (concluída ANTES do prazo), 240 h
--  R2 Alfa concluída  alta   CA  criada d15 concluída d5  prazo d8   → fora do prazo (concluída DEPOIS do prazo), 240 h
--  R3 Beta concluída  normal MA  criada d40 concluída d35 sem prazo  → 120 h
--  R4 Alfa em andamento alta CA  criada d8 prazo d2 (vencida), última atividade d1
--  R5 Beta aberta     normal —   criada d3 prazo daqui a 10 h (próxima), última atividade d3
--  R6 Alfa aguardando cliente baixa MA criada d30, última atividade d10 (parada), sem prazo
--  R7 Beta cancelada  baixa  —   criada d12
-- Entregas: DL1 Alfa publicada d4 · DL2 Beta confirmada (publicada d20) · DL3 Alfa rascunho · DL4 Beta pronta.
-- Documentos: Alfa visível d2 e d9; Alfa interno d1; Alfa visível arquivado d3.

\set as_ma 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a1","aal":"aal1","email":"ma@t.invalid"}'', true); set local role authenticated;'
\set as_ca 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a2","aal":"aal1","email":"ca@t.invalid"}'', true); set local role authenticated;'
\set as_oa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal2","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_ob 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b0","aal":"aal2","email":"ob@t.invalid"}'', true); set local role authenticated;'
\set as_ua1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c1","aal":"aal1","email":"ua1@t.invalid"}'', true); set local role authenticated;'
\set as_ub1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c3","aal":"aal1","email":"ub1@t.invalid"}'', true); set local role authenticated;'

begin;
insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000a0', 'oa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a1', 'ma@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a2', 'ca@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000b0', 'ob@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c1', 'ua1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c3', 'ub1@t.invalid');

:as_oa
do $$
declare a uuid;
begin
  a := public.create_organization('Agência A', 'agencia-a');
  insert into public.organization_members (organization_id, user_id, role) values (a, 'ffffffff-0000-4000-8000-0000000000a1', 'manager'), (a, 'ffffffff-0000-4000-8000-0000000000a2', 'member');
  perform set_config('t.org', a::text, true);
end $$;
reset role;
:as_ob
do $$ begin perform set_config('t.orgb', public.create_organization('Agência B', 'agencia-b')::text, true); end $$;
reset role;

create function pg_temp.d(n int) returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Sao_Paulo')::date - n)::timestamp + time '12:00') at time zone 'America/Sao_Paulo' $$;
create function pg_temp.dd(n int) returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date - n $$;
create function pg_temp.at(n int, t time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Sao_Paulo')::date - n)::timestamp + t) at time zone 'America/Sao_Paulo' $$;

-- ================= base de A (inserção direta como dono do banco: datas passadas)
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := gen_random_uuid(); beta uuid := gen_random_uuid(); ca uuid := 'ffffffff-0000-4000-8000-0000000000a2'; ma uuid := 'ffffffff-0000-4000-8000-0000000000a1';
begin
  insert into public.client_accounts (id, organization_id, name) values (alfa, org, 'Alfa'), (beta, org, 'Beta');
  perform set_config('t.alfa', alfa::text, true); perform set_config('t.beta', beta::text, true);
  insert into public.client_members (organization_id, client_account_id, user_id, role) values (org, alfa, 'ffffffff-0000-4000-8000-0000000000c1', 'client_admin'), (org, beta, 'ffffffff-0000-4000-8000-0000000000c3', 'client_user');
  insert into public.requests (organization_id, client_account_id, number, title, status, priority, assigned_to, created_at, completed_at, due_at, due_kind, last_activity_at, closed_at) values
    (org, alfa, 1, 'Req 1', 'completed', 'normal', ca, pg_temp.d(20), pg_temp.d(10), pg_temp.d(8), 'agreed', pg_temp.d(10), null),
    (org, alfa, 2, 'Req 2', 'completed', 'high', ca, pg_temp.d(15), pg_temp.d(5), pg_temp.d(8), 'agreed', pg_temp.d(5), null),
    (org, beta, 3, 'Req 3', 'completed', 'normal', ma, pg_temp.d(40), pg_temp.d(35), null, null, pg_temp.d(35), null),
    (org, alfa, 4, 'Req 4', 'in_progress', 'high', ca, pg_temp.d(8), null, pg_temp.d(2), 'agreed', pg_temp.d(1), null),
    (org, beta, 5, 'Req 5', 'open', 'normal', null, pg_temp.d(3), null, now() + interval '10 hours', 'agreed', pg_temp.d(3), null),
    (org, alfa, 6, 'Req 6', 'waiting_client', 'low', ma, pg_temp.d(30), null, null, null, pg_temp.d(10), null),
    (org, beta, 7, 'Req 7', 'cancelled', 'low', null, pg_temp.d(12), null, null, null, pg_temp.d(12), pg_temp.d(11));
  insert into public.deliverables (organization_id, client_account_id, title, status, delivered_at, acknowledged_at) values
    (org, alfa, 'DL1', 'published', pg_temp.d(4), null), (org, beta, 'DL2', 'acknowledged', pg_temp.d(20), pg_temp.d(19)), (org, alfa, 'DL3', 'draft', null, null), (org, beta, 'DL4', 'ready', null, null);
  insert into public.documents (organization_id, client_account_id, title, original_file_name, storage_path, mime_type, size_bytes, visibility, created_at, archived_at) values
    (org, alfa, 'D1', 'a.pdf', org || '/' || alfa || '/' || gen_random_uuid(), 'application/pdf', 10, 'client', pg_temp.d(2), null),
    (org, alfa, 'D2', 'b.pdf', org || '/' || alfa || '/' || gen_random_uuid(), 'application/pdf', 10, 'client', pg_temp.d(9), null),
    (org, alfa, 'D3', 'c.pdf', org || '/' || alfa || '/' || gen_random_uuid(), 'application/pdf', 10, 'internal', pg_temp.d(1), null),
    (org, alfa, 'D4', 'd.pdf', org || '/' || alfa || '/' || gen_random_uuid(), 'application/pdf', 10, 'client', pg_temp.d(3), now());
end $$;

-- ================= KPIs da equipe (últimos 30 dias)
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; k record;
begin
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0));
  assert k.open_now = 3, format('abertas agora (R4, R5, R6): %s', k.open_now);
  assert k.completed = 2, format('concluídas no período (R1 e R2; R3 saiu em d35): %s', k.completed);
  assert k.overdue = 1, format('atrasadas (R4): %s', k.overdue);
  assert k.due_soon = 1, format('prazo próximo (R5): %s', k.due_soon);
  assert k.stale = 1, format('paradas há mais de 7 dias (R6): %s', k.stale);
  assert k.on_time_pct = 50.0, format('no prazo: R1 sim, R2 não = 50,0 %%: %s', k.on_time_pct);
  assert k.avg_resolution_hours = 240.0, format('tempo médio = (240+240)/2 h: %s', k.avg_resolution_hours);
  assert k.active_clients = 2, 'clientes ativos';
  assert k.deliverables_pending = 2, format('entregas pendentes (DL3 rascunho, DL4 pronta): %s', k.deliverables_pending);
  assert k.deliverables_published = 2, format('entregas publicadas no período (DL1 e DL2): %s', k.deliverables_published);
  assert k.unassigned = 1, 'sem responsável (R5)';
  assert k.created = 5, format('criadas no período (R1, R2, R4, R5, R7): %s', k.created);
  assert k.docs_shared = 2, format('documentos compartilhados no período (D1 e D2; D3 é interno e D4 arquivado): %s', k.docs_shared);
  assert k.awaiting_provider = 1, 'aguardando a prestadora (R5 aberta)';
  -- 90 dias: entra a R3 (120 h); média = (240 + 240 + 120) / 3 = 200 h; no prazo continua 50 % (R3 não tem prazo)
  select * into k from public.pt_kpis(org, pg_temp.dd(89), pg_temp.dd(0));
  assert k.completed = 3 and k.avg_resolution_hours = 200.0 and k.on_time_pct = 50.0 and k.created = 7, format('90 dias: %s concluídas, média %s, no prazo %s, criadas %s', k.completed, k.avg_resolution_hours, k.on_time_pct, k.created);
  -- período sem conclusões: taxa e média são nulas (nunca 0 %)
  select * into k from public.pt_kpis(org, pg_temp.dd(2), pg_temp.dd(0));
  assert k.completed = 0 and k.on_time_pct is null and k.avg_resolution_hours is null, 'sem conclusões: taxa e média nulas';
  assert test.throws(format($q$select * from public.pt_kpis(%L, current_date, current_date - 1)$q$, org)) and test.throws(format($q$select * from public.pt_kpis(%L, current_date - 2000, current_date)$q$, org)), 'período inválido recusado';
end $$;

-- filtros
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; k record; ca uuid := 'ffffffff-0000-4000-8000-0000000000a2';
begin
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), alfa);
  assert k.open_now = 2 and k.completed = 2 and k.overdue = 1 and k.created = 3 and k.deliverables_pending = 1 and k.deliverables_published = 1 and k.unassigned = 0 and k.active_clients = 1 and k.docs_shared = 2, format('cliente Alfa: %s', row(k.*)::text);
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), null, ca);
  assert k.open_now = 1 and k.completed = 2 and k.on_time_pct = 50.0 and k.unassigned = 0, format('responsável CA: %s', row(k.*)::text);
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), null, null, null, 'high');
  assert k.open_now = 1 and k.completed = 1 and k.on_time_pct = 0.0, format('prioridade alta: R2 (fora do prazo) concluída, R4 aberta: %s', row(k.*)::text);
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), null, null, null, null, 'completed');
  assert k.open_now = 0 and k.completed = 2, 'situação «concluída»';
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), null, null, null, null, 'cancelled');
  assert k.open_now = 0 and k.completed = 0 and k.created = 1, 'situação «cancelada»: só a R7 foi criada no período';
end $$;

-- séries
do $$
declare org uuid := current_setting('t.org')::uuid; r record;
begin
  assert (select count(*) from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0))) = 30 and (select granularity from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0)) limit 1) = 'day', '30 dias = 30 pontos diários (dias sem movimento aparecem zerados)';
  select * into r from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0)) where bucket = pg_temp.dd(10);
  assert r.completed = 1 and r.on_time = 1 and r.late = 0 and r.avg_resolution_hours = 240.0, 'dia d10: R1 concluída no prazo';
  select * into r from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0)) where bucket = pg_temp.dd(5);
  assert r.completed = 1 and r.on_time = 0 and r.late = 1, 'dia d5: R2 concluída fora do prazo';
  select * into r from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0)) where bucket = pg_temp.dd(4);
  assert r.deliverables_published = 1, 'dia d4: DL1 publicada';
  assert (select sum(created) from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0))) = 5 and (select sum(completed) from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0))) = 2, 'somas da série = KPIs';
  assert (select granularity from public.pt_series(org, pg_temp.dd(89), pg_temp.dd(0)) limit 1) = 'week' and (select granularity from public.pt_series(org, pg_temp.dd(400), pg_temp.dd(0)) limit 1) = 'month', 'granularidade semanal e mensal';
  assert (select sum(created) from public.pt_series(org, pg_temp.dd(89), pg_temp.dd(0))) = 7, 'série semanal soma as 7 criadas';
end $$;

-- distribuições, rankings e alertas
do $$
declare org uuid := current_setting('t.org')::uuid;
begin
  assert (select array_agg(status::text || ':' || requests order by status) from public.pt_status_distribution(org)) = array['open:1', 'in_review:0', 'in_progress:1', 'waiting_client:1', 'waiting_provider:0', 'completed:3', 'cancelled:1'], 'situações (total 7)';
  assert (select array_agg(priority::text || ':' || requests order by priority) from public.pt_priority_distribution(org)) = array['low:2', 'normal:3', 'high:2', 'urgent:0'], 'prioridades';
  assert (select requests from public.pt_status_distribution(org, current_setting('t.alfa')::uuid) where status = 'completed') = 2, 'distribuição respeita o filtro de cliente';
  assert (select count(*) from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0))) = 3, 'três grupos: CA, MA e sem responsável';
  assert (select row(open_requests, completed, avg_resolution_hours, on_time_pct)::text from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0)) where assignee_id = 'ffffffff-0000-4000-8000-0000000000a2') = '(1,2,240.0,50.0)', 'CA: 1 aberta, 2 concluídas, 240 h, 50 %';
  assert (select row(open_requests, completed, avg_resolution_hours, on_time_pct)::text from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0)) where assignee_id = 'ffffffff-0000-4000-8000-0000000000a1') = '(1,0,,)', 'MA: 1 aberta e nenhuma conclusão no período (R3 saiu): média e taxa nulas';
  assert (select open_requests from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0)) where assignee_id is null) = 1, 'sem responsável: R5';
  assert (select assignee_id from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0)) limit 1) = 'ffffffff-0000-4000-8000-0000000000a2', 'ranking ordenado por carga e conclusões';
  assert (select row(created, open_requests, overdue, completed)::text from public.pt_by_client(org, pg_temp.dd(29), pg_temp.dd(0)) where name = 'Alfa') = '(3,2,1,2)', 'Alfa: 3 criadas, 2 abertas, 1 atrasada, 2 concluídas';
  assert (select row(created, open_requests, overdue, completed)::text from public.pt_by_client(org, pg_temp.dd(29), pg_temp.dd(0)) where name = 'Beta') = '(2,1,0,0)', 'Beta: R5 e R7 criadas, 1 aberta, 0 atrasada, 0 concluída (R3 é de d35)';
  assert (select array_agg(key || ':' || requests order by key) from public.pt_alerts(org)) = array['awaiting_provider:1', 'deliverables_pending:2', 'due_soon:1', 'overdue:1', 'stale:1', 'unassigned:1'], 'alertas';
end $$;
reset role;

-- ================= escopo por papel: o RLS decide o que cada um conta
:as_ca
do $$
declare org uuid := current_setting('t.org')::uuid; k record;
begin
  -- o colaborador atua só na Alfa (tem solicitações nela): vê a Alfa INTEIRA e nada da Beta
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0));
  assert k.open_now = 2 and k.completed = 2 and k.created = 3 and k.active_clients = 1 and k.unassigned = 0, format('colaborador: só a conta onde atua: %s', row(k.*)::text);
  assert (select count(*) from public.pt_by_client(org, pg_temp.dd(29), pg_temp.dd(0))) = 1, 'ranking de clientes tem só a Alfa';
  -- as demais funções seguem o mesmo escopo (R1, R2, R4 e R6 são da Alfa; R3, R5 e R7 são da Beta)
  assert (select array_agg(priority::text || ':' || requests order by priority) from public.pt_priority_distribution(org)) = array['low:1', 'normal:1', 'high:2', 'urgent:0'], 'colaborador: prioridades só da Alfa';
  assert (select sum(created) from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0))) = 3 and (select sum(completed) from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0))) = 2, 'colaborador: série só da Alfa';
  assert (select count(*) from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0))) = 2 and (select count(*) from public.pt_by_assignee(org, pg_temp.dd(29), pg_temp.dd(0)) where assignee_id is null) = 0, 'colaborador: ranking de responsáveis sem a R5 da Beta (sem responsável)';
  assert (select coalesce(sum(requests), 0) from public.pt_alerts(org) where key in ('due_soon', 'unassigned')) = 0, 'colaborador: alertas da Beta (R5 próxima do prazo e sem responsável) não aparecem';
  assert (select requests from public.pt_alerts(org) where key = 'overdue') = 1 and (select requests from public.pt_alerts(org) where key = 'stale') = 1 and (select requests from public.pt_alerts(org) where key = 'deliverables_pending') = 1, 'colaborador: atrasada R4, parada R6 e só o rascunho DL3 da Alfa';
end $$;
reset role;
:as_ua1
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; k record;
begin
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), alfa);
  assert k.open_now = 2 and k.completed = 2 and k.overdue = 1 and k.on_time_pct = 50.0 and k.created = 3, format('portal da Alfa vê os números da própria conta: %s', row(k.*)::text);
  assert k.deliverables_pending = 0 and k.deliverables_published = 1, 'e só as entregas publicadas (rascunho não aparece nem na contagem de pendentes)';
  assert k.docs_shared = 2, 'só documentos visíveis ao cliente';
  assert (select count(*) from public.pt_by_client(org, pg_temp.dd(29), pg_temp.dd(0))) = 1, 'ranking: só a própria conta';
  assert (select requests from public.pt_status_distribution(org) where status = 'completed') = 2, 'distribuição: só as solicitações da conta';
  assert (select array_agg(priority::text || ':' || requests order by priority) from public.pt_priority_distribution(org)) = array['low:1', 'normal:1', 'high:2', 'urgent:0'], 'cliente: prioridades só da própria conta';
  assert (select sum(created) from public.pt_series(org, pg_temp.dd(29), pg_temp.dd(0))) = 3, 'cliente: série só da própria conta';
  assert (select coalesce(sum(requests), 0) from public.pt_alerts(org) where key in ('due_soon', 'unassigned')) = 0, 'cliente: alertas da Beta não aparecem';
  -- pedir a conta de outro cliente não vaza nada: o RLS zera
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0), current_setting('t.beta')::uuid);
  assert k.open_now = 0 and k.completed = 0 and k.created = 0 and k.active_clients = 0, 'filtro com o ID de outro cliente devolve zeros';
end $$;
reset role;
:as_ub1
do $$
declare org uuid := current_setting('t.org')::uuid; k record;
begin
  select * into k from public.pt_kpis(org, pg_temp.dd(29), pg_temp.dd(0));
  assert k.open_now = 1 and k.overdue = 0 and k.due_soon = 1 and k.completed = 0 and k.created = 2 and k.deliverables_published = 1, format('portal da Beta: %s', row(k.*)::text);
end $$;
reset role;

-- ================= fronteiras de dia e de fuso (prestadora B)
do $$
declare orgb uuid := current_setting('t.orgb')::uuid; g uuid := gen_random_uuid();
begin
  insert into public.client_accounts (id, organization_id, name) values (g, orgb, 'Gama');
  insert into public.requests (organization_id, client_account_id, number, title, status, created_at, completed_at, last_activity_at) values
    (orgb, g, 1, 'fora (véspera 23:30)', 'completed', pg_temp.d(25), pg_temp.at(21, time '23:30'), pg_temp.at(21, time '23:30')),
    (orgb, g, 2, 'dentro (primeiro dia 00:30)', 'completed', pg_temp.d(25), pg_temp.at(20, time '00:30'), pg_temp.at(20, time '00:30')),
    (orgb, g, 3, 'dentro (último dia 23:30)', 'completed', pg_temp.d(25), pg_temp.at(10, time '23:30'), pg_temp.at(10, time '23:30')),
    (orgb, g, 4, 'fora (dia seguinte 00:30)', 'completed', pg_temp.d(25), pg_temp.at(9, time '00:30'), pg_temp.at(9, time '00:30'));
end $$;
:as_ob
do $$
declare orgb uuid := current_setting('t.orgb')::uuid;
begin
  assert (select completed from public.pt_kpis(orgb, pg_temp.dd(20), pg_temp.dd(10))) = 2, 'dia inteiro no fuso da organização: 00:30 do primeiro dia e 23:30 do último entram; 23:30 da véspera e 00:30 do dia seguinte não';
  -- um dia só (d20): em Brasília entra só a conclusão de 00:30; em UTC, 23:30 de d21 em Brasília (= 02:30 UTC de d20) também
  assert (select completed from public.pt_kpis(orgb, pg_temp.dd(20), pg_temp.dd(20))) = 1, 'em Brasília o dia d20 tem 1 conclusão';
  update public.portal_settings set timezone = 'UTC' where organization_id = orgb;
  assert (select completed from public.pt_kpis(orgb, pg_temp.dd(20), pg_temp.dd(20))) = 2, 'em UTC o mesmo dia tem 2: o fuso configurado é respeitado';
end $$;
reset role;

-- ================= exportação CSV: só gestão, e deixa rastro (sem os dados)
:as_ma
select public.pt_log_export(current_setting('t.org')::uuid, 'solicitacoes', 7);
reset role;
do $$ begin
  assert (select count(*) from public.audit_log where action = 'export' and entity_id = 'solicitacoes' and organization_id = current_setting('t.org')::uuid and (changes ->> 'rows')::int = 7 and actor_id = 'ffffffff-0000-4000-8000-0000000000a1') = 1, 'a exportação do gestor ficou na auditoria com a contagem de linhas';
end $$;
:as_ca
do $$ begin
  begin perform public.pt_log_export(current_setting('t.org')::uuid, 'solicitacoes', 1); assert false, 'colaborador não exporta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
:as_ua1
do $$ begin
  begin perform public.pt_log_export(current_setting('t.org')::uuid, 'solicitacoes', 1); assert false, 'cliente não exporta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
:as_ma
do $$ begin
  begin perform public.pt_log_export(current_setting('t.org')::uuid, 'Rel; drop', 1); assert false, 'nome de relatório inválido é recusado';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

do $$ begin raise notice 'PASS: indicadores com valores à mão, filtros, séries, rankings, alertas, escopo por papel e fronteiras de fuso'; end $$;
rollback;
select 'PASS 64_pt_metrics' as result;
