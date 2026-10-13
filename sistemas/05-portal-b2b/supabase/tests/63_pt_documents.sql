-- Documentos: registro (caminho, tamanho, tipo, nome), pastas, visibilidade, anexos, autorização de acesso e trilha de acessos.
-- O arquivo em si vive no Storage; aqui se prova que o BANCO só autoriza o que as regras permitem.

\set as_oa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal2","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_ma 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a1","aal":"aal1","email":"ma@t.invalid"}'', true); set local role authenticated;'
\set as_ua1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c1","aal":"aal1","email":"ua1@t.invalid"}'', true); set local role authenticated;'
\set as_ub1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c3","aal":"aal1","email":"ub1@t.invalid"}'', true); set local role authenticated;'

begin;
insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000a0', 'oa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a1', 'ma@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000c1', 'ua1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c3', 'ub1@t.invalid');

:as_oa
do $$
declare a uuid;
begin
  a := public.create_organization('Agência A', 'agencia-a');
  insert into public.organization_members (organization_id, user_id, role) values (a, 'ffffffff-0000-4000-8000-0000000000a1', 'manager');
  perform set_config('t.org', a::text, true);
end $$;
reset role;
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid; beta uuid;
begin
  insert into public.client_accounts (organization_id, name) values (org, 'Alfa') returning id into alfa;
  insert into public.client_accounts (organization_id, name) values (org, 'Beta') returning id into beta;
  perform set_config('t.alfa', alfa::text, true); perform set_config('t.beta', beta::text, true);
end $$;
reset role;
do $$
declare org uuid := current_setting('t.org')::uuid;
begin
  insert into public.client_members (organization_id, client_account_id, user_id, role) values
    (org, current_setting('t.alfa')::uuid, 'ffffffff-0000-4000-8000-0000000000c1', 'client_admin'), (org, current_setting('t.beta')::uuid, 'ffffffff-0000-4000-8000-0000000000c3', 'client_user');
end $$;
create function pg_temp.path(client uuid) returns text language sql as $$ select current_setting('t.org') || '/' || client || '/' || gen_random_uuid() $$;

-- ================= registro: caminho, tamanho, tipo e nome
:as_ma
do $$
declare org uuid := current_setting('t.org')::uuid; alfa uuid := current_setting('t.alfa')::uuid; beta uuid := current_setting('t.beta')::uuid; u text := gen_random_uuid()::text; d uuid;
begin
  d := public.pt_document_register(alfa, null, 'Contrato', 'Versão assinada', 'contrato.pdf', pg_temp.path(alfa), 'application/pdf', 1000, 'client');
  assert (select title || '/' || original_file_name || '/' || mime_type from public.documents where id = d) = 'Contrato/contrato.pdf/application/pdf', 'registro básico';
  assert (select count(*) from public.document_access_logs where document_id = d and action = 'upload') = 1, 'upload registrado na trilha';
  -- caminho
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, alfa, org || '/' || beta || '/' || u)), 'caminho de OUTRA conta é recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, alfa, gen_random_uuid() || '/' || alfa || '/' || u)), 'caminho de OUTRA prestadora é recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, alfa, org || '/' || alfa || '/../' || u)), 'path traversal recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, alfa, org || '/' || alfa || '/arquivo.pdf')), 'nome do objeto precisa ser um UUID';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, alfa, org || '/' || alfa || '/sub/' || u)), 'sem subcaminhos';
  perform public.pt_document_register(alfa, null, 'x', null, 'x.pdf', org || '/' || alfa || '/' || u, 'application/pdf', 10);
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'y', null, 'y.pdf', %L, 'application/pdf', 10)$q$, alfa, org || '/' || alfa || '/' || u)), 'mesmo objeto não é registrado duas vezes';
  -- tamanho (padrão 20 MB; configurável)
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 0)$q$, alfa, pg_temp.path(alfa))), 'arquivo vazio recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 20971521)$q$, alfa, pg_temp.path(alfa))), 'acima de 20 MB recusado';
  perform public.pt_document_register(alfa, null, 'Limite', null, 'l.pdf', pg_temp.path(alfa), 'application/pdf', 20971520);
  -- tipo e nome
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.exe', %L, 'application/x-msdownload', 10)$q$, alfa, pg_temp.path(alfa))), 'executável recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.html', %L, 'text/html', 10)$q$, alfa, pg_temp.path(alfa))), 'HTML recusado (pode executar script)';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.svg', %L, 'image/svg+xml', 10)$q$, alfa, pg_temp.path(alfa))), 'SVG recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, '../etc/passwd', %L, 'application/pdf', 10)$q$, alfa, pg_temp.path(alfa))), 'nome de arquivo com barra recusado';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, '..\win.pdf', %L, 'application/pdf', 10)$q$, alfa, pg_temp.path(alfa))), 'nome com contrabarra recusado';
  d := public.pt_document_register(alfa, null, '   ', null, 'sem-titulo.pdf', pg_temp.path(alfa), 'application/pdf', 10);
  assert (select title from public.documents where id = d) = 'sem-titulo.pdf', 'sem título usa o nome do arquivo';
end $$;
reset role;
-- o limite é configurável pelo administrador (1 MB)
update public.portal_settings set doc_max_mb = 1 where organization_id = current_setting('t.org')::uuid;
:as_ma
do $$ declare alfa uuid := current_setting('t.alfa')::uuid; begin
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 1048577)$q$, alfa, pg_temp.path(alfa))), 'limite de 1 MB configurado';
  perform public.pt_document_register(alfa, null, 'ok', null, 'ok.pdf', pg_temp.path(alfa), 'application/pdf', 1048576);
end $$;
reset role;
update public.portal_settings set doc_max_mb = 20 where organization_id = current_setting('t.org')::uuid;

-- ================= pastas
:as_ma
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; f_pub uuid; f_int uuid; f_sub uuid; d uuid;
begin
  f_pub := public.pt_folder_create(alfa, null, 'Relatórios', 'client');
  f_int := public.pt_folder_create(alfa, null, 'Contratos internos', 'internal');
  perform set_config('t.f_pub', f_pub::text, true); perform set_config('t.f_int', f_int::text, true);
  assert test.throws(format($q$select public.pt_folder_create(%L, null, 'relatórios', 'client')$q$, alfa)) , 'nome repetido (sem diferenciar maiúsculas) na mesma pasta é recusado';
  f_sub := public.pt_folder_create(alfa, f_pub, 'Relatórios', 'client');
  assert f_sub is not null, 'mesmo nome em outra pasta é permitido';
  assert test.throws(format($q$select public.pt_folder_create(%L, %L, 'Pública dentro de interna', 'client')$q$, alfa, f_int)), 'pasta visível não fica dentro de interna';
  assert test.throws(format($q$select public.pt_folder_create(%L, null, 'a/b', 'client')$q$, alfa)) and test.throws(format($q$select public.pt_folder_create(%L, gen_random_uuid(), 'Órfã', 'client')$q$, alfa)), 'nome com barra e pai inexistente';
  assert test.throws(format($q$select public.pt_folder_create(%L, %L, 'Da outra conta', 'client')$q$, current_setting('t.beta'), f_pub)), 'pai de outra conta é recusado';
  -- documento dentro de pasta interna é sempre interno
  d := public.pt_document_register(alfa, f_int, 'Minuta', null, 'minuta.pdf', pg_temp.path(alfa), 'application/pdf', 10, 'client');
  assert (select visibility from public.documents where id = d) = 'internal', 'pasta interna força documento interno';
  perform set_config('t.d_in_int', d::text, true);
  assert test.throws(format($q$select public.pt_document_set_visibility(%L, 'client')$q$, d)), 'não torna visível um documento que está em pasta interna';
  d := public.pt_document_register(alfa, f_pub, 'Relatório de agosto', null, 'agosto.pdf', pg_temp.path(alfa), 'application/pdf', 10, 'client');
  perform set_config('t.d_pub', d::text, true);
  assert test.throws(format($q$select public.pt_folder_archive(%L)$q$, f_pub)), 'pasta com conteúdo não é arquivada';
  perform public.pt_document_archive(d);
  perform public.pt_folder_archive(f_sub);
  assert (select archived_at is not null from public.document_folders where id = f_sub), 'pasta vazia é arquivada';
end $$;
reset role;
:as_ua1
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; f uuid;
begin
  assert test.count('select 1 from public.document_folders') = 1 and (select name from public.document_folders) = 'Relatórios', 'cliente vê só a pasta visível (não a interna nem a arquivada)';
  f := public.pt_folder_create(alfa, null, 'Meus envios', 'internal');
  assert (select visibility from public.document_folders where id = f) = 'client', 'pasta criada pelo cliente é sempre visível ao cliente';
  assert test.throws(format($q$select public.pt_folder_create(%L, %L, 'Dentro da interna', 'client')$q$, alfa, current_setting('t.f_int'))), 'cliente não cria dentro de pasta interna';
  assert test.throws(format($q$select public.pt_document_register(%L, %L, 'x', null, 'x.pdf', %L, 'application/pdf', 10)$q$, alfa, current_setting('t.f_int'), pg_temp.path(alfa))), 'cliente não envia para pasta interna';
  assert test.throws(format($q$select public.pt_folder_archive(%L)$q$, f)), 'cliente não arquiva pastas';
  perform public.pt_document_register(alfa, f, 'Planilha', null, 'p.xlsx', pg_temp.path(alfa), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10);
end $$;
reset role;

-- ================= anexos em solicitações: comentário interno força documento interno
:as_ua1
do $$ declare r jsonb; begin r := public.pt_request_create(current_setting('t.alfa')::uuid, 'Solicitação com anexos', null, null); perform set_config('t.r1', r ->> 'id', true); end $$;
reset role;
:as_ma
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; r1 uuid := current_setting('t.r1')::uuid; c_sh uuid; c_in uuid; d uuid;
begin
  c_sh := public.pt_comment_add(r1, 'Segue o material', 'shared'); c_in := public.pt_comment_add(r1, 'Anotação com anexo', 'internal');
  d := public.pt_document_register(alfa, null, 'Anexo público', null, 'a.pdf', pg_temp.path(alfa), 'application/pdf', 10, 'client', r1, c_sh);
  assert (select visibility from public.documents where id = d) = 'client', 'anexo de comentário compartilhado é visível';
  d := public.pt_document_register(alfa, null, 'Anexo da nota', null, 'n.pdf', pg_temp.path(alfa), 'application/pdf', 10, 'client', r1, c_in);
  assert (select visibility from public.documents where id = d) = 'internal', 'anexo de comentário INTERNO é forçado a interno';
  perform set_config('t.d_note', d::text, true);
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10, 'client', %L, %L)$q$, alfa, pg_temp.path(alfa), current_setting('t.r1'), gen_random_uuid())), 'comentário inexistente recusado';
  assert test.throws(format($q$select public.pt_document_set_visibility((select document_id from public.request_attachments where comment_id = %L), 'internal')$q$, c_sh)), 'anexo de mensagem compartilhada não volta a interno';
end $$;
reset role;
:as_ua1
do $$
declare alfa uuid := current_setting('t.alfa')::uuid; r1 uuid := current_setting('t.r1')::uuid;
begin
  assert test.count('select 1 from public.request_attachments') = 1, 'cliente vê só o anexo da mensagem compartilhada';
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10, 'client', %L, (select id from public.request_comments limit 1))$q$, alfa, pg_temp.path(alfa), r1)) is false, 'cliente pode anexar em comentário compartilhado da própria solicitação';
  perform public.pt_request_set_status(r1, 'cancelled', 'Desistimos');
  assert test.throws(format($q$select public.pt_document_register(%L, null, 'x', null, 'x.pdf', %L, 'application/pdf', 10, 'client', %L)$q$, alfa, pg_temp.path(alfa), r1)), 'solicitação cancelada não aceita anexo';
end $$;
reset role;

-- ================= autorização de acesso e trilha
:as_ua1
do $$
declare p text;
begin
  p := public.pt_document_access(current_setting('t.d_in_int')::uuid) ;
  raise exception 'não deveria chegar aqui';
exception when others then
  assert sqlerrm = 'documento indisponível', 'documento interno: mensagem uniforme (' || sqlerrm || ')';
end $$;
reset role;
:as_ua1
do $$
declare d uuid := (select id from public.documents where title = 'Anexo público'); p text;
begin
  p := public.pt_document_access(d, 'download');
  assert p ~ ('^' || current_setting('t.org') || '/' || current_setting('t.alfa') || '/[0-9a-f-]{36}$'), 'devolve o caminho do Storage da própria conta';
  perform public.pt_document_access(d, 'view');
  assert test.throws(format($q$select public.pt_document_access(%L, 'delete')$q$, d)), 'ação inválida';
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, gen_random_uuid())), 'documento inexistente = mesma recusa';
  assert test.count('select 1 from public.document_access_logs') = 0, 'cliente não lê a trilha';
end $$;
reset role;
:as_ub1
do $$ begin assert test.throws(format($q$select public.pt_document_access(%L)$q$, (select id from public.documents limit 1) )) or test.count('select 1 from public.documents') = 0, 'outro cliente não acessa'; end $$;
reset role;
do $$
declare d uuid := (select id from public.documents where title = 'Anexo público');
begin
  assert (select count(*) from public.document_access_logs where document_id = d and action in ('download', 'view') and user_id = 'ffffffff-0000-4000-8000-0000000000c1') = 2, 'download e visualização ficam registrados com o usuário';
  assert test.throws(format($q$update public.document_access_logs set action = 'view' where document_id = %L$q$, d)) and test.throws(format($q$delete from public.document_access_logs where document_id = %L$q$, d)), 'trilha é imutável';
end $$;
:as_ma
do $$
declare d uuid := (select id from public.documents where title = 'Anexo público');
begin
  assert test.count(format('select 1 from public.document_access_logs where document_id = %L', d)) = 3, 'gestor lê a trilha (envio + download + visualização)';
  perform public.pt_document_set_visibility(d, 'client');
  assert test.throws(format($q$select public.pt_document_set_visibility(%L, 'internal')$q$, d)), 'anexo compartilhado continua protegido';
  -- arquivar tira do cliente, mas a equipe continua enxergando
  d := current_setting('t.d_pub')::uuid;
  assert (select count(*) from public.documents where id = d) = 1, 'equipe vê documento arquivado';
  perform public.pt_document_archive(d);
  assert (select count(*) from public.document_access_logs where document_id = d and action = 'archived') = 1, 'arquivamento registrado uma vez';
end $$;
reset role;
:as_ua1
do $$ begin
  assert test.count(format('select 1 from public.documents where id = %L', current_setting('t.d_pub'))) = 0, 'documento arquivado some para o cliente';
  assert test.throws(format($q$select public.pt_document_access(%L)$q$, current_setting('t.d_pub'))), 'e não pode mais ser baixado, mesmo conhecendo o ID';
end $$;
reset role;

-- mudança de visibilidade é registrada; só a equipe com escrita muda
:as_ma
do $$
declare d uuid := current_setting('t.d_note')::uuid;
begin
  perform public.pt_document_set_visibility(d, 'client');
  assert (select visibility from public.documents where id = d) = 'client' and (select count(*) from public.document_access_logs where document_id = d and action = 'visibility_changed') = 1, 'visibilidade alterada e registrada';
  perform public.pt_document_set_visibility(d, 'client');
  assert (select count(*) from public.document_access_logs where document_id = d and action = 'visibility_changed') = 1, 'repetir não duplica o registro';
end $$;
reset role;

do $$ begin raise notice 'PASS: documentos — registro, pastas, visibilidade, anexos, autorização e trilha'; end $$;
rollback;
select 'PASS 63_pt_documents' as result;
