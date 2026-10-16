-- Gestão de Comissões — FUNÇÕES DE CADASTRO: configurações, acessos, equipes, vendedores, clientes, produtos.
-- Todas SECURITY DEFINER, começam por private.cm_guard (sessão + MFA + perfil) e validam a entrada no servidor.

begin;
set local check_function_bodies = off;

-- ======================================================================= utilidades de validação
create function private.cm_req_text(p text, p_min int, p_max int, p_label text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(p, ''));
begin
  if char_length(t) < p_min or char_length(t) > p_max then
    raise exception '% deve ter entre % e % caracteres', p_label, p_min, p_max using errcode = '22023';
  end if;
  return t;
end $$;

create function private.cm_opt_text(p text, p_max int, p_label text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := nullif(btrim(coalesce(p, '')), '');
begin
  if t is not null and char_length(t) > p_max then raise exception '% excede % caracteres', p_label, p_max using errcode = '22023'; end if;
  return t;
end $$;

-- Gestor só mexe em vendedores das equipes que gere (ou ainda sem equipe). Administrador/financeiro: sem restrição.
create function private.cm_assert_manage_seller(p_org uuid, p_seller uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare prof text := private.cm_profile(p_org); tm uuid;
begin
  if prof in ('admin', 'finance') then return; end if;
  select s.team_id into tm from public.sellers s where s.id = p_seller and s.organization_id = p_org;
  if not found then raise exception 'vendedor não encontrado' using errcode = 'P0002'; end if;
  if prof = 'manager' and (tm is null or private.cm_manages_team(p_org, tm)) then return; end if;
  raise exception 'sem permissão sobre este vendedor' using errcode = '42501';
end $$;
create function private.cm_assert_manage_team(p_org uuid, p_team uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare prof text := private.cm_profile(p_org);
begin
  if p_team is null or prof in ('admin', 'finance') then return; end if;
  if prof = 'manager' and private.cm_manages_team(p_org, p_team) then return; end if;
  raise exception 'sem permissão sobre esta equipe' using errcode = '42501';
end $$;
revoke all on function private.cm_assert_manage_seller(uuid, uuid) from public, anon;
revoke all on function private.cm_assert_manage_team(uuid, uuid) from public, anon;
grant execute on function private.cm_assert_manage_seller(uuid, uuid) to authenticated;
grant execute on function private.cm_assert_manage_team(uuid, uuid) to authenticated;

-- ======================================================================= configurações
create function public.cm_save_settings(p_org uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare tz text;
begin
  perform private.cm_guard(p_org, 'admin');
  if jsonb_typeof(p_data) <> 'object' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  tz := coalesce(p_data ->> 'timezone', (select s.timezone from public.commission_settings s where s.organization_id = p_org));
  begin perform now() at time zone tz; exception when others then raise exception 'fuso horário inválido' using errcode = '22023'; end;
  update public.commission_settings s set
    timezone = tz,
    date_format = coalesce(p_data ->> 'date_format', s.date_format),
    negative_balance_policy = coalesce(p_data ->> 'negative_balance_policy', s.negative_balance_policy),
    adjustment_approval_required = coalesce((p_data ->> 'adjustment_approval_required')::boolean, s.adjustment_approval_required),
    segregation_of_duties = coalesce((p_data ->> 'segregation_of_duties')::boolean, s.segregation_of_duties),
    allow_payout_over_balance = coalesce((p_data ->> 'allow_payout_over_balance')::boolean, s.allow_payout_over_balance),
    allow_receipt_over_sale = coalesce((p_data ->> 'allow_receipt_over_sale')::boolean, s.allow_receipt_over_sale),
    statement_template = coalesce(p_data ->> 'statement_template', s.statement_template),
    statement_footer = case when p_data ? 'statement_footer' then private.cm_opt_text(p_data ->> 'statement_footer', 300, 'Rodapé') else s.statement_footer end
  where s.organization_id = p_org;
end $$;

-- Perfil de acesso de um membro «member»: finance (financeiro) ou seller (vendedor). null remove.
create function public.cm_set_access(p_org uuid, p_user uuid, p_profile text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.org_role;
begin
  perform private.cm_guard(p_org, 'admin');
  select m.role into r from public.organization_members m where m.organization_id = p_org and m.user_id = p_user;
  if not found then raise exception 'usuário não é membro da organização' using errcode = 'P0002'; end if;
  if p_profile is null then
    delete from public.commission_access where organization_id = p_org and user_id = p_user;
    return;
  end if;
  if p_profile not in ('finance', 'seller') then raise exception 'perfil inválido' using errcode = '22023'; end if;
  if r <> 'member' then raise exception 'só membros com papel «member» recebem perfil de financeiro/vendedor' using errcode = '22023'; end if;
  insert into public.commission_access (organization_id, user_id, profile, created_by) values (p_org, p_user, p_profile, (select auth.uid()))
  on conflict (organization_id, user_id) do update set profile = excluded.profile;
end $$;

-- ======================================================================= equipes
create function public.cm_save_team(p_org uuid, p_id uuid, p_name text, p_description text, p_manager_user uuid, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform private.cm_guard(p_org, 'admin');
  if p_manager_user is not null and not exists (select 1 from public.organization_members m where m.organization_id = p_org and m.user_id = p_manager_user and m.role in ('owner', 'admin', 'manager')) then
    raise exception 'o gestor da equipe deve ser administrador ou gestor da organização' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.sales_teams (organization_id, name, description, manager_user_id, active)
    values (p_org, private.cm_req_text(p_name, 2, 80, 'Nome da equipe'), private.cm_opt_text(p_description, 300, 'Descrição'), p_manager_user, coalesce(p_active, true)) returning id into v_id;
  else
    update public.sales_teams t set name = private.cm_req_text(p_name, 2, 80, 'Nome da equipe'), description = private.cm_opt_text(p_description, 300, 'Descrição'),
      manager_user_id = p_manager_user, active = coalesce(p_active, t.active)
    where t.id = v_id and t.organization_id = p_org;
    if not found then raise exception 'equipe não encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- ======================================================================= vendedores
-- Mudança de equipe/plano tem data efetiva e preserva o histórico: nunca altera retroativamente o que já foi apurado.
create function public.cm_save_seller(
  p_org uuid, p_id uuid, p_name text, p_code text, p_type text, p_team uuid, p_user uuid, p_starts_at date, p_ends_at date, p_notes text, p_status text, p_effective date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; old_team uuid; eff date := coalesce(p_effective, private.cm_today(p_org)); old_user uuid; prof text;
begin
  perform private.cm_guard(p_org, 'manager');
  prof := private.cm_profile(p_org);
  perform private.cm_assert_manage_team(p_org, p_team);
  if p_user is not null then
    if prof <> 'admin' then raise exception 'somente administrador vincula o login do vendedor' using errcode = '42501'; end if;
    if not exists (select 1 from public.organization_members m where m.organization_id = p_org and m.user_id = p_user) then
      raise exception 'o usuário informado não é membro da organização' using errcode = '22023';
    end if;
  end if;
  if p_status not in ('active', 'inactive', 'archived') then raise exception 'status inválido' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.sellers (organization_id, user_id, team_id, name, seller_code, seller_type, status, starts_at, ends_at, notes, archived_at)
    values (p_org, p_user, p_team, private.cm_req_text(p_name, 2, 120, 'Nome'), private.cm_req_text(p_code, 1, 30, 'Código'), coalesce(p_type, 'internal'), coalesce(p_status, 'active'),
            p_starts_at, p_ends_at, private.cm_opt_text(p_notes, 1000, 'Observações'), case when p_status = 'archived' then now() end)
    returning id into v_id;
    if p_team is not null then insert into public.seller_team_history (organization_id, seller_id, team_id, valid_from) values (p_org, v_id, p_team, p_starts_at); end if;
  else
    perform private.cm_assert_manage_seller(p_org, v_id);
    select s.team_id, s.user_id into old_team, old_user from public.sellers s where s.id = v_id and s.organization_id = p_org;
    if not found then raise exception 'vendedor não encontrado' using errcode = 'P0002'; end if;
    if prof <> 'admin' and p_user is distinct from old_user then raise exception 'somente administrador vincula o login do vendedor' using errcode = '42501'; end if;
    update public.sellers s set name = private.cm_req_text(p_name, 2, 120, 'Nome'), seller_code = private.cm_req_text(p_code, 1, 30, 'Código'), seller_type = coalesce(p_type, s.seller_type),
      team_id = p_team, user_id = p_user, status = coalesce(p_status, s.status), starts_at = coalesce(p_starts_at, s.starts_at), ends_at = p_ends_at,
      notes = private.cm_opt_text(p_notes, 1000, 'Observações'), archived_at = case when coalesce(p_status, s.status) = 'archived' then coalesce(s.archived_at, now()) else null end
    where s.id = v_id and s.organization_id = p_org;
    if p_team is distinct from old_team then
      -- encerra a lotação vigente no dia anterior e abre a nova (a exclusão por intervalo impede sobreposição)
      update public.seller_team_history h set valid_until = eff - 1 where h.seller_id = v_id and h.valid_until is null and h.valid_from < eff;
      if p_team is not null then
        insert into public.seller_team_history (organization_id, seller_id, team_id, valid_from) values (p_org, v_id, p_team, eff);
      end if;
    end if;
  end if;
  return v_id;
end $$;

-- ======================================================================= clientes, categorias e produtos
create function public.cm_save_customer(p_org uuid, p_id uuid, p_name text, p_legal text, p_doc text, p_email text, p_phone text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform private.cm_guard(p_org, 'manager');
  if v_id is null then
    insert into public.customers (organization_id, name, legal_name, document_number, email, phone)
    values (p_org, private.cm_req_text(p_name, 2, 160, 'Nome'), private.cm_opt_text(p_legal, 200, 'Razão social'), private.cm_opt_text(p_doc, 20, 'Documento'),
            private.cm_opt_text(p_email, 200, 'E-mail'), private.cm_opt_text(p_phone, 40, 'Telefone')) returning id into v_id;
  else
    update public.customers c set name = private.cm_req_text(p_name, 2, 160, 'Nome'), legal_name = private.cm_opt_text(p_legal, 200, 'Razão social'), document_number = private.cm_opt_text(p_doc, 20, 'Documento'),
      email = private.cm_opt_text(p_email, 200, 'E-mail'), phone = private.cm_opt_text(p_phone, 40, 'Telefone')
    where c.id = v_id and c.organization_id = p_org;
    if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function public.cm_archive_customer(p_org uuid, p_id uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'manager');
  update public.customers c set archived_at = case when p_archive then coalesce(c.archived_at, now()) else null end where c.id = p_id and c.organization_id = p_org;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
end $$;

create function public.cm_save_category(p_org uuid, p_id uuid, p_name text, p_description text, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform private.cm_guard(p_org, 'manager');
  if v_id is null then
    insert into public.product_categories (organization_id, name, description, active)
    values (p_org, private.cm_req_text(p_name, 2, 80, 'Nome'), private.cm_opt_text(p_description, 300, 'Descrição'), coalesce(p_active, true)) returning id into v_id;
  else
    update public.product_categories c set name = private.cm_req_text(p_name, 2, 80, 'Nome'), description = private.cm_opt_text(p_description, 300, 'Descrição'), active = coalesce(p_active, c.active)
    where c.id = v_id and c.organization_id = p_org;
    if not found then raise exception 'categoria não encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function public.cm_save_product(p_org uuid, p_id uuid, p_sku text, p_name text, p_category uuid, p_description text, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform private.cm_guard(p_org, 'manager');
  if v_id is null then
    insert into public.products (organization_id, sku, name, category_id, description, active)
    values (p_org, private.cm_req_text(p_sku, 1, 40, 'SKU'), private.cm_req_text(p_name, 2, 160, 'Nome'), p_category, private.cm_opt_text(p_description, 500, 'Descrição'), coalesce(p_active, true)) returning id into v_id;
  else
    update public.products p set sku = private.cm_req_text(p_sku, 1, 40, 'SKU'), name = private.cm_req_text(p_name, 2, 160, 'Nome'), category_id = p_category,
      description = private.cm_opt_text(p_description, 500, 'Descrição'), active = coalesce(p_active, p.active)
    where p.id = v_id and p.organization_id = p_org;
    if not found then raise exception 'produto não encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

commit;
