-- Portal de Clientes B2B — FLUXO (parte 2): horas úteis e prazos, notificações, solicitações (máquina de estados), comentários e rotina de SLA.
-- Toda função confere sessão, MFA (administradores), vínculo e papel DENTRO dela: o servidor do app nunca decide sozinho.

begin;
set local check_function_bodies = off;

-- ======================================================================= horas úteis
-- Soma `p_hours` horas ÚTEIS a `p_start`. Dias úteis (ISO: 1=segunda … 7=domingo) e expediente [p_open, p_close) no fuso informado.
-- Fora do expediente o relógio só corre a partir da próxima abertura. Não considera feriados (limitação documentada).
create function public.pt_add_business_hours(p_start timestamptz, p_hours numeric, p_tz text, p_days integer[], p_open time, p_close time) returns timestamptz
language plpgsql immutable set search_path = '' as $$
declare t timestamp; rem numeric; avail numeric; d date; i int := 0;
begin
  if p_start is null or p_hours is null or p_hours < 0 or p_hours > 100000 or p_open >= p_close or cardinality(p_days) = 0 then raise exception 'parâmetros de horas úteis inválidos' using errcode = '22023'; end if;
  t := p_start at time zone p_tz;
  rem := p_hours * 60;
  loop
    i := i + 1;
    if i > 20000 then raise exception 'horas úteis fora do alcance' using errcode = '22023'; end if;
    d := t::date;
    if extract(isodow from t)::int = any (p_days) then
      if t < d + p_open then t := d + p_open; end if;
      if t < d + p_close then
        avail := extract(epoch from ((d + p_close) - t)) / 60;
        if rem <= avail then t := t + rem * interval '1 minute'; exit; end if;
        rem := rem - avail;
      end if;
    end if;
    t := (d + 1)::timestamp;
  end loop;
  return t at time zone p_tz;
end $$;
revoke all on function public.pt_add_business_hours(timestamptz, numeric, text, integer[], time, time) from public, anon;
grant execute on function public.pt_add_business_hours(timestamptz, numeric, text, integer[], time, time) to authenticated;

-- Prazo pela política ativa da prioridade (nulo se não houver política ativa).
create function private.pt_policy_due(org uuid, prio public.pt_priority, start_at timestamptz, out due timestamptz, out policy uuid)
language plpgsql stable security definer set search_path = '' as $$
declare s public.portal_settings%rowtype; pol public.service_level_policies%rowtype;
begin
  select * into pol from public.service_level_policies where organization_id = org and priority = prio and active;
  if not found then return; end if;
  select * into s from public.portal_settings where organization_id = org;
  due := public.pt_add_business_hours(start_at, pol.target_hours, s.timezone, s.business_days, s.business_start, s.business_end);
  policy := pol.id;
end $$;
revoke all on function private.pt_policy_due(uuid, public.pt_priority, timestamptz) from public;

-- ======================================================================= notificações
create function private.pt_notify_user(org uuid, client uuid, usr uuid, p_type text, p_title text, p_body text, p_rtype text, p_rid uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if usr is null then return; end if;
  -- só para quem ainda tem acesso (equipe da prestadora ou membro ATIVO da conta); respeita tipos silenciados
  if not (exists (select 1 from public.organization_members m where m.organization_id = org and m.user_id = usr)
       or (client is not null and exists (select 1 from public.client_members cm where cm.client_account_id = client and cm.user_id = usr and cm.status = 'active'))) then return; end if;
  if exists (select 1 from public.notification_preferences np where np.user_id = usr and p_type = any (np.muted_types)) then return; end if;
  insert into public.notifications (organization_id, client_account_id, user_id, type, title, body, resource_type, resource_id, dedup_key)
  values (org, client, usr, p_type, left(p_title, 160), left(p_body, 400), p_rtype, p_rid, p_key) on conflict do nothing;
end $$;
revoke all on function private.pt_notify_user(uuid, uuid, uuid, text, text, text, text, uuid, text) from public;

-- Equipe interessada: responsável da solicitação, gestor da conta; sem nenhum dos dois, a gestão. Nunca o próprio autor.
create function private.pt_notify_staff(org uuid, client uuid, assignee uuid, actor uuid, p_type text, p_title text, p_body text, p_rtype text, p_rid uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare mgr uuid; r record; sent boolean := false;
begin
  select assigned_manager_id into mgr from public.client_accounts where id = client;
  for r in select distinct u from (values (assignee), (mgr)) v(u) where u is not null and u is distinct from actor loop
    perform private.pt_notify_user(org, client, r.u, p_type, p_title, p_body, p_rtype, p_rid, p_key || ':' || r.u); sent := true;
  end loop;
  if not sent then
    for r in select m.user_id as u from public.organization_members m where m.organization_id = org and m.role in ('owner', 'admin', 'manager') and m.user_id is distinct from actor loop
      perform private.pt_notify_user(org, client, r.u, p_type, p_title, p_body, p_rtype, p_rid, p_key || ':' || r.u);
    end loop;
  end if;
end $$;
revoke all on function private.pt_notify_staff(uuid, uuid, uuid, uuid, text, text, text, text, uuid, text) from public;

create function private.pt_notify_client(org uuid, client uuid, actor uuid, p_type text, p_title text, p_body text, p_rtype text, p_rid uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select cm.user_id as u from public.client_members cm where cm.client_account_id = client and cm.status = 'active' and cm.user_id is distinct from actor loop
    perform private.pt_notify_user(org, client, r.u, p_type, p_title, p_body, p_rtype, p_rid, p_key || ':' || r.u);
  end loop;
end $$;
revoke all on function private.pt_notify_client(uuid, uuid, uuid, text, text, text, text, uuid, text) from public;

-- ======================================================================= acesso nas funções
-- 'staff' (escreve pela prestadora), 'client' (membro ativo da conta) ou nulo. Exige MFA onde o Core exige.
create function private.pt_actor(client uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if private.pt_staff_writes_client(client) then return 'staff'; end if;
  if private.pt_client_role(client) is not null then return 'client'; end if;
  raise exception 'sem permissão' using errcode = '42501';
end $$;
revoke all on function private.pt_actor(uuid) from public;

create function private.pt_clean(t text, max_len int) returns text language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(coalesce(t, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F]', '', 'g')), max_len);
$$;

-- ======================================================================= solicitações
create function public.pt_request_create(p_client uuid, p_title text, p_description text, p_category uuid, p_priority public.pt_priority default 'normal',
  p_assigned_to uuid default null, p_due_at timestamptz default null, p_due_kind text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ca public.client_accounts%rowtype; who text; me uuid := (select auth.uid()); n int; rid uuid := gen_random_uuid(); due timestamptz; kind text; pol uuid; v_title text := private.pt_clean(p_title, 160);
begin
  select * into ca from public.client_accounts where id = p_client;
  if not found then raise exception 'sem permissão' using errcode = '42501'; end if;
  who := private.pt_actor(p_client);
  if ca.status <> 'active' or ca.archived_at is not null then raise exception 'conta de cliente inativa' using errcode = '23514'; end if;
  if char_length(v_title) < 3 then raise exception 'informe o título da solicitação' using errcode = '23514'; end if;
  if who = 'client' and p_priority = 'urgent' then raise exception 'a prioridade urgente é definida pela prestadora' using errcode = '23514'; end if;
  if p_category is not null and not exists (select 1 from public.service_categories c where c.id = p_category and c.organization_id = ca.organization_id and c.active) then raise exception 'categoria inválida' using errcode = '22023'; end if;
  if who = 'staff' then
    if p_assigned_to is not null and not exists (select 1 from public.organization_members m where m.organization_id = ca.organization_id and m.user_id = p_assigned_to and m.role <> 'viewer') then raise exception 'responsável inválido' using errcode = '22023'; end if;
    if p_due_at is not null then
      if p_due_at <= now() then raise exception 'o prazo precisa estar no futuro' using errcode = '22023'; end if;
      kind := coalesce(p_due_kind, 'agreed');
      if kind not in ('agreed', 'estimate') then raise exception 'tipo de prazo inválido' using errcode = '22023'; end if;
      due := p_due_at;
    end if;
  else p_assigned_to := null; end if;
  if due is null then select d.due, d.policy into due, pol from private.pt_policy_due(ca.organization_id, p_priority, now()) d; if due is not null then kind := 'policy'; end if; end if;

  update public.request_counters set last_number = last_number + 1 where organization_id = ca.organization_id returning last_number into n;
  if n is null then insert into public.request_counters (organization_id, last_number) values (ca.organization_id, 1) returning last_number into n; end if;
  insert into public.requests (id, organization_id, client_account_id, number, category_id, title, description, priority, created_by, assigned_to, due_at, due_kind)
  values (rid, ca.organization_id, p_client, n, p_category, v_title, nullif(private.pt_clean(p_description, 8000), ''), p_priority, me, p_assigned_to, due, kind);
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by) values (ca.organization_id, p_client, rid, null, 'open', me);
  if due is not null then
    insert into public.request_deadline_events (organization_id, client_account_id, request_id, policy_id, due_kind, target_at, reason, changed_by) values (ca.organization_id, p_client, rid, pol, kind, due, 'Prazo inicial', me);
  end if;
  if who = 'client' then
    perform private.pt_notify_staff(ca.organization_id, p_client, null, me, 'request_created', 'Nova solicitação #' || n, ca.name || ': ' || v_title, 'request', rid, 'rq:' || rid);
  else
    if p_assigned_to is not null then perform private.pt_notify_user(ca.organization_id, p_client, p_assigned_to, 'request_assigned', 'Solicitação #' || n || ' atribuída a você', v_title, 'request', rid, 'asg:' || rid || ':' || p_assigned_to); end if;
    perform private.pt_notify_client(ca.organization_id, p_client, me, 'request_created', 'Nova solicitação #' || n, v_title, 'request', rid, 'rq:' || rid);
  end if;
  return jsonb_build_object('id', rid, 'number', n);
end $$;

-- Regras de transição (única fonte). who = 'staff' | 'client'.
create function private.pt_transition_ok(who text, from_s public.pt_request_status, to_s public.pt_request_status) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when from_s = to_s then false
    when who = 'client' then (to_s = 'cancelled' and from_s in ('open', 'in_review')) or (from_s = 'completed' and to_s = 'open')
    when from_s = 'cancelled' then false
    when from_s = 'completed' then to_s = 'open'
    when to_s = 'open' then false
    else true end;
$$;

create function public.pt_request_set_status(p_request uuid, p_status public.pt_request_status, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; who text; me uuid := (select auth.uid()); reason text := nullif(private.pt_clean(p_reason, 500), ''); win int; ev bigint; tz text;
begin
  select * into r from public.requests where id = p_request for update;
  if not found then raise exception 'sem permissão' using errcode = '42501'; end if;
  who := private.pt_actor(r.client_account_id);
  if not private.pt_transition_ok(who, r.status, p_status) then raise exception 'transição não permitida: % → %', r.status, p_status using errcode = '23514'; end if;
  if p_status in ('cancelled') and reason is null then raise exception 'informe o motivo do cancelamento' using errcode = '23514'; end if;
  if r.status = 'completed' and p_status = 'open' then
    if reason is null then raise exception 'informe o motivo da reabertura' using errcode = '23514'; end if;
    if who = 'client' then
      select reopen_window_days into win from public.portal_settings where organization_id = r.organization_id;
      if r.completed_at is null or r.completed_at < now() - make_interval(days => coalesce(win, 15)) then raise exception 'o prazo para reabrir esta solicitação terminou; abra uma nova' using errcode = '23514'; end if;
    end if;
  end if;
  update public.requests set status = p_status, updated_at = now(), last_activity_at = now(),
    started_at = case when p_status = 'in_progress' and started_at is null then now() else started_at end,
    completed_at = case when p_status = 'completed' then now() else null end,
    closed_at = case when p_status = 'cancelled' then now() else null end,
    reopened_count = reopened_count + case when r.status = 'completed' and p_status = 'open' then 1 else 0 end
   where id = p_request;
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason) values (r.organization_id, r.client_account_id, r.id, r.status, p_status, me, reason);
  if p_status = 'completed' and r.due_at is not null and now() > r.due_at then
    select max(id) into ev from public.request_deadline_events where request_id = r.id;
    update public.request_deadline_events set breached_at = coalesce(breached_at, r.due_at) where id = ev;
  end if;
  if who = 'client' then
    perform private.pt_notify_staff(r.organization_id, r.client_account_id, r.assigned_to, me, 'request_status', 'Solicitação #' || r.number || ': ' || p_status, r.title, 'request', r.id, 'st:' || r.id || ':' || p_status || ':' || r.reopened_count || ':' || extract(epoch from now())::bigint);
  else
    perform private.pt_notify_client(r.organization_id, r.client_account_id, me, 'request_status', 'Solicitação #' || r.number || ' mudou de situação', r.title, 'request', r.id, 'st:' || r.id || ':' || p_status || ':' || r.reopened_count || ':' || extract(epoch from now())::bigint);
  end if;
  return jsonb_build_object('status', p_status);
end $$;

create function public.pt_request_assign(p_request uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; me uuid := (select auth.uid()); role_ public.org_role;
begin
  select * into r from public.requests where id = p_request for update;
  if not found or private.pt_actor(r.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  role_ := private.pt_role(r.organization_id);
  -- colaborador só assume para si uma solicitação ainda sem responsável
  if role_ = 'member' and not (p_user = me and r.assigned_to is null) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_user is not null and not exists (select 1 from public.organization_members m where m.organization_id = r.organization_id and m.user_id = p_user and m.role <> 'viewer') then raise exception 'responsável inválido' using errcode = '22023'; end if;
  if r.assigned_to is not distinct from p_user then return; end if;
  update public.requests set assigned_to = p_user, updated_at = now(), last_activity_at = now() where id = p_request;
  perform private.pt_notify_user(r.organization_id, r.client_account_id, p_user, 'request_assigned', 'Solicitação #' || r.number || ' atribuída a você', r.title, 'request', r.id, 'asg:' || r.id || ':' || p_user);
end $$;

-- Edição de dados pela prestadora. Mudar a prioridade recalcula o prazo SE ele vem da política (prazo acordado/estimativa não é sobrescrito).
create function public.pt_request_edit(p_request uuid, p_title text, p_description text, p_category uuid, p_priority public.pt_priority) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; due timestamptz; pol uuid; v_title text := private.pt_clean(p_title, 160); me uuid := (select auth.uid());
begin
  select * into r from public.requests where id = p_request for update;
  if not found or private.pt_actor(r.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if r.status in ('completed', 'cancelled') then raise exception 'solicitação encerrada não pode ser editada' using errcode = '23514'; end if;
  if char_length(v_title) < 3 then raise exception 'informe o título da solicitação' using errcode = '23514'; end if;
  if p_category is not null and not exists (select 1 from public.service_categories c where c.id = p_category and c.organization_id = r.organization_id) then raise exception 'categoria inválida' using errcode = '22023'; end if;
  update public.requests set title = v_title, description = nullif(private.pt_clean(p_description, 8000), ''), category_id = p_category, priority = p_priority, updated_at = now(), last_activity_at = now() where id = p_request;
  if r.priority <> p_priority and r.due_kind = 'policy' then
    select d.due, d.policy into due, pol from private.pt_policy_due(r.organization_id, p_priority, r.created_at) d;
    update public.requests set due_at = due, due_kind = case when due is null then null else 'policy' end where id = p_request;
    insert into public.request_deadline_events (organization_id, client_account_id, request_id, policy_id, due_kind, target_at, reason, changed_by)
    values (r.organization_id, r.client_account_id, r.id, pol, 'policy', due, 'Prioridade alterada de ' || r.priority || ' para ' || p_priority, me);
  end if;
end $$;

create function public.pt_request_set_due(p_request uuid, p_due timestamptz, p_kind text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; reason text := nullif(private.pt_clean(p_reason, 300), ''); me uuid := (select auth.uid());
begin
  select * into r from public.requests where id = p_request for update;
  if not found or private.pt_actor(r.client_account_id) <> 'staff' then raise exception 'sem permissão' using errcode = '42501'; end if;
  if not private.pt_is_manager(r.organization_id) then raise exception 'sem permissão' using errcode = '42501'; end if; -- prazo combinado: gestão
  if r.status in ('completed', 'cancelled') then raise exception 'solicitação encerrada não tem prazo editável' using errcode = '23514'; end if;
  if p_kind not in ('agreed', 'estimate') then raise exception 'tipo de prazo inválido' using errcode = '22023'; end if;
  if p_due is null or p_due <= now() then raise exception 'o prazo precisa estar no futuro' using errcode = '22023'; end if;
  if reason is null then raise exception 'informe o motivo da alteração do prazo' using errcode = '23514'; end if;
  update public.requests set due_at = p_due, due_kind = p_kind, updated_at = now(), last_activity_at = now() where id = p_request;
  insert into public.request_deadline_events (organization_id, client_account_id, request_id, due_kind, target_at, reason, changed_by) values (r.organization_id, r.client_account_id, r.id, p_kind, p_due, reason, me);
  perform private.pt_notify_client(r.organization_id, r.client_account_id, me, 'request_due', 'Novo prazo da solicitação #' || r.number, r.title, 'request', r.id, 'due:' || r.id || ':' || extract(epoch from p_due)::bigint);
end $$;

-- ======================================================================= comentários
create function public.pt_comment_add(p_request uuid, p_body text, p_visibility public.pt_comment_visibility default 'shared') returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; who text; me uuid := (select auth.uid()); cid uuid := gen_random_uuid(); v_body text := private.pt_clean(p_body, 5000);
begin
  select * into r from public.requests where id = p_request for update;
  if not found then raise exception 'sem permissão' using errcode = '42501'; end if;
  who := private.pt_actor(r.client_account_id);
  if char_length(v_body) < 1 then raise exception 'escreva a mensagem' using errcode = '23514'; end if;
  if r.status = 'cancelled' then raise exception 'solicitação cancelada não aceita novos comentários' using errcode = '23514'; end if;
  if who = 'client' and p_visibility <> 'shared' then raise exception 'sem permissão' using errcode = '42501'; end if;
  insert into public.request_comments (id, organization_id, client_account_id, request_id, author_id, body, visibility) values (cid, r.organization_id, r.client_account_id, r.id, me, v_body, p_visibility);
  update public.requests set last_activity_at = now(), updated_at = now() where id = r.id;
  if who = 'client' and r.status = 'waiting_client' then
    update public.requests set status = 'waiting_provider' where id = r.id;
    insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason) values (r.organization_id, r.client_account_id, r.id, 'waiting_client', 'waiting_provider', me, 'Resposta do cliente');
  end if;
  if p_visibility = 'shared' and who = 'client' then perform private.pt_notify_staff(r.organization_id, r.client_account_id, r.assigned_to, me, 'request_comment', 'Nova mensagem na solicitação #' || r.number, left(v_body, 140), 'request', r.id, 'cm:' || cid);
  elsif p_visibility = 'shared' then perform private.pt_notify_client(r.organization_id, r.client_account_id, me, 'request_comment', 'Nova mensagem na solicitação #' || r.number, left(v_body, 140), 'request', r.id, 'cm:' || cid);
  elsif r.assigned_to is not null and r.assigned_to <> me then perform private.pt_notify_user(r.organization_id, r.client_account_id, r.assigned_to, 'request_internal', 'Nota interna na solicitação #' || r.number, left(v_body, 140), 'request', r.id, 'cm:' || cid || ':' || r.assigned_to); end if;
  return cid;
end $$;

-- ======================================================================= rotina de prazos e comunicados agendados
-- Cria avisos de prazo próximo/vencido (uma vez por solicitação e prazo), registra estouro e dispara comunicados publicados ainda não avisados. Idempotente.
create function private.pt_refresh_org(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.portal_settings%rowtype; r record; a record; soon int := 0; late int := 0; ann int := 0; cl record;
begin
  select * into s from public.portal_settings where organization_id = p_org;
  for r in select q.* from public.requests q where q.organization_id = p_org and q.status not in ('completed', 'cancelled') and q.due_at is not null and q.due_at <= now() + make_interval(hours => s.alert_due_soon_hours) loop
    if r.due_at > now() then
      perform private.pt_notify_staff(p_org, r.client_account_id, r.assigned_to, null, 'request_due_soon', 'Prazo próximo: solicitação #' || r.number, r.title, 'request', r.id, 'soon:' || r.id || ':' || extract(epoch from r.due_at)::bigint); soon := soon + 1;
    else
      perform private.pt_notify_staff(p_org, r.client_account_id, r.assigned_to, null, 'request_overdue', 'Prazo vencido: solicitação #' || r.number, r.title, 'request', r.id, 'late:' || r.id || ':' || extract(epoch from r.due_at)::bigint); late := late + 1;
      update public.request_deadline_events set breached_at = r.due_at where id = (select max(id) from public.request_deadline_events where request_id = r.id) and breached_at is null;
    end if;
  end loop;
  for a in select * from public.announcements where organization_id = p_org and published_at is not null and published_at <= now() and archived_at is null and notified_at is null and (expires_at is null or expires_at > now()) loop
    for cl in select ca.id from public.client_accounts ca where ca.organization_id = p_org and ca.status = 'active' and ca.archived_at is null
              and (a.audience = 'all' or exists (select 1 from public.announcement_recipients rc where rc.announcement_id = a.id and rc.client_account_id = ca.id)) loop
      perform private.pt_notify_client(p_org, cl.id, null, 'announcement', 'Novo comunicado: ' || a.title, left(a.body, 140), 'announcement', a.id, 'an:' || a.id || ':' || cl.id);
    end loop;
    update public.announcements set notified_at = now() where id = a.id;
    ann := ann + 1;
  end loop;
  return jsonb_build_object('due_soon', soon, 'overdue', late, 'announcements', ann);
end $$;
revoke all on function private.pt_refresh_org(uuid) from public, anon, authenticated;

-- Entrada para pessoas: gestão com MFA, pela interface.
create function public.pt_refresh(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.pt_is_manager(p_org) or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  return private.pt_refresh_org(p_org);
end $$;

-- Entrada para o AGENDADOR (pg_cron roda como o dono do banco, sem usuário): todas as organizações. Ninguém da API a executa.
-- Exemplo (Supabase): select cron.schedule('pt-refresh', '*/15 * * * *', 'select private.pt_refresh_all()');
create function private.pt_refresh_all() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; r jsonb; soon int := 0; late int := 0; ann int := 0;
begin
  for o in select id from public.organizations loop
    r := private.pt_refresh_org(o.id);
    soon := soon + (r ->> 'due_soon')::int; late := late + (r ->> 'overdue')::int; ann := ann + (r ->> 'announcements')::int;
  end loop;
  return jsonb_build_object('due_soon', soon, 'overdue', late, 'announcements', ann);
end $$;
revoke all on function private.pt_refresh_all() from public, anon, authenticated;

-- ======================================================================= nomes de usuários (sem expor e-mail a clientes)
create function public.pt_user_labels(p_org uuid) returns table (user_id uuid, label text, kind text)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  staff as (select m.user_id, m.role from public.organization_members m where m.organization_id = p_org),
  is_staff as (select exists (select 1 from staff s, me where s.user_id = me.uid) as v)
  -- equipe vê todos (equipe e usuários dos clientes que consegue ver)
  select s.user_id, coalesce(nullif(p.full_name, ''), nullif(split_part(p.email, '@', 1), ''), 'Usuário'), 'staff'::text
    from staff s left join public.profiles p on p.id = s.user_id where (select v from is_staff)
         or exists (select 1 from public.requests r where r.organization_id = p_org and r.assigned_to = s.user_id and private.pt_sees_client(r.client_account_id))
         or exists (select 1 from public.request_comments c where c.organization_id = p_org and c.author_id = s.user_id and c.visibility = 'shared' and private.pt_sees_client(c.client_account_id))
  union
  select cm.user_id, coalesce(nullif(p.full_name, ''), nullif(split_part(p.email, '@', 1), ''), 'Usuário'), 'client'::text
    from public.client_members cm left join public.profiles p on p.id = cm.user_id
   where cm.organization_id = p_org and private.pt_sees_client(cm.client_account_id);
$$;

do $$
declare f text;
begin
  foreach f in array array['public.pt_request_create(uuid, text, text, uuid, public.pt_priority, uuid, timestamptz, text)', 'public.pt_request_set_status(uuid, public.pt_request_status, text)', 'public.pt_request_assign(uuid, uuid)',
    'public.pt_request_edit(uuid, text, text, uuid, public.pt_priority)', 'public.pt_request_set_due(uuid, timestamptz, text, text)', 'public.pt_comment_add(uuid, text, public.pt_comment_visibility)',
    'public.pt_refresh(uuid)', 'public.pt_user_labels(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
