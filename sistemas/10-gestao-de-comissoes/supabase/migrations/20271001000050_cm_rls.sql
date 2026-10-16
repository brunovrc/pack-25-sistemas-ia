-- Gestão de Comissões — RLS: somente LEITURA para o usuário, com escopo por perfil. Escrita: exclusivamente funções cm_* (SECURITY DEFINER).
-- Princípios: remuneração individual é dado sensível. Vendedor enxerga só o seu; gestor, só as equipes que gere; consulta não lê tabelas
-- (só relatórios agregados); administrador e financeiro enxergam a empresa. Nenhum acesso é concedido «a todos os gestores» por padrão.

begin;
set local check_function_bodies = off;

-- ======================================================================= helpers de perfil
create function private.cm_role(org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m where m.organization_id = org and m.user_id = (select auth.uid());
$$;

-- admin | manager | finance | seller | viewer | null
create function private.cm_profile(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case private.cm_role(org)
    when 'owner' then 'admin' when 'admin' then 'admin' when 'manager' then 'manager' when 'viewer' then 'viewer'
    when 'member' then coalesce(
      (select a.profile from public.commission_access a where a.organization_id = org and a.user_id = (select auth.uid())),
      case when exists (select 1 from public.sellers s where s.organization_id = org and s.user_id = (select auth.uid()) and s.status <> 'archived') then 'seller' end)
    end;
$$;
create function private.cm_is_admin(org uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(private.cm_profile(org) = 'admin', false); $$;
create function private.cm_is_finance(org uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(private.cm_profile(org) in ('admin', 'finance'), false); $$;
create function private.cm_is_manager(org uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(private.cm_profile(org) in ('admin', 'finance', 'manager'), false); $$;

create function private.cm_my_seller(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.sellers s where s.organization_id = org and s.user_id = (select auth.uid()) and s.status <> 'archived' limit 1;
$$;

create function private.cm_manages_team(org uuid, team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sales_teams t where t.id = team and t.organization_id = org and t.manager_user_id = (select auth.uid()));
$$;

-- Vendedor visível para remuneração: admin/financeiro todos; gestor, os das suas equipes; vendedor, ele mesmo.
create function private.cm_can_see_seller(org uuid, sel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.cm_profile(org)
    when 'admin' then exists (select 1 from public.sellers s where s.id = sel and s.organization_id = org)
    when 'finance' then exists (select 1 from public.sellers s where s.id = sel and s.organization_id = org)
    when 'manager' then exists (select 1 from public.sellers s where s.id = sel and s.organization_id = org and s.team_id is not null and private.cm_manages_team(org, s.team_id))
    when 'seller' then sel = private.cm_my_seller(org)
    else false end;
$$;

-- Colegas de venda: o vendedor vê nome/equipe de quem divide uma venda com ele (nunca a remuneração).
create function private.cm_is_copartner(org uuid, sel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.cm_profile(org) = 'seller' and exists (
    select 1 from public.sale_participants a join public.sale_participants b on b.sale_id = a.sale_id
    where a.organization_id = org and b.organization_id = org and a.seller_id = private.cm_my_seller(org) and b.seller_id = sel);
$$;

create function private.cm_can_see_sale(org uuid, sale uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sales s where s.id = sale and s.organization_id = org) and case private.cm_profile(org)
    when 'admin' then true
    when 'finance' then true
    when 'manager' then exists (select 1 from public.sale_participants p join public.sellers s on s.id = p.seller_id and s.organization_id = p.organization_id
                                  where p.sale_id = sale and p.organization_id = org and s.team_id is not null and private.cm_manages_team(org, s.team_id))
                      or exists (select 1 from public.sales x where x.id = sale and x.created_by = (select auth.uid()))
    when 'seller' then exists (select 1 from public.sale_participants p where p.sale_id = sale and p.organization_id = org and p.seller_id = private.cm_my_seller(org))
    else false end;
$$;

create function private.cm_can_see_plan_version(org uuid, ver uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.cm_profile(org)
    when 'admin' then true when 'finance' then true when 'manager' then true
    when 'seller' then exists (select 1 from public.commission_plan_versions v where v.id = ver and v.organization_id = org and v.status = 'published' and (
        exists (select 1 from public.sale_participants p where p.plan_version_id = v.id and p.seller_id = private.cm_my_seller(org))
        or exists (select 1 from public.seller_plan_assignments a where a.plan_id = v.plan_id and a.seller_id = private.cm_my_seller(org))
        or exists (select 1 from public.commission_entries e where e.plan_version_id = v.id and e.seller_id = private.cm_my_seller(org))))
    else false end;
$$;

create function private.cm_can_see_customer(org uuid, cust uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.cm_profile(org)
    when 'admin' then true when 'finance' then true when 'manager' then true
    when 'seller' then exists (select 1 from public.sales s join public.sale_participants p on p.sale_id = s.id where s.customer_id = cust and s.organization_id = org and p.seller_id = private.cm_my_seller(org))
    else false end;
$$;

create function private.cm_can_see_goal(org uuid, goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sales_goals g where g.id = goal and g.organization_id = org) and case private.cm_profile(org)
    when 'admin' then true when 'finance' then true when 'manager' then true
    when 'seller' then exists (select 1 from public.sales_goals g join public.sellers me on me.id = private.cm_my_seller(org) where g.id = goal and g.organization_id = org and (
        g.scope_type = 'organization' or (g.scope_type = 'seller' and g.scope_reference_id = me.id) or (g.scope_type = 'team' and g.scope_reference_id = me.team_id)))
    else false end;
$$;

do $$
declare f text;
begin
  foreach f in array array['private.cm_role(uuid)', 'private.cm_profile(uuid)', 'private.cm_is_admin(uuid)', 'private.cm_is_finance(uuid)', 'private.cm_is_manager(uuid)',
    'private.cm_my_seller(uuid)', 'private.cm_manages_team(uuid, uuid)', 'private.cm_can_see_seller(uuid, uuid)', 'private.cm_is_copartner(uuid, uuid)',
    'private.cm_can_see_sale(uuid, uuid)', 'private.cm_can_see_plan_version(uuid, uuid)', 'private.cm_can_see_customer(uuid, uuid)', 'private.cm_can_see_goal(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ======================================================================= habilitar RLS e conceder só SELECT
do $$
declare t text;
begin
  foreach t in array array['commission_access', 'commission_settings', 'sales_teams', 'sellers', 'seller_team_history', 'customers', 'product_categories', 'products',
    'commission_plans', 'commission_plan_versions', 'commission_rules', 'commission_tiers', 'seller_plan_assignments', 'sales', 'sale_items', 'sale_participants', 'sale_events',
    'customer_receipts', 'sales_goals', 'goal_bonus_rules', 'commission_calculation_runs', 'commission_calculation_details', 'commission_pendencies', 'commission_entries',
    'commission_approval_events', 'commission_disputes', 'commission_adjustments', 'commission_periods', 'commission_closings', 'commission_closing_items', 'payout_records',
    'payout_allocations', 'commission_statements', 'import_jobs', 'import_row_errors', 'commission_notifications', 'commission_notification_prefs', 'saved_simulations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    -- Dados de remuneração exigem sessão com 2º fator para administradores (também pela API REST direta).
    execute format('create policy mfa_select on public.%I as restrictive for select to authenticated using (private.mfa_ok())', t);
  end loop;
end $$;

create policy access_select on public.commission_access for select to authenticated using (private.cm_is_admin(organization_id) or user_id = (select auth.uid()));
create policy settings_select on public.commission_settings for select to authenticated using (private.cm_profile(organization_id) is not null);
create policy teams_select on public.sales_teams for select to authenticated using (private.cm_profile(organization_id) in ('admin', 'finance', 'manager', 'seller'));
create policy sellers_select on public.sellers for select to authenticated using (
  private.cm_can_see_seller(organization_id, id) or private.cm_is_copartner(organization_id, id) or private.cm_is_finance(organization_id)
  or (private.cm_profile(organization_id) = 'manager' and team_id is null));  -- gestor vê só as equipes que gere + vendedores ainda sem equipe (para alocá-los)
create policy seller_history_select on public.seller_team_history for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));
create policy customers_select on public.customers for select to authenticated using (private.cm_can_see_customer(organization_id, id));
create policy categories_select on public.product_categories for select to authenticated using (private.cm_profile(organization_id) is not null);
create policy products_select on public.products for select to authenticated using (private.cm_profile(organization_id) is not null);

create policy plans_select on public.commission_plans for select to authenticated using (
  private.cm_is_manager(organization_id) or exists (select 1 from public.commission_plan_versions v where v.plan_id = commission_plans.id and private.cm_can_see_plan_version(v.organization_id, v.id)));
create policy plan_versions_select on public.commission_plan_versions for select to authenticated using (
  private.cm_can_see_plan_version(organization_id, id) and (status = 'published' or private.cm_is_manager(organization_id)));
create policy rules_select on public.commission_rules for select to authenticated using (private.cm_can_see_plan_version(organization_id, plan_version_id));
create policy tiers_select on public.commission_tiers for select to authenticated using (private.cm_can_see_plan_version(organization_id, plan_version_id));
create policy assignments_select on public.seller_plan_assignments for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));

create policy sales_select on public.sales for select to authenticated using (private.cm_can_see_sale(organization_id, id));
create policy sale_items_select on public.sale_items for select to authenticated using (private.cm_can_see_sale(organization_id, sale_id));
create policy sale_participants_select on public.sale_participants for select to authenticated using (private.cm_can_see_sale(organization_id, sale_id));
create policy sale_events_select on public.sale_events for select to authenticated using (private.cm_can_see_sale(organization_id, sale_id));
create policy receipts_select on public.customer_receipts for select to authenticated using (private.cm_can_see_sale(organization_id, sale_id));

create policy goals_select on public.sales_goals for select to authenticated using (private.cm_can_see_goal(organization_id, id));
create policy goal_bonus_select on public.goal_bonus_rules for select to authenticated using (private.cm_can_see_goal(organization_id, goal_id));

create policy runs_select on public.commission_calculation_runs for select to authenticated using (private.cm_is_finance(organization_id));
create policy details_select on public.commission_calculation_details for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));
create policy pendencies_select on public.commission_pendencies for select to authenticated using (
  private.cm_is_manager(organization_id) and (seller_id is null or private.cm_can_see_seller(organization_id, seller_id)) and (sale_id is null or private.cm_can_see_sale(organization_id, sale_id)));
create policy entries_select on public.commission_entries for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));
create policy approval_events_select on public.commission_approval_events for select to authenticated using (
  exists (select 1 from public.commission_entries e where e.id = commission_entry_id and e.organization_id = commission_approval_events.organization_id and private.cm_can_see_seller(e.organization_id, e.seller_id)));
create policy disputes_select on public.commission_disputes for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));
create policy adjustments_select on public.commission_adjustments for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));

create policy periods_select on public.commission_periods for select to authenticated using (private.cm_profile(organization_id) in ('admin', 'finance', 'manager', 'seller'));
create policy closings_select on public.commission_closings for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));
create policy closing_items_select on public.commission_closing_items for select to authenticated using (
  exists (select 1 from public.commission_closings c where c.id = closing_id and c.organization_id = commission_closing_items.organization_id and private.cm_can_see_seller(c.organization_id, c.seller_id)));
create policy payouts_select on public.payout_records for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));
create policy payout_allocations_select on public.payout_allocations for select to authenticated using (
  exists (select 1 from public.payout_records p where p.id = payout_id and p.organization_id = payout_allocations.organization_id and private.cm_can_see_seller(p.organization_id, p.seller_id)));
create policy statements_select on public.commission_statements for select to authenticated using (private.cm_can_see_seller(organization_id, seller_id));

create policy import_jobs_select on public.import_jobs for select to authenticated using (private.cm_is_manager(organization_id));
create policy import_errors_select on public.import_row_errors for select to authenticated using (private.cm_is_manager(organization_id));
create policy notifications_select on public.commission_notifications for select to authenticated using (user_id = (select auth.uid()) and private.cm_profile(organization_id) is not null);
create policy notification_prefs_select on public.commission_notification_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy simulations_select on public.saved_simulations for select to authenticated using (
  private.cm_is_finance(organization_id) or (created_by = (select auth.uid()) and private.cm_profile(organization_id) in ('manager', 'seller')));

commit;
