-- Portal de Clientes B2B — CONTEÚDO (parte 3): documentos, entregas, comunicados, convites, membros do cliente e políticas do Storage.
-- O arquivo em si vive no Storage (bucket PRIVADO). O banco decide quem pode: a URL assinada só é emitida depois de pt_document_access.

begin;
set local check_function_bodies = off;

-- ======================================================================= pastas
create function public.pt_folder_create(p_client uuid, p_parent uuid, p_name text, p_visibility public.pt_visibility default 'client') returns uuid
language plpgsql security definer set search_path = '' as $$
declare ca public.client_accounts%rowtype; who text; fid uuid := gen_random_uuid(); par public.document_folders%rowtype; v_name text := private.pt_clean(p_name, 80); vis public.pt_visibility := p_visibility;
begin
  select * into ca from public.client_accounts where id = p_client;
  if not found then raise exception 'sem permissão' using errcode = '42501'; end if;
  who := private.pt_actor(p_client);
  if char_length(v_name) < 1 or v_name ~ '[/\\]' then raise exception 'nome de pasta inválido' using errcode = '22023'; end if;
  if who = 'client' then vis := 'client'; end if;
  if p_parent is not null then
    select * into par from public.document_folders where id = p_parent and client_account_id = p_client and archived_at is null;
    if not found then raise exception 'pasta de destino inválida' using errcode = '22023'; end if;
    if par.visibility = 'internal' and vis = 'client' then raise exception 'uma pasta interna não pode conter pasta visível ao cliente' using errcode = '23514'; end if;
    if who = 'client' and par.visibility = 'internal' then raise exception 'sem permissão' using errcode = '42501'; end if;
  end if;
  begin
    insert into public.document_folders (id, organization_id, client_account_id, parent_folder_id, name, visibility, created_by) values (fid, ca.organization_id, p_client, p_parent, v_name, vis, (select auth.uid()));
  exception when unique_violation then raise exception 'já existe uma pasta com este nome aqui' using errcode = '23505'; end;
  return fid;
end $$;

create function public.pt_folder_archive(p_folder uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.document_folders%rowtype;
begin
  select * into f from public.document_folders where id = p_folder;
  if not found or private.pt_actor(f.client_account_id) <> 'staff' or not private.pt_is_manager(f.organization_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if exists (select 1 from public.documents d where d.folder_id = p_folder and d.archived_at is null) or exists (select 1 from public.document_folders c where c.parent_folder_id = p_folder and c.archived_at is null) then
    raise exception 'esvazie a pasta antes de arquivá-la' using errcode = '23514';
  end if;
  update public.document_folders set archived_at = now() where id = p_folder and archived_at is null;
end $$;

-- ======================================================================= documentos
-- Registra um arquivo JÁ enviado ao Storage (o caminho tem de ser <org>/<cliente>/<uuid>). Valida vínculos, tamanho, tipo e visibilidade.
create function public.pt_document_register(p_client uuid, p_folder uuid, p_title text, p_description text, p_original_name text, p_storage_path text, p_mime text, p_size bigint,
  p_visibility public.pt_visibility default 'client', p_request uuid default null, p_comment uuid default null, p_deliverable uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ca public.client_accounts%rowtype; who text; did uuid := gen_random_uuid(); me uuid := (select auth.uid()); vis public.pt_visibility := p_visibility; mb int; fo public.document_folders%rowtype;
  rq public.requests%rowtype; cm public.request_comments%rowtype; dv public.deliverables%rowtype; v_title text := private.pt_clean(p_title, 160); v_name text := private.pt_clean(p_original_name, 200);
begin
  select * into ca from public.client_accounts where id = p_client;
  if not found then raise exception 'sem permissão' using errcode = '42501'; end if;
  who := private.pt_actor(p_client);
  if ca.status <> 'active' or ca.archived_at is not null then raise exception 'conta de cliente inativa' using errcode = '23514'; end if;
  if p_storage_path !~ ('^' || ca.organization_id::text || '/' || p_client::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'caminho de armazenamento inválido' using errcode = '22023'; end if;
  select doc_max_mb into mb from public.portal_settings where organization_id = ca.organization_id;
  if p_size is null or p_size < 1 or p_size > coalesce(mb, 20)::bigint * 1048576 then raise exception 'arquivo acima do limite de % MB', coalesce(mb, 20) using errcode = '23514'; end if;
  if char_length(v_title) < 1 then v_title := left(v_name, 160); end if;
  if char_length(v_name) < 1 or v_name ~ '[/\\]' then raise exception 'nome de arquivo inválido' using errcode = '22023'; end if;
  if who = 'client' then vis := 'client'; end if;
  if p_folder is not null then
    select * into fo from public.document_folders where id = p_folder and client_account_id = p_client and archived_at is null;
    if not found then raise exception 'pasta inválida' using errcode = '22023'; end if;
    if who = 'client' and fo.visibility = 'internal' then raise exception 'sem permissão' using errcode = '42501'; end if;
    if fo.visibility = 'internal' then vis := 'internal'; end if;
  end if;
  if p_request is not null then
    select * into rq from public.requests where id = p_request and client_account_id = p_client;
    if not found then raise exception 'solicitação inválida' using errcode = '22023'; end if;
    if rq.status = 'cancelled' then raise exception 'solicitação cancelada não aceita anexos' using errcode = '23514'; end if;
    if p_comment is not null then
      select * into cm from public.request_comments where id = p_comment and request_id = p_request;
      if not found then raise exception 'comentário inválido' using errcode = '22023'; end if;
      if cm.visibility = 'internal' then
        if who = 'client' then raise exception 'sem permissão' using errcode = '42501'; end if;
        vis := 'internal';
      end if;
    end if;
  end if;
  if p_deliverable is not null then
    if who <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
    select * into dv from public.deliverables where id = p_deliverable and client_account_id = p_client;
    if not found or dv.status in ('cancelled', 'acknowledged') then raise exception 'entrega inválida' using errcode = '22023'; end if;
    if dv.status = 'published' then vis := 'client'; end if;
  end if;
  insert into public.documents (id, organization_id, client_account_id, folder_id, title, description, original_file_name, storage_path, mime_type, size_bytes, visibility, uploaded_by)
  values (did, ca.organization_id, p_client, p_folder, v_title, nullif(private.pt_clean(p_description, 600), ''), v_name, p_storage_path, p_mime, p_size, vis, me);
  if p_request is not null then insert into public.request_attachments (organization_id, client_account_id, request_id, comment_id, document_id) values (ca.organization_id, p_client, p_request, p_comment, did); end if;
  if p_deliverable is not null then insert into public.deliverable_files (organization_id, client_account_id, deliverable_id, document_id) values (ca.organization_id, p_client, p_deliverable, did); end if;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action) values (ca.organization_id, p_client, did, me, 'upload');
  if p_request is null and p_deliverable is null then
    if who = 'client' then perform private.pt_notify_staff(ca.organization_id, p_client, null, me, 'document', 'Novo documento de ' || ca.name, v_title, 'document', did, 'doc:' || did);
    elsif vis = 'client' then perform private.pt_notify_client(ca.organization_id, p_client, me, 'document', 'Novo documento disponível', v_title, 'document', did, 'doc:' || did); end if;
  end if;
  return did;
end $$;

-- Autoriza o acesso ao arquivo e registra. Devolve o caminho do Storage; o app só então pede a URL assinada (curta). Nunca confia no que o navegador enviou.
create function public.pt_document_access(p_document uuid, p_action text default 'download') returns text
language plpgsql security definer set search_path = '' as $$
declare d public.documents%rowtype; me uuid := (select auth.uid()); ok boolean := false;
begin
  if me is null or p_action not in ('download', 'view') then raise exception 'sem permissão' using errcode = '42501'; end if;
  select * into d from public.documents where id = p_document;
  if found then
    ok := private.pt_staff_sees_client(d.client_account_id) or (d.visibility = 'client' and d.archived_at is null and private.pt_client_role(d.client_account_id) is not null);
  end if;
  if not ok then raise exception 'documento indisponível' using errcode = '42501'; end if;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action) values (d.organization_id, d.client_account_id, d.id, me, p_action);
  return d.storage_path;
end $$;

create function public.pt_document_set_visibility(p_document uuid, p_visibility public.pt_visibility) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.documents%rowtype; fo public.document_folders%rowtype;
begin
  select * into d from public.documents where id = p_document for update;
  if not found or private.pt_actor(d.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.visibility = p_visibility then return; end if;
  if p_visibility = 'client' and d.folder_id is not null then
    select * into fo from public.document_folders where id = d.folder_id;
    if fo.visibility = 'internal' then raise exception 'a pasta é interna: mova o documento ou torne a pasta visível' using errcode = '23514'; end if;
  end if;
  if p_visibility = 'internal' and (exists (select 1 from public.deliverable_files f join public.deliverables v on v.id = f.deliverable_id where f.document_id = p_document and v.status in ('published', 'acknowledged'))
      or exists (select 1 from public.request_attachments a join public.request_comments c on c.id = a.comment_id where a.document_id = p_document and c.visibility = 'shared')) then
    raise exception 'o documento faz parte de uma entrega publicada ou de uma mensagem compartilhada' using errcode = '23514';
  end if;
  update public.documents set visibility = p_visibility where id = p_document;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action) values (d.organization_id, d.client_account_id, d.id, (select auth.uid()), 'visibility_changed');
end $$;

create function public.pt_document_archive(p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_document for update;
  if not found or private.pt_actor(d.client_account_id) <> 'staff' or not private.pt_is_manager(d.organization_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.archived_at is not null then return; end if;
  update public.documents set archived_at = now() where id = p_document;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action) values (d.organization_id, d.client_account_id, d.id, (select auth.uid()), 'archived');
end $$;

-- ======================================================================= entregas
create function public.pt_deliverable_create(p_client uuid, p_request uuid, p_title text, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ca public.client_accounts%rowtype; did uuid := gen_random_uuid(); v_title text := private.pt_clean(p_title, 160);
begin
  select * into ca from public.client_accounts where id = p_client;
  if not found or private.pt_actor(p_client) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if ca.status <> 'active' or ca.archived_at is not null then raise exception 'conta de cliente inativa' using errcode = '23514'; end if;
  if char_length(v_title) < 3 then raise exception 'informe o título da entrega' using errcode = '23514'; end if;
  if p_request is not null and not exists (select 1 from public.requests r where r.id = p_request and r.client_account_id = p_client) then raise exception 'solicitação inválida' using errcode = '22023'; end if;
  insert into public.deliverables (id, organization_id, client_account_id, request_id, title, description) values (did, ca.organization_id, p_client, p_request, v_title, nullif(private.pt_clean(p_description, 4000), ''));
  return did;
end $$;

create function public.pt_deliverable_update(p_id uuid, p_title text, p_description text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deliverables%rowtype; v_title text := private.pt_clean(p_title, 160);
begin
  select * into d from public.deliverables where id = p_id for update;
  if not found or private.pt_actor(d.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.status not in ('draft', 'in_preparation', 'ready') then raise exception 'entrega publicada ou encerrada não pode ser editada' using errcode = '23514'; end if;
  if char_length(v_title) < 3 then raise exception 'informe o título da entrega' using errcode = '23514'; end if;
  update public.deliverables set title = v_title, description = nullif(private.pt_clean(p_description, 4000), '') where id = p_id;
end $$;

create function public.pt_deliverable_attach(p_deliverable uuid, p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deliverables%rowtype; x public.documents%rowtype;
begin
  select * into d from public.deliverables where id = p_deliverable for update;
  if not found or private.pt_actor(d.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.status in ('cancelled', 'acknowledged') then raise exception 'entrega encerrada' using errcode = '23514'; end if;
  select * into x from public.documents where id = p_document and client_account_id = d.client_account_id and archived_at is null;
  if not found then raise exception 'documento inválido' using errcode = '22023'; end if;
  insert into public.deliverable_files (organization_id, client_account_id, deliverable_id, document_id) values (d.organization_id, d.client_account_id, d.id, x.id) on conflict do nothing;
  if d.status = 'published' and x.visibility = 'internal' then update public.documents set visibility = 'client' where id = x.id; end if;
end $$;

create function public.pt_deliverable_detach(p_deliverable uuid, p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deliverables%rowtype;
begin
  select * into d from public.deliverables where id = p_deliverable for update;
  if not found or private.pt_actor(d.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.status in ('published', 'acknowledged', 'cancelled') then raise exception 'não é possível remover arquivos de uma entrega publicada' using errcode = '23514'; end if;
  delete from public.deliverable_files where deliverable_id = p_deliverable and document_id = p_document;
end $$;

create function private.pt_deliverable_ok(from_s public.pt_deliverable_status, to_s public.pt_deliverable_status) returns boolean
language sql immutable set search_path = '' as $$
  select (from_s, to_s) in (('draft', 'in_preparation'), ('draft', 'ready'), ('draft', 'cancelled'), ('in_preparation', 'draft'), ('in_preparation', 'ready'), ('in_preparation', 'cancelled'),
    ('ready', 'in_preparation'), ('ready', 'published'), ('ready', 'cancelled'), ('published', 'cancelled'));
$$;

create function public.pt_deliverable_set_status(p_id uuid, p_status public.pt_deliverable_status) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deliverables%rowtype; me uuid := (select auth.uid()); has_files boolean;
begin
  select * into d from public.deliverables where id = p_id for update;
  if not found or private.pt_actor(d.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if not private.pt_deliverable_ok(d.status, p_status) then raise exception 'transição não permitida: % → %', d.status, p_status using errcode = '23514'; end if;
  if p_status = 'published' then
    select exists (select 1 from public.deliverable_files f where f.deliverable_id = p_id) into has_files;
    if not has_files and nullif(btrim(coalesce(d.description, '')), '') is null then raise exception 'inclua ao menos um arquivo ou uma descrição antes de publicar' using errcode = '23514'; end if;
    update public.documents set visibility = 'client' where id in (select document_id from public.deliverable_files where deliverable_id = p_id) and visibility = 'internal';
    update public.deliverables set status = 'published', delivered_at = now(), published_by = me where id = p_id;
    perform private.pt_notify_client(d.organization_id, d.client_account_id, me, 'deliverable_published', 'Nova entrega publicada', d.title, 'deliverable', d.id, 'dl:' || d.id);
  else
    update public.deliverables set status = p_status where id = p_id;
  end if;
end $$;

create function public.pt_deliverable_acknowledge(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deliverables%rowtype; me uuid := (select auth.uid()); req_assignee uuid;
begin
  select * into d from public.deliverables where id = p_id for update;
  if not found or private.pt_actor(d.client_account_id) <> 'client' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.status <> 'published' then raise exception 'só entregas publicadas podem ter o recebimento confirmado' using errcode = '23514'; end if;
  update public.deliverables set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = me where id = p_id;
  select assigned_to into req_assignee from public.requests where id = d.request_id;
  perform private.pt_notify_staff(d.organization_id, d.client_account_id, coalesce(req_assignee, d.created_by), me, 'deliverable_ack', 'Recebimento confirmado', d.title, 'deliverable', d.id, 'ack:' || d.id);
end $$;

-- ======================================================================= comunicados
create function public.pt_announcement_publish(p_id uuid, p_recipients uuid[] default null, p_publish_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.announcements%rowtype; at_ timestamptz := coalesce(p_publish_at, now()); cl record; n int;
begin
  select * into a from public.announcements where id = p_id for update;
  if not found or (select auth.uid()) is null or not private.pt_is_manager(a.organization_id) or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if a.published_at is not null or a.archived_at is not null then raise exception 'o comunicado já foi publicado ou arquivado' using errcode = '23514'; end if;
  if at_ < now() - interval '1 minute' then raise exception 'a data de publicação não pode estar no passado' using errcode = '22023'; end if;
  if a.expires_at is not null and a.expires_at <= at_ then raise exception 'a expiração precisa ser depois da publicação' using errcode = '22023'; end if;
  delete from public.announcement_recipients where announcement_id = p_id;
  if a.audience = 'selected' then
    insert into public.announcement_recipients (announcement_id, client_account_id, organization_id)
      select p_id, ca.id, a.organization_id from public.client_accounts ca where ca.organization_id = a.organization_id and ca.id = any (coalesce(p_recipients, '{}')) and ca.archived_at is null;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'escolha ao menos um cliente destinatário' using errcode = '23514'; end if;
  end if;
  update public.announcements set published_at = at_ where id = p_id;
  if at_ <= now() then
    for cl in select ca.id from public.client_accounts ca where ca.organization_id = a.organization_id and ca.status = 'active' and ca.archived_at is null
              and (a.audience = 'all' or exists (select 1 from public.announcement_recipients rc where rc.announcement_id = a.id and rc.client_account_id = ca.id)) loop
      perform private.pt_notify_client(a.organization_id, cl.id, (select auth.uid()), 'announcement', 'Novo comunicado: ' || a.title, left(a.body, 140), 'announcement', a.id, 'an:' || a.id || ':' || cl.id);
    end loop;
    update public.announcements set notified_at = now() where id = p_id;
  end if;
end $$;

-- ======================================================================= convites
create function public.pt_invite_create(p_org uuid, p_kind text, p_client uuid, p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); v_email text := lower(btrim(coalesce(p_email, ''))); token text; iid uuid := gen_random_uuid(); exp timestamptz := now() + interval '7 days'; ca public.client_accounts%rowtype;
begin
  if me is null or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+$' or char_length(v_email) > 254 then raise exception 'e-mail inválido' using errcode = '22023'; end if;
  if p_kind = 'client' then
    select * into ca from public.client_accounts where id = p_client and organization_id = p_org;
    if not found or ca.archived_at is not null or ca.status <> 'active' then raise exception 'conta de cliente inválida' using errcode = '22023'; end if;
    if p_role not in ('client_admin', 'client_user') then raise exception 'papel inválido' using errcode = '22023'; end if;
    if not (private.pt_staff_writes_client(p_client) and private.pt_is_manager(p_org)) and private.pt_client_role(p_client) is distinct from 'client_admin' then raise exception 'sem permissão' using errcode = '42501'; end if;
    if exists (select 1 from public.client_members cm join auth.users u on u.id = cm.user_id where cm.client_account_id = p_client and cm.status = 'active' and lower(u.email) = v_email) then raise exception 'esta pessoa já tem acesso a esta conta' using errcode = '23505'; end if;
    update public.invitation_tokens set revoked_at = now() where client_account_id = p_client and invited_email = v_email and accepted_at is null and revoked_at is null;
  elsif p_kind = 'staff' then
    if not private.pt_is_admin(p_org) then raise exception 'sem permissão' using errcode = '42501'; end if;
    if p_role not in ('admin', 'manager', 'member', 'viewer') then raise exception 'papel inválido' using errcode = '22023'; end if;
    if exists (select 1 from public.organization_members m join auth.users u on u.id = m.user_id where m.organization_id = p_org and lower(u.email) = v_email) then raise exception 'esta pessoa já faz parte da equipe' using errcode = '23505'; end if;
    update public.invitation_tokens set revoked_at = now() where organization_id = p_org and kind = 'staff' and invited_email = v_email and accepted_at is null and revoked_at is null;
    p_client := null;
  else raise exception 'tipo de convite inválido' using errcode = '22023'; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitation_tokens (id, organization_id, client_account_id, kind, invited_email, invited_role, token_hash, expires_at, created_by)
  values (iid, p_org, p_client, p_kind, v_email, p_role, encode(sha256(convert_to(token, 'UTF8')), 'hex'), exp, me);
  return jsonb_build_object('id', iid, 'token', token, 'expires_at', exp);
end $$;

create function public.pt_invite_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invitation_tokens%rowtype;
begin
  select * into i from public.invitation_tokens where id = p_id for update;
  if not found or (select auth.uid()) is null or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if not (case when i.kind = 'staff' then private.pt_is_admin(i.organization_id) else (private.pt_is_manager(i.organization_id) or private.pt_client_role(i.client_account_id) = 'client_admin') end) then raise exception 'sem permissão' using errcode = '42501'; end if;
  update public.invitation_tokens set revoked_at = now() where id = p_id and accepted_at is null and revoked_at is null;
end $$;

-- Aceite: exige sessão cujo e-mail é o do convite. Qualquer falha devolve a MESMA mensagem (sem enumerar convites).
create function public.pt_invite_accept(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); mail text := lower(coalesce((select auth.jwt()) ->> 'email', '')); i public.invitation_tokens%rowtype; h text;
begin
  if me is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'convite inválido ou expirado' using errcode = '42501'; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into i from public.invitation_tokens where token_hash = h for update;
  if not found or i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now() or i.invited_email <> mail then raise exception 'convite inválido ou expirado' using errcode = '42501'; end if;
  if i.kind = 'client' then
    if not exists (select 1 from public.client_accounts ca where ca.id = i.client_account_id and ca.status = 'active' and ca.archived_at is null) then raise exception 'convite inválido ou expirado' using errcode = '42501'; end if;
    insert into public.client_members (organization_id, client_account_id, user_id, role, status, invited_at) values (i.organization_id, i.client_account_id, me, i.invited_role::public.pt_client_role, 'active', i.created_at)
    on conflict (client_account_id, user_id) do update set status = 'active', role = excluded.role;
  else
    insert into public.organization_members (organization_id, user_id, role) values (i.organization_id, me, i.invited_role::public.org_role) on conflict do nothing;
  end if;
  update public.invitation_tokens set accepted_at = now(), accepted_by = me where id = i.id;
  return jsonb_build_object('kind', i.kind, 'organization_id', i.organization_id, 'client_account_id', i.client_account_id);
end $$;

-- ======================================================================= membros da conta do cliente
create function public.pt_client_member_set(p_member uuid, p_status text, p_role public.pt_client_role) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.client_members%rowtype; me uuid := (select auth.uid()); by_staff boolean; admins int;
begin
  select * into m from public.client_members where id = p_member for update;
  if not found or me is null or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  by_staff := private.pt_staff_writes_client(m.client_account_id) and private.pt_is_manager(m.organization_id);
  if not by_staff and private.pt_client_role(m.client_account_id) is distinct from 'client_admin' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'situação inválida' using errcode = '22023'; end if;
  if not by_staff and m.user_id = me and p_status = 'inactive' then raise exception 'você não pode desativar o próprio acesso' using errcode = '23514'; end if;
  if m.status = 'active' and m.role = 'client_admin' and (p_status = 'inactive' or p_role = 'client_user') and not by_staff then
    select count(*) into admins from public.client_members x where x.client_account_id = m.client_account_id and x.role = 'client_admin' and x.status = 'active' and x.id <> m.id;
    if admins = 0 then raise exception 'a conta precisa manter ao menos um administrador ativo' using errcode = '23514'; end if;
  end if;
  update public.client_members set status = p_status, role = p_role where id = p_member;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.pt_folder_create(uuid, uuid, text, public.pt_visibility)', 'public.pt_folder_archive(uuid)',
    'public.pt_document_register(uuid, uuid, text, text, text, text, text, bigint, public.pt_visibility, uuid, uuid, uuid)', 'public.pt_document_access(uuid, text)',
    'public.pt_document_set_visibility(uuid, public.pt_visibility)', 'public.pt_document_archive(uuid)', 'public.pt_deliverable_create(uuid, uuid, text, text)', 'public.pt_deliverable_update(uuid, text, text)',
    'public.pt_deliverable_attach(uuid, uuid)', 'public.pt_deliverable_detach(uuid, uuid)', 'public.pt_deliverable_set_status(uuid, public.pt_deliverable_status)', 'public.pt_deliverable_acknowledge(uuid)',
    'public.pt_announcement_publish(uuid, uuid[], timestamptz)', 'public.pt_invite_create(uuid, text, uuid, text, text)', 'public.pt_invite_revoke(uuid)', 'public.pt_invite_accept(text)',
    'public.pt_client_member_set(uuid, text, public.pt_client_role)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ======================================================================= Storage (bucket privado + políticas) — só quando o schema storage existe (Supabase)
do $storage$
begin
  if to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('portal-documents', 'portal-documents', false, 52428800, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'text/plain'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy portal_docs_select on storage.objects for select to authenticated using (
      bucket_id = 'portal-documents' and exists (select 1 from public.documents d where d.storage_path = objects.name
        and (private.pt_staff_sees_client(d.client_account_id) or (d.visibility = 'client' and d.archived_at is null and private.pt_client_role(d.client_account_id) is not null))))$p$;
    -- ATENÇÃO: dentro das subconsultas, `name` sem qualificar seria client_accounts.name; por isso `objects.name` em todas as políticas.
    -- envio: o caminho TEM de ser <org>/<cliente>/<uuid> e quem envia precisa poder escrever naquela conta
    execute $p$create policy portal_docs_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'portal-documents'
      and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (select 1 from public.client_accounts ca where ca.id::text = split_part(objects.name, '/', 2) and ca.organization_id::text = split_part(objects.name, '/', 1)
        and (private.pt_staff_writes_client(ca.id) or private.pt_client_role(ca.id) is not null)))$p$;
    -- limpeza de órfãos: quem enviou pode apagar o PRÓPRIO objeto enquanto ele ainda não foi registrado em documents (falha entre o envio e o registro)
    execute $p$create policy portal_docs_delete_orphan on storage.objects for delete to authenticated using (
      bucket_id = 'portal-documents' and owner_id = (select auth.uid())::text and not exists (select 1 from public.documents d where d.storage_path = objects.name))$p$;
  end if;
end
$storage$;

commit;
