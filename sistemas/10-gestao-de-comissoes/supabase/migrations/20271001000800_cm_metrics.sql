-- Gestão de Comissões — MÉTRICAS DOS DASHBOARDS (definições em docs/METRICS.md).
-- Funções SECURITY INVOKER: o RLS do chamador delimita os dados (vendedor só vê o dele, gestor só a equipe, etc.). Valores sempre do PostgreSQL.
-- «Vendas elegíveis» = valor comissionável de vendas confirmadas/parcialmente devolvidas no período, LÍQUIDO das devoluções até a data final.
-- Sem filtro de vendedor/equipe/gestor/plano, administrador e financeiro veem a venda UMA vez (sem dupla contagem); com filtro, ou para os
-- demais perfis, vale o crédito atribuído (valor × % de participação). Metas (atingimento) são calculadas pelo motor TS, não aqui.

begin;
set local check_function_bodies = off;

create function private.cm_team_at(p_org uuid, p_seller uuid, p_date date) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.seller_team_history h where h.seller_id = p_seller and h.organization_id = p_org)
    then (select h.team_id from public.seller_team_history h where h.seller_id = p_seller and h.organization_id = p_org and h.valid_from <= p_date and (h.valid_until is null or h.valid_until >= p_date) limit 1)
    else (select s.team_id from public.sellers s where s.id = p_seller and s.organization_id = p_org) end;
$$;
revoke all on function private.cm_team_at(uuid, uuid, date) from public, anon;
grant execute on function private.cm_team_at(uuid, uuid, date) to authenticated;

create function public.cm_dashboard(p_org uuid, p_from date, p_to date, p_f jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  f_seller uuid := nullif(p_f ->> 'seller_id', '')::uuid; f_team uuid := nullif(p_f ->> 'team_id', '')::uuid; f_mgr uuid := nullif(p_f ->> 'manager_user', '')::uuid;
  f_plan uuid := nullif(p_f ->> 'plan_id', '')::uuid; f_cat uuid := nullif(p_f ->> 'category_id', '')::uuid; f_prod uuid := nullif(p_f ->> 'product_id', '')::uuid;
  f_cust uuid := nullif(p_f ->> 'customer_id', '')::uuid; f_appr text := nullif(p_f ->> 'approval_status', ''); f_close text := nullif(p_f ->> 'closing_status', '');
  prof text; mode text; res jsonb; entry_dims boolean; base_c bigint; base_n int; calc bigint; paid bigint; payable bigint;
begin
  perform private.cm_guard(p_org, 'read');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then raise exception 'período inválido' using errcode = '22023'; end if;
  prof := private.cm_profile(p_org);
  mode := case when prof in ('admin', 'finance') and f_seller is null and f_team is null and f_mgr is null and f_plan is null then 'sale' else 'credit' end;
  entry_dims := f_plan is not null or f_cat is not null or f_prod is not null or f_cust is not null or f_appr is not null or f_close is not null;

  with
  it as (
    select sa.id as sale_id, sa.sale_date, sa.customer_id, si.id as item_id, si.product_id, pr.category_id,
      si.commissionable_amount_cents - coalesce((select sum((ev.metadata_json -> 'itemAmounts' ->> si.id::text)::bigint) from public.sale_events ev
        where ev.sale_id = sa.id and ev.organization_id = p_org and ev.event_type in ('partially_returned', 'totally_returned') and ev.effective_at <= p_to), 0) as rem
    from public.sales sa
    join public.sale_items si on si.sale_id = sa.id and si.organization_id = sa.organization_id
    left join public.products pr on pr.id = si.product_id and pr.organization_id = si.organization_id
    where sa.organization_id = p_org and sa.status in ('confirmed', 'partially_returned') and sa.sale_date between p_from and p_to
      and (f_cust is null or sa.customer_id = f_cust) and (f_prod is null or si.product_id = f_prod) and (f_cat is null or pr.category_id = f_cat)
  ),
  cr as (
    select it.sale_id, it.sale_date, it.item_id, it.category_id, sp.seller_id, private.cm_team_at(p_org, sp.seller_id, it.sale_date) as team_id,
      it.rem * sp.allocation_percentage / 100.0 as credit
    from it join public.sale_participants sp on sp.sale_id = it.sale_id and sp.organization_id = p_org
    left join public.commission_plan_versions pv on pv.id = sp.plan_version_id and pv.organization_id = sp.organization_id
    where private.cm_can_see_seller(p_org, sp.seller_id) and (f_seller is null or sp.seller_id = f_seller) and (f_plan is null or pv.plan_id = f_plan)
  ),
  cr2 as (
    select cr.* from cr where (f_team is null or cr.team_id = f_team)
      and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = cr.team_id and t.organization_id = p_org and t.manager_user_id = f_mgr))
  ),
  e as (
    select en.id, en.seller_id, en.sale_id, en.entry_type, en.amount_cents, en.approval_status, en.effective_at, en.eligible_at,
      date_trunc('month', en.effective_at)::date as mon, private.cm_team_at(p_org, en.seller_id, en.effective_at) as team_id,
      pr.category_id, si.product_id, pv.plan_id, sa.customer_id,
      coalesce((select cl.status from public.commission_closing_items ci join public.commission_closings cl on cl.id = ci.closing_id and cl.organization_id = ci.organization_id
                where ci.commission_entry_id = en.id and ci.organization_id = en.organization_id and ci.voided_at is null limit 1), 'none') as closing_status
    from public.commission_entries en
    left join public.sale_items si on si.id = en.sale_item_id and si.organization_id = en.organization_id
    left join public.products pr on pr.id = si.product_id and pr.organization_id = si.organization_id
    left join public.commission_plan_versions pv on pv.id = en.plan_version_id and pv.organization_id = en.organization_id
    left join public.sales sa on sa.id = en.sale_id and sa.organization_id = en.organization_id
    where en.organization_id = p_org and en.effective_at between p_from and p_to and (f_seller is null or en.seller_id = f_seller)
  ),
  e2 as (
    select e.* from e where (f_team is null or e.team_id = f_team)
      and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = e.team_id and t.organization_id = p_org and t.manager_user_id = f_mgr))
      and (f_plan is null or e.plan_id = f_plan) and (f_cat is null or e.category_id = f_cat) and (f_prod is null or e.product_id = f_prod)
      and (f_cust is null or e.customer_id = f_cust) and (f_appr is null or e.approval_status = f_appr) and (f_close is null or e.closing_status = f_close)
  ),
  months as (select d::date as mon from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') d),
  pay as (
    select pa.amount_cents, pr.payment_date, date_trunc('month', pr.payment_date)::date as mon, pr.seller_id
    from public.payout_allocations pa join public.payout_records pr on pr.id = pa.payout_id and pr.organization_id = pa.organization_id
    where pa.organization_id = p_org and pr.status = 'recorded' and (f_seller is null or pr.seller_id = f_seller)
      and (f_team is null or private.cm_team_at(p_org, pr.seller_id, pr.payment_date) = f_team)
      and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = private.cm_team_at(p_org, pr.seller_id, pr.payment_date) and t.organization_id = p_org and t.manager_user_id = f_mgr))
  )
  select
    case when mode = 'sale' then coalesce((select sum(rem) from it), 0) else coalesce((select round(sum(credit)) from cr2), 0) end,
    case when mode = 'sale' then (select count(distinct sale_id) from it) else (select count(distinct sale_id) from cr2) end,
    coalesce((select sum(amount_cents) from e2 where approval_status <> 'rejected'), 0),
    case when entry_dims then null else coalesce((select sum(amount_cents) from pay where payment_date between p_from and p_to), 0) end
  into base_c, base_n, calc, paid;

  -- saldo a pagar até a data final: aprovado/elegível − pago (somente sem filtros de dimensão de lançamento)
  if entry_dims then payable := null;
  else
    select coalesce((select sum(en.amount_cents) from public.commission_entries en
        where en.organization_id = p_org and en.approval_status in ('approved', 'adjusted') and en.eligible_at <= p_to and (f_seller is null or en.seller_id = f_seller)
          and (f_team is null or private.cm_team_at(p_org, en.seller_id, en.eligible_at) = f_team)
          and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = private.cm_team_at(p_org, en.seller_id, en.eligible_at) and t.organization_id = p_org and t.manager_user_id = f_mgr))), 0)
      - coalesce((select sum(pa.amount_cents) from public.payout_allocations pa join public.payout_records pr on pr.id = pa.payout_id and pr.organization_id = pa.organization_id
        where pa.organization_id = p_org and pr.status = 'recorded' and pr.payment_date <= p_to and (f_seller is null or pr.seller_id = f_seller)
          and (f_team is null or private.cm_team_at(p_org, pr.seller_id, pr.payment_date) = f_team)
          and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = private.cm_team_at(p_org, pr.seller_id, pr.payment_date) and t.organization_id = p_org and t.manager_user_id = f_mgr))), 0)
    into payable;
  end if;

  with
  it as (
    select sa.id as sale_id, sa.sale_date, si.id as item_id, pr.category_id,
      si.commissionable_amount_cents - coalesce((select sum((ev.metadata_json -> 'itemAmounts' ->> si.id::text)::bigint) from public.sale_events ev
        where ev.sale_id = sa.id and ev.organization_id = p_org and ev.event_type in ('partially_returned', 'totally_returned') and ev.effective_at <= p_to), 0) as rem
    from public.sales sa join public.sale_items si on si.sale_id = sa.id and si.organization_id = sa.organization_id
    left join public.products pr on pr.id = si.product_id and pr.organization_id = si.organization_id
    where sa.organization_id = p_org and sa.status in ('confirmed', 'partially_returned') and sa.sale_date between p_from and p_to
      and (f_cust is null or sa.customer_id = f_cust) and (f_prod is null or si.product_id = f_prod) and (f_cat is null or pr.category_id = f_cat)
  ),
  cr as (
    select it.sale_id, it.sale_date, it.category_id, sp.seller_id, private.cm_team_at(p_org, sp.seller_id, it.sale_date) as team_id, it.rem * sp.allocation_percentage / 100.0 as credit
    from it join public.sale_participants sp on sp.sale_id = it.sale_id and sp.organization_id = p_org
    left join public.commission_plan_versions pv on pv.id = sp.plan_version_id and pv.organization_id = sp.organization_id
    where private.cm_can_see_seller(p_org, sp.seller_id) and (f_seller is null or sp.seller_id = f_seller) and (f_plan is null or pv.plan_id = f_plan)
  ),
  cr2 as (
    select cr.* from cr where (f_team is null or cr.team_id = f_team)
      and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = cr.team_id and t.organization_id = p_org and t.manager_user_id = f_mgr))
  ),
  e as (
    select en.id, en.seller_id, en.entry_type, en.amount_cents, en.approval_status, en.effective_at, date_trunc('month', en.effective_at)::date as mon,
      private.cm_team_at(p_org, en.seller_id, en.effective_at) as team_id, pr.category_id, pv.plan_id, sa.customer_id, si.product_id,
      coalesce((select cl.status from public.commission_closing_items ci join public.commission_closings cl on cl.id = ci.closing_id and cl.organization_id = ci.organization_id
                where ci.commission_entry_id = en.id and ci.organization_id = en.organization_id and ci.voided_at is null limit 1), 'none') as closing_status
    from public.commission_entries en
    left join public.sale_items si on si.id = en.sale_item_id and si.organization_id = en.organization_id
    left join public.products pr on pr.id = si.product_id and pr.organization_id = si.organization_id
    left join public.commission_plan_versions pv on pv.id = en.plan_version_id and pv.organization_id = en.organization_id
    left join public.sales sa on sa.id = en.sale_id and sa.organization_id = en.organization_id
    where en.organization_id = p_org and en.effective_at between p_from and p_to and (f_seller is null or en.seller_id = f_seller)
  ),
  e2 as (
    select e.* from e where (f_team is null or e.team_id = f_team)
      and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = e.team_id and t.organization_id = p_org and t.manager_user_id = f_mgr))
      and (f_plan is null or e.plan_id = f_plan) and (f_cat is null or e.category_id = f_cat) and (f_prod is null or e.product_id = f_prod)
      and (f_cust is null or e.customer_id = f_cust) and (f_appr is null or e.approval_status = f_appr) and (f_close is null or e.closing_status = f_close)
  ),
  months as (select d::date as mon from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') d),
  pay as (
    select pa.amount_cents, pr.payment_date, date_trunc('month', pr.payment_date)::date as mon
    from public.payout_allocations pa join public.payout_records pr on pr.id = pa.payout_id and pr.organization_id = pa.organization_id
    where pa.organization_id = p_org and pr.status = 'recorded' and (f_seller is null or pr.seller_id = f_seller)
      and (f_team is null or private.cm_team_at(p_org, pr.seller_id, pr.payment_date) = f_team)
      and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = private.cm_team_at(p_org, pr.seller_id, pr.payment_date) and t.organization_id = p_org and t.manager_user_id = f_mgr))
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to), 'base_mode', mode, 'profile', prof,
    'kpis', jsonb_build_object(
      'sales_base_cents', base_c, 'sales_count', base_n,
      'commissions_cents', coalesce((select sum(amount_cents) from e2 where entry_type = 'commission' and approval_status <> 'rejected'), 0),
      'bonuses_cents', coalesce((select sum(amount_cents) from e2 where entry_type = 'bonus' and approval_status <> 'rejected'), 0),
      'adjustments_cents', coalesce((select sum(amount_cents) from e2 where entry_type in ('adjustment_positive', 'adjustment_negative') and approval_status <> 'rejected'), 0),
      'reversals_cents', coalesce((select -sum(amount_cents) from e2 where entry_type = 'reversal' and approval_status <> 'rejected'), 0),
      'calculated_cents', calc,
      'provisional_cents', coalesce((select sum(amount_cents) from e2 where approval_status in ('calculated', 'pending_review', 'contested')), 0),
      'approved_cents', coalesce((select sum(amount_cents) from e2 where approval_status in ('approved', 'adjusted')), 0),
      'rejected_cents', coalesce((select sum(amount_cents) from e2 where approval_status = 'rejected'), 0),
      'paid_cents', paid, 'payable_cents', payable,
      'cost_pct', case when base_c > 0 then round(calc * 100.0 / base_c, 2) end,
      'active_sellers', (select count(*) from public.sellers s where s.organization_id = p_org and s.status = 'active' and s.starts_at <= p_to and (s.ends_at is null or s.ends_at >= p_to)
                          and (f_seller is null or s.id = f_seller) and (f_team is null or s.team_id = f_team)
                          and (f_mgr is null or exists (select 1 from public.sales_teams t where t.id = s.team_id and t.organization_id = p_org and t.manager_user_id = f_mgr))
                          and private.cm_can_see_seller(p_org, s.id)),
      'pending_periods', (select count(*) from public.commission_periods cp where cp.organization_id = p_org and cp.status in ('open', 'in_review', 'awaiting_approval') and cp.period_end <= p_to),
      'closings_without_statement', (select count(*) from public.commission_closings cl where cl.organization_id = p_org and cl.status = 'closed'
                                      and not exists (select 1 from public.commission_statements st where st.closing_id = cl.id))),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m.mon,
        'base_cents', case when mode = 'sale' then coalesce((select sum(rem) from it where date_trunc('month', sale_date)::date = m.mon), 0)
                           else coalesce((select round(sum(credit)) from cr2 where date_trunc('month', sale_date)::date = m.mon), 0) end,
        'calculated_cents', coalesce((select sum(amount_cents) from e2 where mon = m.mon and approval_status <> 'rejected'), 0),
        'approved_cents', coalesce((select sum(amount_cents) from e2 where mon = m.mon and approval_status in ('approved', 'adjusted')), 0),
        'paid_cents', case when entry_dims then null else coalesce((select sum(amount_cents) from pay where pay.mon = m.mon), 0) end,
        'reversals_cents', coalesce((select -sum(amount_cents) from e2 where mon = m.mon and entry_type = 'reversal' and approval_status <> 'rejected'), 0),
        'adjustments_cents', coalesce((select sum(amount_cents) from e2 where mon = m.mon and entry_type in ('adjustment_positive', 'adjustment_negative') and approval_status <> 'rejected'), 0)) order by m.mon) from months m), '[]'::jsonb),
    'ranking_sales', coalesce((select jsonb_agg(x order by (x ->> 'cents')::bigint desc) from (
        select jsonb_build_object('seller_id', c.seller_id, 'name', s.name, 'cents', round(sum(c.credit))::bigint) as x from cr2 c join public.sellers s on s.id = c.seller_id and s.organization_id = p_org
        group by c.seller_id, s.name order by sum(c.credit) desc limit 10) q), '[]'::jsonb),
    'ranking_commission', coalesce((select jsonb_agg(x order by (x ->> 'cents')::bigint desc) from (
        select jsonb_build_object('seller_id', e2.seller_id, 'name', s.name, 'cents', sum(e2.amount_cents)) as x from e2 join public.sellers s on s.id = e2.seller_id and s.organization_id = p_org
        where e2.approval_status <> 'rejected' group by e2.seller_id, s.name order by sum(e2.amount_cents) desc limit 10) q), '[]'::jsonb),
    'by_team', coalesce((select jsonb_agg(x order by (x ->> 'cents')::bigint desc) from (
        select jsonb_build_object('team_id', e2.team_id, 'name', coalesce(t.name, 'Sem equipe'), 'cents', sum(e2.amount_cents)) as x from e2 left join public.sales_teams t on t.id = e2.team_id and t.organization_id = p_org
        where e2.approval_status <> 'rejected' group by e2.team_id, t.name) q), '[]'::jsonb),
    'by_category', coalesce((select jsonb_agg(x order by (x ->> 'cents')::bigint desc) from (
        select jsonb_build_object('category_id', e2.category_id, 'name', coalesce(c.name, 'Sem categoria'), 'cents', sum(e2.amount_cents)) as x from e2 left join public.product_categories c on c.id = e2.category_id and c.organization_id = p_org
        where e2.approval_status <> 'rejected' group by e2.category_id, c.name) q), '[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', approval_status, 'count', n, 'cents', s)) from (select approval_status, count(*) n, sum(amount_cents) s from e2 group by approval_status) q), '[]'::jsonb),
    'by_plan', coalesce((select jsonb_agg(x order by (x ->> 'cents')::bigint desc) from (
        select jsonb_build_object('plan_id', e2.plan_id, 'name', coalesce(p.name, 'Ajustes manuais'), 'cents', sum(e2.amount_cents)) as x from e2
        left join public.commission_plans p on p.id = e2.plan_id and p.organization_id = p_org where e2.approval_status <> 'rejected' group by e2.plan_id, p.name) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Visão agregada para o perfil «Consulta»: totais da empresa, sem qualquer dado individual de remuneração.
create function public.cm_org_aggregates(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare base_c bigint; calc bigint; appr bigint; paid bigint; rev bigint; n int; prof text;
begin
  perform private.cm_guard(p_org, 'read');
  prof := private.cm_profile(p_org);
  if prof not in ('viewer', 'admin', 'finance') then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then raise exception 'período inválido' using errcode = '22023'; end if;
  select coalesce(sum(si.commissionable_amount_cents - coalesce((select sum((ev.metadata_json -> 'itemAmounts' ->> si.id::text)::bigint) from public.sale_events ev
          where ev.sale_id = sa.id and ev.event_type in ('partially_returned', 'totally_returned') and ev.effective_at <= p_to), 0)), 0), count(distinct sa.id)
    into base_c, n from public.sales sa join public.sale_items si on si.sale_id = sa.id and si.organization_id = sa.organization_id
    where sa.organization_id = p_org and sa.status in ('confirmed', 'partially_returned') and sa.sale_date between p_from and p_to;
  select coalesce(sum(amount_cents) filter (where approval_status <> 'rejected'), 0), coalesce(sum(amount_cents) filter (where approval_status in ('approved', 'adjusted')), 0),
         coalesce(-sum(amount_cents) filter (where entry_type = 'reversal' and approval_status <> 'rejected'), 0)
    into calc, appr, rev from public.commission_entries where organization_id = p_org and effective_at between p_from and p_to;
  select coalesce(sum(pa.amount_cents), 0) into paid from public.payout_allocations pa join public.payout_records pr on pr.id = pa.payout_id and pr.organization_id = pa.organization_id
    where pa.organization_id = p_org and pr.status = 'recorded' and pr.payment_date between p_from and p_to;
  return jsonb_build_object('sales_base_cents', base_c, 'sales_count', n, 'calculated_cents', calc, 'approved_cents', appr, 'paid_cents', paid, 'reversals_cents', rev,
    'cost_pct', case when base_c > 0 then round(calc * 100.0 / base_c, 2) end);
end $$;

commit;
