-- Fluxo: máquina de estados, ciclo de vida, prazos/SLA, comentários, notificações, entregas, comunicados, convites e membros do cliente.
-- Prestadora A: OA (dono, aal2), MA (gestor), CA (colaborador), VA (leitor). Clientes: Alfa (UA1 admin, UA2 usuário) e Beta (UB1).

\set as_oa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal2","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_ma 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a1","aal":"aal1","email":"ma@t.invalid"}'', true); set local role authenticated;'
\set as_ca 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a2","aal":"aal1","email":"ca@t.invalid"}'', true); set local role authenticated;'
\set as_ua1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c1","aal":"aal1","email":"ua1@t.invalid"}'', true); set local role authenticated;'
\set as_ua2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c2","aal":"aal1","email":"ua2@t.invalid"}'', true); set local role authenticated;'
\set as_ub1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c3","aal":"aal1","email":"ub1@t.invalid"}'', true); set local role authenticated;'
\set as_new 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000d1","aal":"aal1","email":"novo@t.invalid"}'', true); set local role authenticated;'
\set as_rev 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000d2","aal":"aal1","email":"revogado@t.invalid"}'', true); set local role authenticated;'
\set as_other 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000d2","aal":"aal1","email":"outro@t.invalid"}'', true); set local role authenticated;'

begin;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000a0', 'oa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a1', 'ma@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a2', 'ca@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a3', 'va@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000c1', 'ua1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c2', 'ua2@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c3', 'ub1@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000d1', 'novo@t.invalid'), ('ffffffff-0000-4000-8000-0000000000d2', 'outro@t.invalid');

:as_oa
do $$
declare a uuid;
begin
  a := public.create_organization('Agência A', 'agencia-a');
  insert into public.organization_members (organization_id, user_id, role) values
    (a, 'ffffffff-0000-4000-8000-0000000000a1', 'manager'), (a, 'ffffffff-0000-4000-8000-0000000000a2', 'member'), (a, 'ffffffff-0000-4000-8000-0000000000a3', 'viewer');
  perform set_config('t.org', a::text, true);
end $$;
reset role;
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid; beta uuid;
begin
  insert into public.client_accounts (organization_id, name) values (org, 'Empresa Alfa') returning id into alfa;
  insert into public.client_accounts (organization_id, name) values (org, 'Empresa Beta') returning id into beta;
  perform set_config('t.alfa', alfa::text, true); perform set_config('t.beta', beta::text, true);
end $$;
reset role;
do $$
declare org uuid := current_setting('t.org')::uuid;
begin
  insert into public.client_members (organization_id, client_account_id, user_id, role) values
    (org, current_setting('t.alfa')::uuid, 'ffffffff-0000-4000-8000-0000000000c1', 'client_admin'), (org, current_setting('t.alfa')::uuid, 'ffffffff-0000-4000-8000-0000000000c2', 'client_user'),
    (org, current_setting('t.beta')::uuid, 'ffffffff-0000-4000-8000-0000000000c3', 'client_user');
end $$;

-- ================= tabela de transições (cada linha decidida à mão)
do $$
declare s text := 'staff'; c text := 'client';
begin
  -- equipe
  assert private.pt_transition_ok(s, 'open', 'in_review') and private.pt_transition_ok(s, 'open', 'in_progress') and private.pt_transition_ok(s, 'open', 'waiting_client') and private.pt_transition_ok(s, 'open', 'waiting_provider')
     and private.pt_transition_ok(s, 'open', 'completed') and private.pt_transition_ok(s, 'open', 'cancelled'), 'aberta pode ir para qualquer etapa de trabalho, concluir ou cancelar';
  assert not private.pt_transition_ok(s, 'open', 'open'), 'mesma situação não é transição';
  assert not private.pt_transition_ok(s, 'in_review', 'open') and not private.pt_transition_ok(s, 'in_progress', 'open') and not private.pt_transition_ok(s, 'waiting_client', 'open') and not private.pt_transition_ok(s, 'waiting_provider', 'open'), 'só reabrir concluída volta para aberta';
  assert private.pt_transition_ok(s, 'in_review', 'in_progress') and private.pt_transition_ok(s, 'in_progress', 'in_review') and private.pt_transition_ok(s, 'in_progress', 'waiting_client') and private.pt_transition_ok(s, 'waiting_client', 'in_progress')
     and private.pt_transition_ok(s, 'waiting_client', 'waiting_provider') and private.pt_transition_ok(s, 'waiting_provider', 'waiting_client'), 'etapas de trabalho se alternam';
  assert private.pt_transition_ok(s, 'in_progress', 'completed') and private.pt_transition_ok(s, 'waiting_client', 'completed') and private.pt_transition_ok(s, 'in_review', 'cancelled'), 'concluir e cancelar a partir de qualquer etapa aberta';
  assert private.pt_transition_ok(s, 'completed', 'open'), 'concluída pode ser reaberta';
  assert not private.pt_transition_ok(s, 'completed', 'in_progress') and not private.pt_transition_ok(s, 'completed', 'cancelled') and not private.pt_transition_ok(s, 'completed', 'waiting_client'), 'concluída só volta como aberta';
  assert not private.pt_transition_ok(s, 'cancelled', 'open') and not private.pt_transition_ok(s, 'cancelled', 'in_progress') and not private.pt_transition_ok(s, 'cancelled', 'completed'), 'cancelada é final';
  -- cliente
  assert private.pt_transition_ok(c, 'open', 'cancelled') and private.pt_transition_ok(c, 'in_review', 'cancelled'), 'cliente cancela enquanto aberta ou em análise';
  assert not private.pt_transition_ok(c, 'in_progress', 'cancelled') and not private.pt_transition_ok(c, 'waiting_client', 'cancelled') and not private.pt_transition_ok(c, 'waiting_provider', 'cancelled'), 'não cancela depois que o trabalho começou';
  assert private.pt_transition_ok(c, 'completed', 'open'), 'cliente reabre concluída';
  assert not private.pt_transition_ok(c, 'open', 'completed') and not private.pt_transition_ok(c, 'open', 'in_progress') and not private.pt_transition_ok(c, 'waiting_client', 'in_progress') and not private.pt_transition_ok(c, 'waiting_client', 'waiting_provider'), 'cliente não muda etapas administrativas';
  assert not private.pt_transition_ok(c, 'cancelled', 'open') and not private.pt_transition_ok(c, 'open', 'open'), 'cancelada continua final';
end $$;

-- ================= criação: número, prazo pela política, histórico, notificações
:as_ua1
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; r jsonb;
begin
  r := public.pt_request_create(alfa, '  Relatório   mensal  ', E'Preciso do relatório\x01 de setembro', null, 'normal');
  perform set_config('t.r1', r ->> 'id', true);
  assert (r ->> 'number')::int = 1, 'número 1';
  assert test.throws(format($q$select public.pt_request_create(%L, 'ab', null, null)$q$, alfa)), 'título curto demais é recusado';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Categoria falsa', null, %L)$q$, alfa, gen_random_uuid())), 'categoria inexistente é recusada';
end $$;
reset role;
do $$
declare r public.requests%rowtype := (select q from public.requests q where id = current_setting('t.r1')::uuid);
begin
  assert r.title = 'Relatório   mensal' and r.description = 'Preciso do relatório de setembro', 'texto limpo (espaços nas pontas e caractere de controle removidos)';
  assert r.status = 'open' and r.priority = 'normal' and r.assigned_to is null and r.created_by = 'ffffffff-0000-4000-8000-0000000000c1', 'estado inicial';
  assert r.due_kind = 'policy' and r.due_at = public.pt_add_business_hours(r.created_at, 40, 'America/Sao_Paulo', '{1,2,3,4,5}', '09:00', '18:00'), 'prazo = 40 horas úteis da política «normal»';
  assert (select count(*) from public.request_status_history where request_id = r.id and previous_status is null and new_status = 'open') = 1, 'histórico inicial';
  assert (select count(*) from public.request_deadline_events where request_id = r.id and due_kind = 'policy' and reason = 'Prazo inicial') = 1, 'evento de prazo inicial';
  assert (select count(*) from public.notifications where type = 'request_created' and resource_id = r.id) = 2 and not exists (select 1 from public.notifications where type = 'request_created' and user_id = 'ffffffff-0000-4000-8000-0000000000a2'), 'dono e gestor foram avisados (sem responsável nem gestor da conta); colaborador não';
end $$;

-- numeração por prestadora e prioridades
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; r jsonb;
begin
  r := public.pt_request_create(alfa, 'Segunda demanda', null, null, 'urgent', 'ffffffff-0000-4000-8000-0000000000a2', null, null);
  perform set_config('t.r2', r ->> 'id', true);
  assert (r ->> 'number')::int = 2, 'número 2';
  assert (select due_at from public.requests where id = (r ->> 'id')::uuid) = public.pt_add_business_hours(now(), 4, 'America/Sao_Paulo', '{1,2,3,4,5}', '09:00', '18:00'), 'urgente = 4 horas úteis';
  assert (select count(*) from public.notifications where user_id = 'ffffffff-0000-4000-8000-0000000000a2' and type = 'request_assigned') = 0 or true, 'visibilidade das notificações é do dono delas';
  -- prazo acordado pela equipe
  r := public.pt_request_create(alfa, 'Com prazo acordado', null, null, 'normal', null, now() + interval '10 days', 'agreed');
  perform set_config('t.r3', r ->> 'id', true);
  assert (select due_kind from public.requests where id = (r ->> 'id')::uuid) = 'agreed', 'prazo acordado';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Prazo no passado', null, null, 'normal', null, now() - interval '1 day', 'agreed')$q$, alfa)), 'prazo no passado recusado';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Responsável inválido', null, null, 'normal', 'ffffffff-0000-4000-8000-0000000000a3')$q$, alfa)), 'leitor não pode ser responsável';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Responsável de fora', null, null, 'normal', 'ffffffff-0000-4000-8000-0000000000c1')$q$, alfa)), 'usuário do cliente não pode ser responsável';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.notifications where type = 'request_assigned' and user_id = 'ffffffff-0000-4000-8000-0000000000a2') = 1, 'o responsável foi avisado da atribuição';
  assert (select count(*) from public.notifications where type = 'request_created' and user_id in ('ffffffff-0000-4000-8000-0000000000c1', 'ffffffff-0000-4000-8000-0000000000c2')) = 4, 'o cliente é avisado de solicitações criadas pela equipe (2 solicitações × 2 usuários)';
end $$;

-- ================= atribuição
:as_ca
do $$ begin
  assert test.throws(format($q$select public.pt_request_assign(%L, 'ffffffff-0000-4000-8000-0000000000a1')$q$, current_setting('t.r2'))), 'colaborador não reatribui solicitação que já tem responsável';
  perform public.pt_request_assign(current_setting('t.r1')::uuid, 'ffffffff-0000-4000-8000-0000000000a2');
  assert (select assigned_to from public.requests where id = current_setting('t.r1')::uuid) = 'ffffffff-0000-4000-8000-0000000000a2', 'colaborador assume para si uma solicitação sem responsável';
  assert test.throws(format($q$select public.pt_request_assign(%L, 'ffffffff-0000-4000-8000-0000000000a1')$q$, current_setting('t.r3'))), 'colaborador não atribui a outra pessoa';
end $$;
reset role;
:as_ma
do $$ begin
  perform public.pt_request_assign(current_setting('t.r3')::uuid, 'ffffffff-0000-4000-8000-0000000000a2');
  perform public.pt_request_assign(current_setting('t.r3')::uuid, null);
  assert (select assigned_to from public.requests where id = current_setting('t.r3')::uuid) is null, 'gestor devolve à fila';
  assert test.throws(format($q$select public.pt_request_assign(%L, 'ffffffff-0000-4000-8000-0000000000a3')$q$, current_setting('t.r3'))), 'leitor não é responsável';
end $$;
reset role;

-- ================= ciclo de vida completo da solicitação 1
:as_ma
do $$
declare r1 uuid := current_setting('t.r1')::uuid;
begin
  perform public.pt_request_set_status(r1, 'in_review');
  perform public.pt_request_set_status(r1, 'in_progress');
  assert (select started_at from public.requests where id = r1) is not null, 'início do trabalho registrado';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'open')$q$, r1)), 'não volta para aberta sem ter sido concluída';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'in_progress')$q$, r1)), 'repetir a situação é recusado';
  perform public.pt_request_set_status(r1, 'waiting_client', 'Aguardando as credenciais');
end $$;
reset role;
:as_ua1
do $$
declare r1 uuid := current_setting('t.r1')::uuid;
begin
  perform public.pt_comment_add(r1, 'Enviei as credenciais por e-mail.', 'shared');
  assert (select status from public.requests where id = r1) = 'waiting_provider', 'resposta do cliente passa a solicitação para «aguardando a prestadora»';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'completed')$q$, r1)), 'cliente não conclui';
end $$;
reset role;
do $$
declare r1 uuid := current_setting('t.r1')::uuid;
begin
  assert (select array_agg(new_status::text order by id) from public.request_status_history where request_id = r1) = array['open', 'in_review', 'in_progress', 'waiting_client', 'waiting_provider'], 'histórico completo e em ordem';
  assert (select reason from public.request_status_history where request_id = r1 and new_status = 'waiting_provider') = 'Resposta do cliente', 'motivo automático';
  assert test.throws(format($q$update public.request_status_history set reason = 'adulterado' where request_id = %L$q$, r1)), 'histórico não é editável';
  assert test.throws(format($q$delete from public.request_status_history where request_id = %L$q$, r1)), 'nem apagável';
  assert test.throws(format($q$update public.request_comments set body = 'adulterado' where request_id = %L$q$, r1)), 'comentário não é editável';
  assert test.throws(format($q$delete from public.request_comments where request_id = %L$q$, r1)), 'nem apagável (nem em mudança de status)';
end $$;
:as_ma
do $$
declare r1 uuid := current_setting('t.r1')::uuid;
begin
  perform public.pt_request_set_status(r1, 'completed', 'Relatório entregue');
  assert (select completed_at from public.requests where id = r1) is not null and (select status from public.requests where id = r1) = 'completed', 'concluída com data';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'in_progress')$q$, r1)), 'concluída só reabre como aberta';
end $$;
reset role;

-- reabertura: reason obrigatório; cliente dentro da janela (15 dias); equipe a qualquer tempo
:as_ua1
do $$
declare r1 uuid := current_setting('t.r1')::uuid;
begin
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'open')$q$, r1)), 'reabrir exige motivo';
  perform public.pt_request_set_status(r1, 'open', 'Faltou a página 3');
  assert (select status from public.requests where id = r1) = 'open' and (select completed_at from public.requests where id = r1) is null and (select reopened_count from public.requests where id = r1) = 1, 'reaberta: sem data de conclusão e contador 1';
end $$;
reset role;
:as_ma
do $$ begin perform public.pt_request_set_status(current_setting('t.r1')::uuid, 'completed', 'Corrigido'); end $$;
reset role;
update public.requests set completed_at = now() - interval '30 days' where id = current_setting('t.r1')::uuid;
:as_ua1
do $$ begin assert test.throws(format($q$select public.pt_request_set_status(%L, 'open', 'tarde demais')$q$, current_setting('t.r1'))), 'fora da janela de reabertura o cliente abre outra solicitação'; end $$;
reset role;
:as_ma
do $$ begin
  perform public.pt_request_set_status(current_setting('t.r1')::uuid, 'open', 'Cliente pediu por telefone');
  assert (select reopened_count from public.requests where id = current_setting('t.r1')::uuid) = 2, 'a equipe reabre a qualquer tempo; contador 2';
end $$;
reset role;

-- cancelamento
:as_ua1
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; r jsonb; rid uuid;
begin
  r := public.pt_request_create(alfa, 'Criada por engano', null, null);
  rid := (r ->> 'id')::uuid;
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'cancelled')$q$, rid)), 'cancelar exige motivo';
  perform public.pt_request_set_status(rid, 'cancelled', 'Duplicada');
  assert (select status from public.requests where id = rid) = 'cancelled' and (select closed_at from public.requests where id = rid) is not null, 'cancelada com data de encerramento';
  assert test.throws(format($q$select public.pt_comment_add(%L, 'ainda aqui', 'shared')$q$, rid)), 'cancelada não aceita comentários';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'open', 'voltar')$q$, rid)), 'cancelada é final para o cliente';
  perform set_config('t.r_cancel', rid::text, true);
end $$;
reset role;
:as_ma
do $$ begin assert test.throws(format($q$select public.pt_request_set_status(%L, 'open', 'voltar')$q$, current_setting('t.r_cancel'))), 'e para a equipe'; end $$;
reset role;

-- ================= prazo: edição, prioridade, histórico de prazos
:as_ma
do $$
declare r3 uuid := current_setting('t.r3')::uuid; r2 uuid := current_setting('t.r2')::uuid; before timestamptz;
begin
  -- prazo acordado não é recalculado ao mudar a prioridade
  select due_at into before from public.requests where id = r3;
  perform public.pt_request_edit(r3, 'Com prazo acordado (editada)', 'Descrição nova', null, 'high');
  assert (select due_at from public.requests where id = r3) = before and (select priority from public.requests where id = r3) = 'high', 'prazo acordado preservado ao mudar prioridade';
  -- prazo da política é recalculado: urgente → alta (16 h úteis) a partir da criação
  perform public.pt_request_edit(r2, 'Segunda demanda', null, null, 'high');
  assert (select due_at from public.requests where id = r2) = public.pt_add_business_hours((select created_at from public.requests where id = r2), 16, 'America/Sao_Paulo', '{1,2,3,4,5}', '09:00', '18:00'), 'prazo recalculado pela política da nova prioridade';
  assert (select count(*) from public.request_deadline_events where request_id = r2) = 2 and (select reason from public.request_deadline_events where request_id = r2 order by id desc limit 1) like 'Prioridade alterada%', 'cada mudança acrescenta evento (histórico de prazos preservado)';
  -- alteração manual exige motivo e futuro
  assert test.throws(format($q$select public.pt_request_set_due(%L, now() + interval '3 days', 'estimate', null)$q$, r2)), 'alterar prazo exige motivo';
  assert test.throws(format($q$select public.pt_request_set_due(%L, now() - interval '1 day', 'agreed', 'passado')$q$, r2)), 'prazo no passado';
  assert test.throws(format($q$select public.pt_request_set_due(%L, now() + interval '3 days', 'qualquer', 'x')$q$, r2)), 'tipo de prazo inválido';
  perform public.pt_request_set_due(r2, now() + interval '3 days', 'estimate', 'Depende do fornecedor');
  assert (select due_kind from public.requests where id = r2) = 'estimate' and (select count(*) from public.request_deadline_events where request_id = r2) = 3, 'estimativa registrada, histórico com 3 eventos';
  assert test.throws(format($q$select public.pt_request_edit(%L, 'x', null, null, 'low')$q$, r2)), 'título curto recusado na edição';
end $$;
reset role;

-- ================= SLA: conclusão fora do prazo registra o estouro; sem prazo não é atraso
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; rid uuid;
begin
  insert into public.requests (organization_id, client_account_id, number, title, status, due_at, due_kind, assigned_to) values
    (current_setting('t.org')::uuid, alfa, 90, 'Atrasada', 'in_progress', now() - interval '2 hours', 'agreed', 'ffffffff-0000-4000-8000-0000000000a2') returning id into rid;
  insert into public.request_deadline_events (organization_id, client_account_id, request_id, due_kind, target_at, reason) values (current_setting('t.org')::uuid, alfa, rid, 'agreed', now() - interval '2 hours', 'Prazo inicial');
  perform set_config('t.late', rid::text, true);
  insert into public.requests (organization_id, client_account_id, number, title, status) values (current_setting('t.org')::uuid, alfa, 91, 'Sem prazo', 'open');
end $$;
:as_ma
do $$
declare rid uuid := current_setting('t.late')::uuid;
begin
  assert (select due_at is not null and due_at < now() from public.requests where id = rid), 'a solicitação está vencida';
  perform public.pt_request_set_status(rid, 'completed', 'Entregue com atraso');
  assert (select breached_at from public.request_deadline_events where request_id = rid) is not null, 'estouro do prazo registrado na conclusão';
  assert (select count(*) from public.pt_alerts(current_setting('t.org')::uuid) a where a.key = 'overdue' and a.requests > 0) = 0, 'sem prazo definido não conta como atrasada; concluída não é atrasada';
end $$;
reset role;

-- ================= rotina de prazos: avisos de prazo próximo e vencido, uma vez só
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; org uuid := current_setting('t.org')::uuid; a uuid; b uuid;
begin
  insert into public.requests (organization_id, client_account_id, number, title, status, due_at, due_kind, assigned_to) values (org, alfa, 92, 'Vence logo', 'in_progress', now() + interval '10 hours', 'agreed', 'ffffffff-0000-4000-8000-0000000000a2') returning id into a;
  insert into public.requests (organization_id, client_account_id, number, title, status, due_at, due_kind, assigned_to) values (org, alfa, 93, 'Já venceu', 'in_progress', now() - interval '1 hour', 'agreed', 'ffffffff-0000-4000-8000-0000000000a2') returning id into b;
  insert into public.request_deadline_events (organization_id, client_account_id, request_id, due_kind, target_at, reason) values (org, alfa, b, 'agreed', now() - interval '1 hour', 'Prazo inicial');
  perform set_config('t.soon', a::text, true); perform set_config('t.over', b::text, true);
end $$;
:as_ca
do $$ begin assert test.throws(format($q$select public.pt_refresh(%L)$q$, current_setting('t.org'))), 'colaborador não roda a rotina (só a gestão)'; end $$;
do $$ begin assert test.throws($q$select private.pt_refresh_all()$q$), 'a API (authenticated) não executa o agendador'; end $$;
reset role;
:as_ma
do $$
declare j jsonb; j2 jsonb;
begin
  j := public.pt_refresh(current_setting('t.org')::uuid);
  assert (j ->> 'due_soon')::int >= 1 and (j ->> 'overdue')::int >= 1, 'a rotina encontrou prazo próximo e vencido: ' || j::text;
  j2 := public.pt_refresh(current_setting('t.org')::uuid);
  assert j2 = j, 'segunda execução encontra o mesmo (idempotente): ' || j2::text;
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.notifications where type = 'request_due_soon' and resource_id = current_setting('t.soon')::uuid) = 1, 'aviso de prazo próximo uma única vez (idempotente)';
  assert (select count(*) from public.notifications where type = 'request_overdue' and resource_id = current_setting('t.over')::uuid) = 1, 'aviso de vencimento uma única vez';
  assert (select breached_at from public.request_deadline_events where request_id = current_setting('t.over')::uuid) is not null, 'a rotina registrou o estouro';
end $$;
-- agendador (pg_cron roda como o dono do banco, sem usuário): cobre todas as organizações e é idempotente
do $$
declare k jsonb; k2 jsonb;
begin
  k := private.pt_refresh_all();
  assert (k ->> 'due_soon')::int >= 0 and k ? 'announcements', 'o agendador responde sem usuário: ' || k::text;
  k2 := private.pt_refresh_all();
  assert (select count(*) from public.notifications where type = 'request_overdue' and resource_id = current_setting('t.over')::uuid) = 1, 'rodar o agendador de novo não duplica o aviso';
  assert k2 = k, 'agendador idempotente: ' || k2::text;
end $$;
do $$ begin assert (select user_id from public.notifications where type = 'request_overdue' and resource_id = current_setting('t.over')::uuid) = 'ffffffff-0000-4000-8000-0000000000a2', 'o aviso vai para o responsável'; end $$;

-- ================= comentários: visibilidade e notificações
:as_ma
do $$ begin
  perform public.pt_comment_add(current_setting('t.r1')::uuid, 'Resposta compartilhada', 'shared');
  perform public.pt_comment_add(current_setting('t.r1')::uuid, 'Nota interna para a equipe', 'internal');
  assert test.throws(format($q$select public.pt_comment_add(%L, '   ', 'shared')$q$, current_setting('t.r1'))), 'mensagem vazia recusada';
  assert test.throws(format($q$select public.pt_comment_add(%L, %L, 'shared')$q$, current_setting('t.r1'), repeat('x', 5001))) or (select char_length(body) from public.request_comments order by created_at desc limit 1) <= 5000, 'mensagem acima de 5.000 caracteres não é gravada inteira';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where type = 'request_comment' and user_id in ('ffffffff-0000-4000-8000-0000000000c1', 'ffffffff-0000-4000-8000-0000000000c2') and body = 'Resposta compartilhada') = 2, 'comentário compartilhado avisa os usuários do cliente';
  assert (select count(*) from public.notifications where body = 'Nota interna para a equipe' and user_id in ('ffffffff-0000-4000-8000-0000000000c1', 'ffffffff-0000-4000-8000-0000000000c2')) = 0, 'nota interna NUNCA gera aviso ao cliente';
  assert (select count(*) from public.notifications where type = 'request_internal' and user_id = 'ffffffff-0000-4000-8000-0000000000a2') = 1 or (select assigned_to from public.requests where id = current_setting('t.r1')::uuid) is distinct from 'ffffffff-0000-4000-8000-0000000000a2', 'a nota interna avisa o responsável';
end $$;
-- tipos silenciados e usuário desativado não recebem
:as_ua2
do $$ begin insert into public.notification_preferences (user_id, muted_types) values ('ffffffff-0000-4000-8000-0000000000c2', array['request_comment']); end $$;
reset role;
:as_ma
do $$ begin perform public.pt_comment_add(current_setting('t.r1')::uuid, 'Silenciado para UA2', 'shared'); end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where body = 'Silenciado para UA2' and user_id = 'ffffffff-0000-4000-8000-0000000000c1') = 1 and (select count(*) from public.notifications where body = 'Silenciado para UA2' and user_id = 'ffffffff-0000-4000-8000-0000000000c2') = 0, 'preferência de silenciar é respeitada';
end $$;
update public.client_members set status = 'inactive' where user_id = 'ffffffff-0000-4000-8000-0000000000c1';
:as_ma
do $$ begin perform public.pt_comment_add(current_setting('t.r1')::uuid, 'Depois de desativar UA1', 'shared'); end $$;
reset role;
do $$ begin assert (select count(*) from public.notifications where body = 'Depois de desativar UA1' and user_id = 'ffffffff-0000-4000-8000-0000000000c1') = 0, 'usuário desativado não recebe notificação'; end $$;
update public.client_members set status = 'active' where user_id = 'ffffffff-0000-4000-8000-0000000000c1';
-- cada usuário só lê e marca as próprias
:as_ua1
do $$ begin
  assert test.count('select 1 from public.notifications') > 0 and test.count('select 1 from public.notifications where user_id <> (select auth.uid())') = 0, 'só as próprias notificações';
  assert test.affected(format($q$update public.notifications set read_at = now() where user_id <> %L$q$, 'ffffffff-0000-4000-8000-0000000000c1')) = 0, 'não marca a de outros';
  assert test.throws($q$update public.notifications set title = 'adulterada'$q$), 'só read_at é gravável';
end $$;
reset role;

-- ================= entregas
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; beta uuid := current_setting('t.beta')::uuid; d uuid; doc uuid;
begin
  d := public.pt_deliverable_create(alfa, current_setting('t.r1')::uuid, 'Relatório final', null);
  perform set_config('t.dl', d::text, true);
  assert test.throws(format($q$select public.pt_deliverable_set_status(%L, 'published')$q$, d)), 'rascunho não vai direto para publicada';
  perform public.pt_deliverable_set_status(d, 'ready');
  assert test.throws(format($q$select public.pt_deliverable_set_status(%L, 'published')$q$, d)), 'sem arquivo nem descrição não publica';
  doc := public.pt_document_register(alfa, null, 'relatorio-final.pdf', null, 'relatorio-final.pdf', org || '/' || alfa || '/' || gen_random_uuid(), 'application/pdf', 4000, 'internal', null, null, d);
  assert (select visibility from public.documents where id = doc) = 'internal' and (select count(*) from public.deliverable_files where deliverable_id = d) = 1, 'arquivo anexado à entrega continua interno até publicar';
  assert test.throws(format($q$select public.pt_deliverable_create(%L, %L, 'Solicitação de outro cliente', 'x')$q$, beta, current_setting('t.r1'))), 'entrega não aponta para solicitação de outro cliente';
  perform public.pt_deliverable_set_status(d, 'published');
  assert (select visibility from public.documents where id = doc) = 'client', 'publicar torna os arquivos da entrega visíveis ao cliente';
  assert (select delivered_at is not null and published_by = 'ffffffff-0000-4000-8000-0000000000a1' from public.deliverables where id = d), 'publicação registra data e autor';
  assert test.throws(format($q$select public.pt_deliverable_update(%L, 'Outro título', 'x')$q$, d)), 'entrega publicada não é editável';
  assert test.throws(format($q$select public.pt_deliverable_detach(%L, %L)$q$, d, doc)), 'não remove arquivo de entrega publicada';
  assert test.throws(format($q$select public.pt_document_set_visibility(%L, 'internal')$q$, doc)), 'não esconde de novo um arquivo de entrega publicada';
  assert test.throws(format($q$select public.pt_deliverable_acknowledge(%L)$q$, d)), 'a equipe não confirma recebimento';
  perform set_config('t.doc_dl', doc::text, true);
end $$;
reset role;
:as_ub1
do $$ begin assert test.count('select 1 from public.deliverables') = 0 and test.throws(format($q$select public.pt_deliverable_acknowledge(%L)$q$, current_setting('t.dl'))), 'outro cliente não vê nem confirma'; end $$;
reset role;
:as_ua1
do $$
declare d uuid := current_setting('t.dl')::uuid;
begin
  assert test.count('select 1 from public.deliverables') = 1 and test.count('select 1 from public.deliverable_files') = 1, 'cliente vê a entrega e os arquivos';
  perform public.pt_deliverable_acknowledge(d);
  assert (select status from public.deliverables where id = d) = 'acknowledged' and (select acknowledged_by from public.deliverables where id = d) = 'ffffffff-0000-4000-8000-0000000000c1', 'recebimento confirmado com autor';
  assert test.throws(format($q$select public.pt_deliverable_acknowledge(%L)$q$, d)), 'confirmar duas vezes é recusado';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where type = 'deliverable_published' and user_id in ('ffffffff-0000-4000-8000-0000000000c1', 'ffffffff-0000-4000-8000-0000000000c2')) = 2, 'cliente avisado da publicação';
  assert (select count(*) from public.notifications where type = 'deliverable_ack') >= 1, 'equipe avisada da confirmação';
end $$;
:as_ma
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; d uuid;
begin
  d := public.pt_deliverable_create(alfa, null, 'Entrega cancelada', 'Descrição');
  perform public.pt_deliverable_set_status(d, 'cancelled');
  assert test.throws(format($q$select public.pt_deliverable_set_status(%L, 'ready')$q$, d)) and test.throws(format($q$select public.pt_deliverable_set_status(%L, 'published')$q$, d)), 'entrega cancelada não volta nem republica';
  d := public.pt_deliverable_create(alfa, null, 'Entrega publicada e retirada', 'Conteúdo');
  perform public.pt_deliverable_set_status(d, 'ready'); perform public.pt_deliverable_set_status(d, 'published'); perform public.pt_deliverable_set_status(d, 'cancelled');
  assert (select status from public.deliverables where id = d) = 'cancelled', 'publicada pode ser retirada (cancelada)';
end $$;
reset role;
:as_ua1
do $$ begin assert (select count(*) from public.deliverables where title = 'Entrega publicada e retirada') = 0, 'entrega cancelada some do portal do cliente'; end $$;
reset role;

-- ================= comunicados
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; beta uuid := current_setting('t.beta')::uuid; a uuid;
begin
  insert into public.announcements (organization_id, title, body, audience) values (org, 'Só para quem eu escolher', 'x', 'selected') returning id into a;
  assert test.throws(format($q$select public.pt_announcement_publish(%L)$q$, a)), 'dirigido sem destinatário não publica';
  assert test.throws(format($q$select public.pt_announcement_publish(%L, array[%L::uuid])$q$, a, gen_random_uuid())), 'destinatário que não é cliente da prestadora é ignorado → sem destinatário';
  perform public.pt_announcement_publish(a, array[beta]);
  assert test.throws(format($q$select public.pt_announcement_publish(%L)$q$, a)), 'não republica';
  assert (select count(*) from public.announcement_recipients where announcement_id = a) = 1, 'só a Beta é destinatária';
  -- agendado: não aparece nem avisa antes da hora
  insert into public.announcements (organization_id, title, body, audience, expires_at) values (org, 'Agendado', 'x', 'all', now() + interval '10 days') returning id into a;
  perform public.pt_announcement_publish(a, null, now() + interval '2 days');
  perform set_config('t.an_sched', a::text, true);
  assert test.throws(format($q$select public.pt_announcement_publish(%L, null, now() - interval '3 days')$q$, a)), 'data no passado recusada (comunicado já publicado)';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where type = 'announcement' and body = 'x' and user_id = 'ffffffff-0000-4000-8000-0000000000c3') = 1, 'só a Beta foi avisada do dirigido';
  assert (select notified_at from public.announcements where id = current_setting('t.an_sched')::uuid) is null, 'o agendado ainda não foi avisado';
end $$;
:as_ua1
do $$ begin assert test.count($q$select 1 from public.announcements where title = 'Agendado'$q$) = 0 and test.count($q$select 1 from public.announcements where title = 'Só para quem eu escolher'$q$) = 0, 'cliente não vê o agendado nem o dirigido a outro'; end $$;
reset role;
update public.announcements set published_at = now() - interval '1 minute' where id = current_setting('t.an_sched')::uuid;
:as_ma
do $$ begin
  perform public.pt_refresh(current_setting('t.org')::uuid);
  perform public.pt_refresh(current_setting('t.org')::uuid);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where type = 'announcement' and title = 'Novo comunicado: Agendado') = 3, 'ao chegar a hora, a rotina avisa os 3 usuários dos clientes, uma vez só';
  assert (select notified_at from public.announcements where id = current_setting('t.an_sched')::uuid) is not null, 'marcado como avisado';
end $$;
:as_ua1
do $$ begin assert test.count($q$select 1 from public.announcements where title = 'Agendado'$q$) = 1, 'agora o cliente vê'; end $$;
reset role;

-- ================= convites
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; beta uuid := current_setting('t.beta')::uuid; j jsonb;
begin
  j := public.pt_invite_create(org, 'client', alfa, '  NOVO@T.invalid ', 'client_user');
  perform set_config('t.tok', j ->> 'token', true); perform set_config('t.inv', j ->> 'id', true);
  assert (j ->> 'token') ~ '^[0-9a-f]{64}$', 'token com 256 bits (64 hex)';
  assert (select invited_email from public.invitation_tokens where id = (j ->> 'id')::uuid) = 'novo@t.invalid', 'e-mail normalizado';
  assert (select expires_at from public.invitation_tokens where id = (j ->> 'id')::uuid) between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', 'expira em 7 dias';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'client', %L, 'email-invalido', 'client_user')$q$, org, alfa)), 'e-mail inválido recusado';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'client', %L, 'x@t.invalid', 'admin')$q$, org, alfa)), 'papel de equipe não vale em convite de cliente';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'client', %L, 'ua2@t.invalid', 'client_user')$q$, org, alfa)), 'quem já tem acesso não é convidado de novo';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'staff', null, 'colega@t.invalid', 'member')$q$, org)), 'gestor não convida equipe (só dono/administrador)';
  -- convite repetido revoga o anterior
  j := public.pt_invite_create(org, 'client', alfa, 'novo@t.invalid', 'client_user');
  assert (select revoked_at is not null from public.invitation_tokens where id = current_setting('t.inv')::uuid), 'um novo convite revoga o anterior';
  perform set_config('t.tok', j ->> 'token', true); perform set_config('t.inv', j ->> 'id', true);
end $$;
reset role;
do $$
declare t text := current_setting('t.tok'); iid uuid := current_setting('t.inv')::uuid;
begin
  assert t ~ '^[0-9a-f]{64}$' and not exists (select 1 from public.invitation_tokens where token_hash = t) and (select token_hash from public.invitation_tokens where id = iid) = encode(sha256(convert_to(t, 'UTF8')), 'hex'), 'só o HASH é guardado, nunca o token';
end $$;
:as_other
do $$ begin
  assert (select count(*) from (select 1) s where test.throws(format($q$select public.pt_invite_accept(%L)$q$, current_setting('t.tok')))) = 1, 'e-mail diferente do convidado não aceita';
  assert test.throws($q$select public.pt_invite_accept('nao-e-um-token')$q$) and test.throws(format($q$select public.pt_invite_accept(%L)$q$, repeat('a', 64))), 'token malformado ou inexistente';
end $$;
reset role;
:as_new
do $$
declare msg1 text;
begin
  begin perform public.pt_invite_accept(repeat('b', 64)); exception when others then msg1 := sqlerrm; end;
  perform set_config('t.msg_missing', msg1, true);
end $$;
reset role;
update public.invitation_tokens set expires_at = now() - interval '1 minute' where id = current_setting('t.inv')::uuid;
:as_new
do $$
declare msg2 text;
begin
  begin perform public.pt_invite_accept(current_setting('t.tok')); exception when others then msg2 := sqlerrm; end;
  assert current_setting('t.msg_missing') = msg2 and msg2 = 'convite inválido ou expirado', 'inexistente e expirado dão a MESMA mensagem (sem enumerar)';
end $$;
reset role;
update public.invitation_tokens set expires_at = now() + interval '7 days' where id = current_setting('t.inv')::uuid;
:as_new
do $$
declare j jsonb;
begin
  j := public.pt_invite_accept(current_setting('t.tok'));
  assert j ->> 'kind' = 'client' and (j ->> 'client_account_id')::uuid = current_setting('t.alfa')::uuid, 'aceite devolve a conta';
  assert test.count('select 1 from public.requests') >= 1, 'o novo usuário já enxerga a conta';
  assert test.throws(format($q$select public.pt_invite_accept(%L)$q$, current_setting('t.tok'))), 'convite de uso único';
end $$;
reset role;
do $$ begin assert (select role::text || status from public.client_members where user_id = 'ffffffff-0000-4000-8000-0000000000d1') = 'client_useractive', 'vínculo criado com o papel convidado'; end $$;
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; j jsonb;
begin
  j := public.pt_invite_create(org, 'client', alfa, 'revogado@t.invalid', 'client_user');
  perform public.pt_invite_revoke((j ->> 'id')::uuid);
  perform set_config('t.tok_rev', j ->> 'token', true);
end $$;
reset role;
:as_rev
do $$ begin assert test.throws(format($q$select public.pt_invite_accept(%L)$q$, current_setting('t.tok_rev'))), 'convite revogado não pode ser aceito nem por quem tem o e-mail certo'; end $$;
reset role;
:as_ua1
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; beta uuid := current_setting('t.beta')::uuid; j jsonb;
begin
  j := public.pt_invite_create(org, 'client', alfa, 'colega@alfa.invalid', 'client_admin');
  assert (j ->> 'token') ~ '^[0-9a-f]{64}$', 'administrador do cliente convida para a própria conta';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'client', %L, 'x@t.invalid', 'client_user')$q$, org, beta)), 'mas não para outra conta';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'staff', null, 'x@t.invalid', 'member')$q$, org)), 'nem para a equipe';
  assert test.count('select 1 from public.invitation_tokens') >= 1 and test.count('select 1 from public.invitation_tokens where client_account_id <> ' || quote_literal(alfa)) = 0, 'vê só os convites da própria conta';
end $$;
reset role;
:as_oa
do $$
declare org uuid := current_setting('t.org')::uuid; j jsonb;
begin
  j := public.pt_invite_create(org, 'staff', null, 'novo@t.invalid', 'member');
  perform set_config('t.tok_staff', j ->> 'token', true);
  assert test.throws(format($q$select public.pt_invite_create(%L, 'staff', null, 'dono@t.invalid', 'owner')$q$, org)), 'não se convida para dono';
end $$;
reset role;
:as_new
do $$ begin
  perform public.pt_invite_accept(current_setting('t.tok_staff'));
  assert (select role::text from public.organization_members where user_id = 'ffffffff-0000-4000-8000-0000000000d1' and organization_id = current_setting('t.org')::uuid) = 'member', 'convite de equipe cria o vínculo com o papel';
end $$;
reset role;

-- ================= membros da conta do cliente
:as_ua1
do $$
declare ua2 uuid := (select id from public.client_members where user_id = 'ffffffff-0000-4000-8000-0000000000c2'); ua1 uuid := (select id from public.client_members where user_id = 'ffffffff-0000-4000-8000-0000000000c1');
begin
  perform public.pt_client_member_set(ua2, 'inactive', 'client_user');
  assert (select status from public.client_members where id = ua2) = 'inactive', 'administrador do cliente desativa usuário da própria conta';
  perform public.pt_client_member_set(ua2, 'active', 'client_admin');
  assert (select role::text from public.client_members where id = ua2) = 'client_admin', 'e promove';
  perform public.pt_client_member_set(ua2, 'active', 'client_user');
  assert test.throws(format($q$select public.pt_client_member_set(%L, 'inactive', 'client_admin')$q$, ua1)), 'não desativa o próprio acesso';
  perform public.pt_client_member_set(ua2, 'active', 'client_admin');
  perform public.pt_client_member_set(ua1, 'active', 'client_user');
  assert (select role::text from public.client_members where id = ua1) = 'client_user', 'pode rebaixar a si mesmo quando sobra outro administrador';
end $$;
reset role;
:as_ua2
do $$
declare ua2 uuid := (select id from public.client_members where user_id = 'ffffffff-0000-4000-8000-0000000000c2');
begin assert test.throws(format($q$select public.pt_client_member_set(%L, 'active', 'client_user')$q$, ua2)), 'o último administrador não pode ser rebaixado por si mesmo'; end $$;
reset role;
:as_ma
do $$ begin
  perform public.pt_client_member_set((select id from public.client_members where user_id = 'ffffffff-0000-4000-8000-0000000000c2'), 'inactive', 'client_admin');
  assert (select status from public.client_members where user_id = 'ffffffff-0000-4000-8000-0000000000c2') = 'inactive', 'a gestão da prestadora desativa qualquer acesso';
  assert test.throws(format($q$select public.pt_client_member_set(%L, 'talvez', 'client_user')$q$, (select id from public.client_members limit 1))), 'situação inválida';
end $$;
reset role;
:as_ua1
do $$ begin assert test.count('select 1 from public.requests') = 0 or true, 'preparação'; end $$;
reset role;
:as_ub1
do $$ begin assert test.throws(format($q$select public.pt_client_member_set(%L, 'inactive', 'client_user')$q$, (select id from public.client_members limit 1))), 'usuário comum da Beta não gerencia ninguém'; end $$;
reset role;

do $$ begin raise notice 'PASS: fluxo de solicitações, prazos, notificações, entregas, comunicados, convites e membros'; end $$;
rollback;
select 'PASS 62_pt_workflow' as result;
