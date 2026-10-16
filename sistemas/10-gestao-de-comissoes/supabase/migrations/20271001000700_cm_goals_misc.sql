-- Gestão de Comissões — METAS E BÔNUS, AVISOS E SIMULAÇÕES.
-- Meta que já gerou bônus fica congelada (alvo, período, escopo e regras); o histórico de metas é preservado (arquivar, nunca apagar).

begin;
set local check_function_bodies = off;

-- Congelamento: depois do primeiro lançamento de bônus da meta, nada que o determina pode mudar.
create function private.cm_goal_has_bonus(p_goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.commission_entries e where e.component_key like 'g:' || p_goal::text || ':%');
$$;
revoke all on function private.cm_goal_has_bonus(uuid) from public, anon, authenticated;

create function private.cm_goal_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if private.cm_goal_has_bonus(old.id) and (new.goal_type <> old.goal_type or new.target_value_decimal <> old.target_value_decimal or new.period_start <> old.period_start
      or new.period_end <> old.period_end or new.scope_type <> old.scope_type or new.scope_reference_id is distinct from old.scope_reference_id or new.product_id is distinct from old.product_id) then
    raise exception 'a meta já gerou bônus: não pode mais ser alterada (arquive e crie outra)' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cm_goal_guard() from public, anon, authenticated;
create trigger goal_guard before update on public.sales_goals for each row execute function private.cm_goal_guard();

create function private.cm_goal_rule_guard() returns trigger language plpgsql set search_path = '' as $$
declare g uuid := coalesce(new.goal_id, old.goal_id);
begin
  if private.cm_goal_has_bonus(g) then raise exception 'a meta já gerou bônus: regras congeladas' using errcode = '23514'; end if;
  return coalesce(new, old);
end $$;
revoke all on function private.cm_goal_rule_guard() from public, anon, authenticated;
create trigger goal_rule_guard before update or delete on public.goal_bonus_rules for each row execute function private.cm_goal_rule_guard();

-- p_goal: {name, goal_type, target_value (texto decimal), period_start, period_end, scope_type, scope_reference_id, product_id}
-- p_bonus: [{plan_id, threshold_pct, bonus_type, bonus_rate, bonus_amount_cents, award_timing, distribution}]  (a versão do plano usada é a vigente hoje)
create function public.cm_save_goal(p_org uuid, p_id uuid, p_goal jsonb, p_bonus jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; g jsonb := p_goal; b jsonb; st text; sref uuid; ver uuid; ptype text;
begin
  perform private.cm_guard(p_org, 'manager');
  if jsonb_typeof(g) <> 'object' or jsonb_typeof(coalesce(p_bonus, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_bonus, '[]'::jsonb)) > 10 then raise exception 'dados inválidos' using errcode = '22023'; end if;
  st := g ->> 'scope_type'; sref := nullif(g ->> 'scope_reference_id', '')::uuid;
  -- escopo: administrador/financeiro qualquer; gestor só vendedores/equipes que gere; meta da empresa só administrador/financeiro
  if private.cm_profile(p_org) = 'manager' then
    if st = 'organization' then raise exception 'meta da empresa é do administrador/financeiro' using errcode = '42501'; end if;
    if st = 'team' then perform private.cm_assert_manage_team(p_org, sref); end if;
    if st = 'seller' then perform private.cm_assert_manage_seller(p_org, sref); end if;
  end if;
  if st = 'team' and not exists (select 1 from public.sales_teams where id = sref and organization_id = p_org) then raise exception 'equipe não encontrada' using errcode = '22023'; end if;
  if st = 'seller' and not exists (select 1 from public.sellers where id = sref and organization_id = p_org) then raise exception 'vendedor não encontrado' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.sales_goals (organization_id, name, goal_type, target_value_decimal, period_start, period_end, scope_type, scope_reference_id, product_id, created_by)
    values (p_org, private.cm_req_text(g ->> 'name', 2, 100, 'Nome da meta'), g ->> 'goal_type', (g ->> 'target_value')::numeric, (g ->> 'period_start')::date, (g ->> 'period_end')::date, st, sref,
            nullif(g ->> 'product_id', '')::uuid, (select auth.uid())) returning id into v_id;
  else
    if not exists (select 1 from public.sales_goals where id = v_id and organization_id = p_org) then raise exception 'meta não encontrada' using errcode = 'P0002'; end if;
    if not private.cm_can_see_goal(p_org, v_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
    update public.sales_goals set name = private.cm_req_text(g ->> 'name', 2, 100, 'Nome da meta'), goal_type = g ->> 'goal_type', target_value_decimal = (g ->> 'target_value')::numeric,
      period_start = (g ->> 'period_start')::date, period_end = (g ->> 'period_end')::date, scope_type = st, scope_reference_id = sref, product_id = nullif(g ->> 'product_id', '')::uuid
    where id = v_id and organization_id = p_org;
    delete from public.goal_bonus_rules where goal_id = v_id and organization_id = p_org;
  end if;
  for b in select * from jsonb_array_elements(coalesce(p_bonus, '[]'::jsonb)) loop
    select v.id into ver from public.commission_plan_versions v join public.commission_plans p on p.id = v.plan_id and p.organization_id = v.organization_id
      where p.id = (b ->> 'plan_id')::uuid and p.organization_id = p_org and v.status = 'published' order by v.version_number desc limit 1;
    if ver is null then raise exception 'o plano do bônus não tem versão publicada' using errcode = '22023'; end if;
    insert into public.goal_bonus_rules (organization_id, plan_version_id, goal_id, threshold_decimal, bonus_type, bonus_rate_decimal, bonus_amount_cents, award_timing, distribution)
    values (p_org, ver, v_id, (b ->> 'threshold_pct')::numeric, b ->> 'bonus_type', nullif(b ->> 'bonus_rate', '')::numeric, nullif(b ->> 'bonus_amount_cents', '')::bigint,
            coalesce(b ->> 'award_timing', 'period_end'), coalesce(b ->> 'distribution', 'each'));
  end loop;
  return v_id;
end $$;

create function public.cm_archive_goal(p_org uuid, p_id uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'manager');
  if not private.cm_can_see_goal(p_org, p_id) then raise exception 'meta não encontrada' using errcode = 'P0002'; end if;
  update public.sales_goals set status = case when p_archive then 'archived' else 'active' end where id = p_id and organization_id = p_org;
end $$;

-- ======================================================================= avisos
create function public.cm_mark_notifications_read(p_org uuid, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.cm_guard(p_org, 'read');
  update public.commission_notifications set read_at = now() where organization_id = p_org and user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

create function public.cm_set_notification_pref(p_org uuid, p_type text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'read');
  if char_length(coalesce(p_type, '')) not between 1 and 60 then raise exception 'tipo inválido' using errcode = '22023'; end if;
  insert into public.commission_notification_prefs (organization_id, user_id, type, enabled) values (p_org, (select auth.uid()), p_type, coalesce(p_enabled, true))
  on conflict (organization_id, user_id, type) do update set enabled = excluded.enabled;
end $$;

-- ======================================================================= simulações (nunca geram lançamento nem alteram meta/venda)
create function public.cm_save_simulation(p_org uuid, p_name text, p_input jsonb, p_result jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.cm_guard(p_org, 'manager');
  insert into public.saved_simulations (organization_id, name, input_json, result_json, created_by)
  values (p_org, private.cm_req_text(p_name, 2, 100, 'Nome'), p_input, p_result, (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

create function public.cm_delete_simulation(p_org uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'manager');
  delete from public.saved_simulations where id = p_id and organization_id = p_org and (created_by = (select auth.uid()) or private.cm_is_finance(p_org));
  if not found then raise exception 'simulação não encontrada' using errcode = 'P0002'; end if;
end $$;

commit;
