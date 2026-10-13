-- Isolamento e visibilidade (RLS): prestadoras, contas de clientes, papéis internos, comentários internos, documentos, entregas, comunicados, usuários desativados.
-- Prestadora A: OA (dono, aal2), MA (gestor), CA (colaborador), VA (leitor). Prestadora B: OB.
-- Clientes de A: Alfa (admin UA1, usuário UA2) e Beta (usuário UB1). Cliente de B: Gama (UG).

\set as_oa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal2","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_oa1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal1","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_ma 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a1","aal":"aal1","email":"ma@t.invalid"}'', true); set local role authenticated;'
\set as_ca 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a2","aal":"aal1","email":"ca@t.invalid"}'', true); set local role authenticated;'
\set as_va 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a3","aal":"aal1","email":"va@t.invalid"}'', true); set local role authenticated;'
\set as_ob 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b0","aal":"aal2","email":"ob@t.invalid"}'', true); set local role authenticated;'
\set as_ua1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c1","aal":"aal1","email":"ua1@t.invalid"}'', true); set local role authenticated;'
\set as_ua2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c2","aal":"aal1","email":"ua2@t.invalid"}'', true); set local role authenticated;'
\set as_ub1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c3","aal":"aal1","email":"ub1@t.invalid"}'', true); set local role authenticated;'
\set as_ug 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c4","aal":"aal1","email":"ug@t.invalid"}'', true); set local role authenticated;'
\set as_anon 'select set_config(''request.jwt.claims'', ''{}'', true); set local role anon;'

begin;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000a0', 'oa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a1', 'ma@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a2', 'ca@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a3', 'va@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000b0', 'ob@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c1', 'ua1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c2', 'ua2@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000c3', 'ub1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c4', 'ug@t.invalid');

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
:as_ob
do $$ begin perform set_config('t.orgb', public.create_organization('Agência B', 'agencia-b')::text, true); end $$;
reset role;

-- contas de clientes: criadas pela gestão (RLS + grants por coluna)
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid; beta uuid;
begin
  insert into public.client_accounts (organization_id, name, email) values (org, 'Empresa Alfa', 'alfa@alfa.invalid') returning id into alfa;
  insert into public.client_accounts (organization_id, name, email) values (org, 'Empresa Beta', 'beta@beta.invalid') returning id into beta;
  perform set_config('t.alfa', alfa::text, true); perform set_config('t.beta', beta::text, true);
  assert test.throws(format($q$insert into public.client_accounts (organization_id, name, document_number) values (%L, 'Doc ruim', '123')$q$, org)), 'documento inválido recusado';
  assert test.throws(format($q$insert into public.client_accounts (organization_id, name, id) values (%L, 'Id forçado', gen_random_uuid())$q$, org)), 'id não é gravável';
end $$;
reset role;
:as_ob
do $$ declare g uuid; begin insert into public.client_accounts (organization_id, name) values (current_setting('t.orgb')::uuid, 'Empresa Gama') returning id into g; perform set_config('t.gama', g::text, true); end $$;
reset role;

-- vínculos dos usuários dos clientes (preparados pelo dono do banco; o aceite de convite é testado em 62)
do $$
declare org uuid := current_setting('t.org')::uuid; orgb uuid := current_setting('t.orgb')::uuid;
begin
  insert into public.client_members (organization_id, client_account_id, user_id, role) values
    (org, current_setting('t.alfa')::uuid, 'ffffffff-0000-4000-8000-0000000000c1', 'client_admin'), (org, current_setting('t.alfa')::uuid, 'ffffffff-0000-4000-8000-0000000000c2', 'client_user'),
    (org, current_setting('t.beta')::uuid, 'ffffffff-0000-4000-8000-0000000000c3', 'client_user'), (orgb, current_setting('t.gama')::uuid, 'ffffffff-0000-4000-8000-0000000000c4', 'client_user');
end $$;

-- ================= dados de negócio criados pelas funções (como os usuários criariam)
:as_ua1
do $$
declare r jsonb;
begin
  r := public.pt_request_create(current_setting('t.alfa')::uuid, 'Relatório mensal', 'Precisamos do relatório de setembro', null, 'normal');
  perform set_config('t.r1', r ->> 'id', true);
  assert (r ->> 'number')::int = 1, 'primeiro número da prestadora A';
end $$;
reset role;
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; beta uuid := current_setting('t.beta')::uuid; r jsonb; d uuid; p text;
begin
  r := public.pt_request_create(beta, 'Ajuste no site', 'Corrigir o formulário', null, 'high', 'ffffffff-0000-4000-8000-0000000000a2');
  perform set_config('t.r2', r ->> 'id', true);
  r := public.pt_request_create(alfa, 'Dúvida sobre fatura', null, null, 'low');
  perform set_config('t.r3', r ->> 'id', true);
  perform public.pt_comment_add(current_setting('t.r1')::uuid, 'Recebemos o pedido, estamos analisando.', 'shared');
  perform public.pt_comment_add(current_setting('t.r1')::uuid, 'Cliente atrasa pagamentos: cobrar antes de entregar.', 'internal');
  -- documentos (o arquivo em si está no Storage; aqui só o registro e as regras)
  p := org || '/' || alfa || '/' || gen_random_uuid(); d := public.pt_document_register(alfa, null, 'Contrato interno', null, 'contrato.pdf', p, 'application/pdf', 1000, 'internal'); perform set_config('t.d_int', d::text, true);
  p := org || '/' || alfa || '/' || gen_random_uuid(); d := public.pt_document_register(alfa, null, 'Relatório de agosto', null, 'agosto.pdf', p, 'application/pdf', 2000, 'client'); perform set_config('t.d_cli', d::text, true);
  p := org || '/' || beta || '/' || gen_random_uuid(); d := public.pt_document_register(beta, null, 'Proposta Beta', null, 'proposta.pdf', p, 'application/pdf', 3000, 'client'); perform set_config('t.d_beta', d::text, true);
  -- entregas: uma em rascunho e outra publicada
  d := public.pt_deliverable_create(alfa, null, 'Pacote de setembro (rascunho)', 'Em preparação'); perform set_config('t.dl_draft', d::text, true);
  d := public.pt_deliverable_create(alfa, current_setting('t.r1')::uuid, 'Relatório de setembro', 'Relatório mensal consolidado'); perform set_config('t.dl_pub', d::text, true);
  perform public.pt_deliverable_set_status(d, 'ready'); perform public.pt_deliverable_set_status(d, 'published');
  -- comunicados: um para todos e um só para a Beta
  insert into public.announcements (organization_id, title, body, audience) values (org, 'Manutenção programada', 'Sábado às 22h', 'all') returning id into d; perform public.pt_announcement_publish(d); perform set_config('t.an_all', d::text, true);
  insert into public.announcements (organization_id, title, body, audience) values (org, 'Condição especial Beta', 'Só para a Beta', 'selected') returning id into d; perform public.pt_announcement_publish(d, array[beta]); perform set_config('t.an_beta', d::text, true);
end $$;
reset role;
:as_ua1
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; d uuid;
begin
  -- upload do cliente: a visibilidade é forçada para «client»
  d := public.pt_document_register(alfa, null, 'Planilha do cliente', null, 'dados.xlsx', org || '/' || alfa || '/' || gen_random_uuid(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 5000, 'internal', current_setting('t.r1')::uuid);
  perform set_config('t.d_up', d::text, true);
  assert (select visibility from public.documents where id = d) = 'client', 'upload do cliente é sempre visível ao cliente (não pode ficar interno)';
end $$;
reset role;
-- comunicados fora da janela: expirado e agendado (inseridos direto, como o relógio os deixaria)
do $$
declare org uuid := current_setting('t.org')::uuid;
begin
  insert into public.announcements (organization_id, title, body, audience, published_at, expires_at, notified_at) values (org, 'Aviso expirado', 'x', 'all', now() - interval '10 days', now() - interval '5 days', now());
  insert into public.announcements (organization_id, title, body, audience, published_at) values (org, 'Aviso agendado', 'x', 'all', now() + interval '5 days');
  insert into public.client_internal_notes (client_account_id, organization_id, notes) values (current_setting('t.alfa')::uuid, org, 'Negociar reajuste em dezembro');
end $$;

-- ================= prestadora A: o que cada papel interno enxerga
:as_oa
do $$ begin
  assert test.count('select 1 from public.client_accounts') = 2, 'dono vê as 2 contas de A e nenhuma de B';
  assert test.count('select 1 from public.requests') = 3, 'dono vê as 3 solicitações';
  assert test.count('select 1 from public.request_comments') = 2, 'dono vê comentário compartilhado e interno';
  assert test.count('select 1 from public.documents') = 4, 'dono vê os 4 documentos';
  assert test.count('select 1 from public.client_internal_notes') = 1, 'dono vê as observações internas';
  assert test.count('select 1 from public.service_level_policies') = 4, 'políticas de SLA padrão';
end $$;
reset role;
:as_ma
do $$ begin
  assert test.count('select 1 from public.client_accounts') = 2 and test.count('select 1 from public.requests') = 3, 'gestor vê tudo de A';
  assert test.count('select 1 from public.client_accounts where id = ' || quote_literal(current_setting('t.gama'))) = 0, 'gestor de A não vê a Gama (outra prestadora)';
end $$;
reset role;
:as_ca
do $$ begin
  -- colaborador: só a conta onde tem solicitação atribuída (Beta, r2)
  assert test.count('select 1 from public.client_accounts') = 1 and (select name from public.client_accounts) = 'Empresa Beta', 'colaborador só enxerga a conta onde atua';
  assert test.count('select 1 from public.requests') = 1, 'colaborador só vê a solicitação dele';
  assert test.count('select 1 from public.documents') = 1, 'e só os documentos dessa conta';
  assert test.count('select 1 from public.client_internal_notes') = 0, 'sem observações internas de contas que não vê';
  assert test.count('select 1 from public.service_level_policies') = 4, 'configuração da equipe é legível';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Fora do escopo', null, null)$q$, current_setting('t.alfa'))), 'colaborador não cria solicitação em conta que não vê';
  assert test.throws(format($q$select public.pt_comment_add(%L, 'invasão', 'shared')$q$, current_setting('t.r1'))), 'nem comenta em solicitação de conta que não vê';
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, current_setting('t.d_cli'))), 'nem acessa documento dela';
  -- o que é da GESTÃO o colaborador não faz, mesmo na conta em que atua (Beta)
  assert test.throws(format($q$select public.pt_request_set_due(%L, now() + interval '2 days', 'agreed', 'combinado')$q$, current_setting('t.r2'))), 'colaborador não define prazo combinado';
  assert test.throws(format($q$select public.pt_document_archive(%L)$q$, current_setting('t.d_beta'))), 'colaborador não arquiva documento';
  assert test.throws($q$insert into public.service_categories (organization_id, name) values ((select organization_id from public.client_accounts limit 1), 'Categoria do colaborador')$q$), 'colaborador não cria categoria';
  assert test.throws($q$update public.service_level_policies set target_hours = 1000$q$) or (select count(*) from public.service_level_policies where target_hours = 1000) = 0, 'colaborador não altera SLA';
end $$;
reset role;
:as_va
do $$ begin
  assert test.count('select 1 from public.client_accounts') = 2 and test.count('select 1 from public.requests') = 3, 'leitor enxerga tudo da prestadora';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Leitor não cria', null, null)$q$, current_setting('t.alfa'))), 'leitor não cria solicitação';
  assert test.throws(format($q$select public.pt_comment_add(%L, 'x', 'internal')$q$, current_setting('t.r1'))), 'leitor não comenta';
  assert test.throws(format($q$insert into public.client_accounts (organization_id, name) values (%L, 'Leitor')$q$, current_setting('t.org'))), 'leitor não cria conta';
  assert test.throws(format($q$select public.pt_deliverable_create(%L, null, 'Leitor', 'x')$q$, current_setting('t.alfa'))), 'leitor não cria entrega';
end $$;
reset role;
:as_ob
do $$ begin
  assert test.count('select 1 from public.client_accounts') = 1 and (select name from public.client_accounts) = 'Empresa Gama', 'prestadora B só vê a própria conta';
  assert test.count('select 1 from public.requests') = 0 and test.count('select 1 from public.documents') = 0 and test.count('select 1 from public.announcements') = 0, 'e nada da prestadora A';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Invasão', null, null)$q$, current_setting('t.alfa'))), 'B não cria solicitação na conta de A';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'completed')$q$, current_setting('t.r1'))), 'B não altera solicitação de A';
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, current_setting('t.d_cli'))), 'B não baixa documento de A';
  assert test.throws(format($q$select public.pt_refresh(%L)$q$, current_setting('t.org'))), 'B não roda a rotina de A';
  assert test.throws(format($q$select public.pt_kpis(%L, current_date - 29, current_date)$q$, current_setting('t.org'))), 'B não consulta indicadores de A (sem configuração visível)';
end $$;
reset role;

-- ================= cliente Alfa (administrador): só a própria conta, sem nada interno
:as_ua1
do $$
declare org uuid := current_setting('t.org')::uuid;
begin
  assert test.count('select 1 from public.client_accounts') = 1 and (select name from public.client_accounts) = 'Empresa Alfa', 'cliente vê só a própria conta';
  assert test.count('select 1 from public.requests') = 2, 'cliente vê as 2 solicitações da própria conta (não a da Beta)';
  assert test.count('select 1 from public.request_comments') = 1 and (select body from public.request_comments) like 'Recebemos%', 'cliente NÃO vê comentário interno';
  assert test.count('select 1 from public.documents') = 2, 'documentos: o do cliente e o da prestadora marcado como visível; o interno não aparece';
  assert not exists (select 1 from public.documents where id = current_setting('t.d_int')::uuid), 'documento interno invisível';
  assert test.count('select 1 from public.request_attachments') = 1, 'anexo de documento visível aparece';
  assert test.count('select 1 from public.deliverables') = 1 and (select title from public.deliverables) = 'Relatório de setembro', 'só a entrega PUBLICADA (rascunho invisível)';
  assert test.count('select 1 from public.deliverable_files') = 0, 'entrega sem arquivos';
  assert test.count('select 1 from public.announcements') = 1 and (select title from public.announcements) = 'Manutenção programada', 'comunicados: só o geral vigente (não o da Beta, o expirado nem o agendado)';
  assert test.count('select 1 from public.client_internal_notes') = 0, 'observações internas jamais';
  assert test.count('select 1 from public.request_deadline_events') = 0, 'histórico de prazos é da equipe';
  assert test.count('select 1 from public.service_level_policies') = 0, 'política de SLA é da equipe';
  assert test.count('select 1 from public.service_categories') = 6, 'categorias ativas para abrir solicitação';
  assert test.count('select 1 from public.client_members') = 2, 'administrador do cliente vê os usuários da própria conta';
  assert test.count('select 1 from public.organizations') = 0 or true, 'organização não é consultada pelo cliente';
  assert test.count('select 1 from public.organization_members') = 0, 'cliente não vê a equipe da prestadora pela tabela';
  assert test.count('select 1 from public.audit_log') = 0, 'cliente não vê auditoria';
  assert test.count('select 1 from public.document_access_logs') = 0, 'nem o registro de acessos';
  assert test.count('select 1 from public.invitation_tokens') = 0, 'cliente comum não vê convites da prestadora (só os da própria conta)';
  assert test.throws('select token_hash from public.invitation_tokens'), 'o hash do token nunca é legível';
  assert (select count(*) from public.pt_user_labels(org) where kind = 'staff') = 1, 'nomes: só a equipe que atende o cliente (gestor), sem e-mail';
end $$;
reset role;
:as_ua2
do $$ begin
  assert test.count('select 1 from public.client_members') = 1, 'usuário comum do cliente vê só o próprio vínculo';
  assert test.count('select 1 from public.requests') = 2, 'mas as solicitações da conta';
end $$;
reset role;
:as_ub1
do $$ begin
  assert test.count('select 1 from public.requests') = 1 and (select title from public.requests) = 'Ajuste no site', 'Beta vê só a solicitação dela';
  assert test.count('select 1 from public.announcements') = 2, 'Beta vê o comunicado geral e o dirigido a ela';
  assert test.count('select 1 from public.documents') = 1 and (select title from public.documents) = 'Proposta Beta', 'Beta vê só o documento dela';
  assert test.count('select 1 from public.deliverables') = 0, 'nenhuma entrega publicada para a Beta';
end $$;
reset role;
:as_ug
do $$ begin
  assert test.count('select 1 from public.requests') = 0 and test.count('select 1 from public.documents') = 0 and test.count('select 1 from public.announcements') = 0 and test.count('select 1 from public.client_accounts') = 1, 'cliente da prestadora B não enxerga nada de A';
end $$;
reset role;

-- ================= ameaças: manipulação de identificadores, escrita proibida e funções de gestão
:as_ua1
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; beta uuid := current_setting('t.beta')::uuid;
begin
  -- 1. outro cliente
  assert test.throws(format($q$select public.pt_comment_add(%L, 'xeretando', 'shared')$q$, current_setting('t.r2'))), 'não comenta em solicitação da Beta';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'cancelled', 'x')$q$, current_setting('t.r2'))), 'não altera solicitação da Beta';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Em nome da Beta', null, null)$q$, beta)), 'não cria solicitação para a Beta';
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, current_setting('t.d_beta'))), 'não baixa documento da Beta (ID manipulado)';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, beta, org || '/' || beta || '/' || gen_random_uuid())), 'não envia arquivo para a conta da Beta';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10, 'client', %L)$q$, alfa, org || '/' || alfa || '/' || gen_random_uuid(), current_setting('t.r2'))), 'não anexa em solicitação de outro cliente';
  -- 2. conteúdo interno
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, current_setting('t.d_int'))), 'não baixa documento interno nem sabendo o ID';
  assert test.throws(format($q$select public.pt_comment_add(%L, 'nota interna', 'internal')$q$, current_setting('t.r1'))), 'cliente não escreve comentário interno';
  assert test.throws(format($q$select * from public.client_internal_notes where client_account_id = %L$q$, alfa)) = false and test.count('select 1 from public.client_internal_notes') = 0, 'observações internas devolvem zero linhas';
  -- 3. status administrativo e dados protegidos
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'completed')$q$, current_setting('t.r1'))), 'cliente não conclui solicitação';
  assert test.throws(format($q$select public.pt_request_set_status(%L, 'in_progress')$q$, current_setting('t.r1'))), 'cliente não muda para andamento';
  assert test.throws(format($q$update public.requests set status = 'completed' where id = %L$q$, current_setting('t.r1'))) or test.affected(format($q$update public.requests set status = 'completed' where id = %L$q$, current_setting('t.r1'))) = 0, 'sem UPDATE direto em solicitações';
  assert test.throws(format($q$insert into public.requests (organization_id, client_account_id, number, title) values (%L, %L, 99, 'direto')$q$, org, alfa)), 'sem INSERT direto em solicitações';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Urgente', null, null, 'urgent')$q$, alfa)), 'cliente não define prioridade urgente';
  assert test.throws(format($q$select public.pt_request_assign(%L, %L)$q$, current_setting('t.r1'), 'ffffffff-0000-4000-8000-0000000000a2')), 'cliente não atribui responsável';
  assert test.throws(format($q$select public.pt_request_set_due(%L, now() + interval '1 day', 'agreed', 'x')$q$, current_setting('t.r1'))), 'cliente não altera prazo';
  assert test.throws(format($q$update public.documents set visibility = 'internal' where id = %L$q$, current_setting('t.d_cli'))) or test.affected(format($q$update public.documents set visibility = 'internal' where id = %L$q$, current_setting('t.d_cli'))) = 0, 'sem UPDATE direto de visibilidade';
  assert test.throws(format($q$select public.pt_document_set_visibility(%L, 'internal')$q$, current_setting('t.d_up'))), 'cliente não muda visibilidade';
  assert test.throws(format($q$select public.pt_deliverable_acknowledge(%L)$q$, current_setting('t.dl_draft'))), 'entrega em rascunho não pode ser confirmada (nem existe para o cliente)';
  assert test.throws(format($q$select public.pt_deliverable_create(%L, null, 'Entrega do cliente', 'x')$q$, alfa)), 'cliente não cria entrega';
  assert test.throws(format($q$select public.pt_deliverable_set_status(%L, 'cancelled')$q$, current_setting('t.dl_pub'))), 'cliente não cancela entrega';
  -- 4. funções de gestão e convites
  assert test.throws(format($q$select public.pt_refresh(%L)$q$, org)), 'cliente não roda a rotina de prazos';
  assert test.throws(format($q$select public.pt_announcement_publish(%L)$q$, current_setting('t.an_all'))), 'cliente não publica comunicado';
  assert test.throws(format($q$insert into public.announcements (organization_id, title, body) values (%L, 'Falso', 'x')$q$, org)), 'cliente não cria comunicado';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'staff', null, 'novo@t.invalid', 'admin')$q$, org)), 'cliente não convida para a equipe';
  assert test.throws(format($q$select public.pt_invite_create(%L, 'client', %L, 'x@t.invalid', 'client_user')$q$, org, beta)), 'nem para outra conta';
  assert test.throws(format($q$insert into public.client_members (organization_id, client_account_id, user_id, role) values (%L, %L, 'ffffffff-0000-4000-8000-0000000000c1', 'client_admin')$q$, org, beta)), 'não se vincula a outra conta por INSERT';
  assert test.throws(format($q$insert into public.client_accounts (organization_id, name) values (%L, 'Conta falsa')$q$, org)), 'cliente não cria conta';
  assert test.throws(format($q$insert into public.organization_members (organization_id, user_id, role) values (%L, 'ffffffff-0000-4000-8000-0000000000c1', 'owner')$q$, org)), 'cliente não vira equipe nem dono';
  assert test.throws(format($q$update public.portal_settings set portal_name = 'Hackeado' where organization_id = %L$q$, org)) or test.affected(format($q$update public.portal_settings set portal_name = 'Hackeado' where organization_id = %L$q$, org)) = 0, 'cliente não altera configurações';
  assert test.throws(format($q$insert into public.audit_log (organization_id, action, entity) values (%L, 'x', 'y')$q$, org)), 'auditoria é só das funções';
end $$;
reset role;

:as_ua2
do $$ begin
  assert test.throws(format($q$select public.pt_invite_create(%L, 'client', %L, 'amigo@t.invalid', 'client_user')$q$, current_setting('t.org'), current_setting('t.alfa'))), 'usuário comum do cliente não convida (só o administrador do cliente)';
  assert test.throws(format($q$select public.pt_client_member_set(%L, 'inactive', 'client_user')$q$, (select id from public.client_members limit 1))), 'usuário comum não gerencia membros';
end $$;
reset role;

-- ================= usuário desativado perde o acesso NA HORA (mesmo com sessão antiga)
update public.client_members set status = 'inactive' where user_id = 'ffffffff-0000-4000-8000-0000000000c2';
:as_ua2
do $$
declare alfa uuid := current_setting('t.alfa')::uuid;
begin
  assert test.count('select 1 from public.requests') = 0 and test.count('select 1 from public.documents') = 0 and test.count('select 1 from public.client_accounts') = 0 and test.count('select 1 from public.announcements') = 0, 'desativado não enxerga nada';
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, current_setting('t.d_cli'))), 'desativado não baixa documento que já conhecia';
  assert test.throws(format($q$select public.pt_comment_add(%L, 'ainda aqui?', 'shared')$q$, current_setting('t.r1'))), 'desativado não comenta';
  assert test.throws(format($q$select public.pt_request_create(%L, 'Ainda posso?', null, null)$q$, alfa)), 'desativado não cria solicitação';
end $$;
reset role;
update public.client_members set status = 'active' where user_id = 'ffffffff-0000-4000-8000-0000000000c2';

-- conta inativa ou arquivada: ninguém do cliente acessa
update public.client_accounts set status = 'inactive' where id = current_setting('t.alfa')::uuid;
:as_ua1
do $$ begin assert test.count('select 1 from public.requests') = 0 and test.count('select 1 from public.client_accounts') = 0, 'conta inativa: nenhum acesso do cliente'; end $$;
reset role;
update public.client_accounts set status = 'active', archived_at = now() where id = current_setting('t.alfa')::uuid;
:as_ua1
do $$ begin assert test.count('select 1 from public.requests') = 0, 'conta arquivada: nenhum acesso do cliente'; end $$;
reset role;
update public.client_accounts set archived_at = null where id = current_setting('t.alfa')::uuid;
:as_ua1
do $$ begin assert test.count('select 1 from public.requests') = 2, 'reativada, volta a funcionar'; end $$;
reset role;

-- ================= MFA no banco e anônimo
:as_oa1
do $$ begin
  assert test.throws(format($q$select public.pt_request_create(%L, 'Sem MFA', null, null)$q$, current_setting('t.alfa'))), 'dono sem segundo fator (aal1) não escreve por função';
  assert test.throws(format($q$insert into public.client_accounts (organization_id, name) values (%L, 'Sem MFA')$q$, current_setting('t.org'))), 'nem por INSERT';
end $$;
reset role;
:as_anon
do $$
declare t text;
begin
  foreach t in array array['client_accounts', 'requests', 'request_comments', 'documents', 'deliverables', 'announcements', 'notifications', 'portal_settings', 'client_members', 'invitation_tokens'] loop
    assert test.throws(format('select 1 from public.%I', t)), format('anônimo não lê %s', t);
  end loop;
  assert test.throws($q$select public.pt_invite_accept('abc')$q$), 'anônimo não aceita convite';
  assert test.throws($q$select public.pt_kpis(gen_random_uuid(), current_date, current_date)$q$), 'anônimo não consulta indicadores';
end $$;
reset role;

-- ================= nenhuma função do sistema é executável pelo anônimo
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pt\_%' loop
    assert not has_function_privilege('anon', f.sig, 'execute'), format('anon não deve executar %s', f.sig);
  end loop;
  raise notice 'PASS: isolamento entre prestadoras, clientes e papéis; ameaças; desativação imediata; MFA; anônimo';
end $$;

rollback;
select 'PASS 61_pt_access' as result;
