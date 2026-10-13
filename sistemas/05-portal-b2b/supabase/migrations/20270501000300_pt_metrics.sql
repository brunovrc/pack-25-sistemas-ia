-- Portal de Clientes B2B — INDICADORES (parte 4). Fonte única do painel, do portal do cliente e dos relatórios. Definições: docs/METRICS.md.
-- Funções security INVOKER: o RLS limita o que cada papel enxerga (colaborador: só o que gerencia; cliente: só a própria conta). Período e «dia» no fuso da organização.

begin;
set local check_function_bodies = off;

create function private.pt_window(p_org uuid, p_from date, p_to date) returns table (t0 timestamptz, t1 timestamptz, tz text)
language plpgsql stable security invoker set search_path = '' as $$
declare v_tz text;
begin
  if p_org is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then raise exception 'período inválido' using errcode = '22023'; end if;
  select s.timezone into v_tz from public.portal_settings s where s.organization_id = p_org;
  v_tz := coalesce(v_tz, 'America/Sao_Paulo');
  if not exists (select 1 from pg_timezone_names n where n.name = v_tz) then v_tz := 'America/Sao_Paulo'; end if;
  return query select (p_from::timestamp at time zone v_tz), ((p_to + 1)::timestamp at time zone v_tz), v_tz;
end $$;

-- Solicitações dentro dos filtros globais (cliente, responsável, categoria, prioridade, situação).
create function private.pt_scope(p_org uuid, p_client uuid, p_assignee uuid, p_category uuid, p_priority public.pt_priority, p_status public.pt_request_status) returns setof public.requests
language sql stable security invoker set search_path = '' as $$
  select r.* from public.requests r
  where r.organization_id = p_org and (p_client is null or r.client_account_id = p_client) and (p_assignee is null or r.assigned_to = p_assignee)
    and (p_category is null or r.category_id = p_category) and (p_priority is null or r.priority = p_priority) and (p_status is null or r.status = p_status);
$$;

do $$
declare f text;
begin
  foreach f in array array['private.pt_window(uuid, date, date)', 'private.pt_scope(uuid, uuid, uuid, uuid, public.pt_priority, public.pt_request_status)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ======================================================================= KPIs
create function public.pt_kpis(p_org uuid, p_from date, p_to date, p_client uuid default null, p_assignee uuid default null, p_category uuid default null, p_priority public.pt_priority default null, p_status public.pt_request_status default null)
returns table (open_now bigint, completed bigint, overdue bigint, due_soon bigint, stale bigint, on_time_pct numeric, avg_resolution_hours numeric, active_clients bigint, deliverables_pending bigint,
               deliverables_published bigint, unassigned bigint, created bigint, docs_shared bigint, awaiting_provider bigint)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare w record; s public.portal_settings%rowtype;
begin
  select * into w from private.pt_window(p_org, p_from, p_to);
  select * into s from public.portal_settings where organization_id = p_org;
  if not found then raise exception 'organização sem configuração' using errcode = 'P0002'; end if;
  return query
  with sc as (select * from private.pt_scope(p_org, p_client, p_assignee, p_category, p_priority, p_status)),
  done as (select * from sc where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1),
  dl as (select d.* from public.deliverables d where d.organization_id = p_org and (p_client is null or d.client_account_id = p_client))
  select
    (select count(*) from sc where sc.status not in ('completed', 'cancelled')),
    (select count(*) from done),
    (select count(*) from sc where sc.status not in ('completed', 'cancelled') and sc.due_at is not null and sc.due_at < now()),
    (select count(*) from sc where sc.status not in ('completed', 'cancelled') and sc.due_at is not null and sc.due_at >= now() and sc.due_at <= now() + make_interval(hours => s.alert_due_soon_hours)),
    (select count(*) from sc where sc.status not in ('completed', 'cancelled') and sc.last_activity_at < now() - make_interval(days => s.alert_stale_days)),
    (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where done.completed_at <= done.due_at) / count(*), 1) end from done where done.due_at is not null),
    (select round((avg(extract(epoch from (done.completed_at - done.created_at))) / 3600)::numeric, 1) from done),
    (select count(*) from public.client_accounts ca where ca.organization_id = p_org and ca.status = 'active' and ca.archived_at is null and (p_client is null or ca.id = p_client)),
    (select count(*) from dl where dl.status in ('draft', 'in_preparation', 'ready')),
    (select count(*) from dl where dl.status in ('published', 'acknowledged') and dl.delivered_at >= w.t0 and dl.delivered_at < w.t1),
    (select count(*) from sc where sc.status not in ('completed', 'cancelled') and sc.assigned_to is null),
    (select count(*) from sc where sc.created_at >= w.t0 and sc.created_at < w.t1),
    (select count(*) from public.documents x where x.organization_id = p_org and x.visibility = 'client' and x.archived_at is null and x.created_at >= w.t0 and x.created_at < w.t1 and (p_client is null or x.client_account_id = p_client)),
    (select count(*) from sc where sc.status in ('open', 'waiting_provider'));
end $$;

-- ======================================================================= séries (dia ≤ 62 dias; semana ≤ 210; mês)
create function public.pt_series(p_org uuid, p_from date, p_to date, p_client uuid default null, p_assignee uuid default null, p_category uuid default null, p_priority public.pt_priority default null, p_status public.pt_request_status default null)
returns table (bucket date, granularity text, created bigint, completed bigint, on_time bigint, late bigint, avg_resolution_hours numeric, deliverables_published bigint)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare w record; unit text;
begin
  select * into w from private.pt_window(p_org, p_from, p_to);
  unit := case when p_to - p_from <= 62 then 'day' when p_to - p_from <= 210 then 'week' else 'month' end;
  return query
  with sc as (select * from private.pt_scope(p_org, p_client, p_assignee, p_category, p_priority, p_status)),
  cr as (select date_trunc(unit, (sc.created_at at time zone w.tz))::date as d, count(*) as n from sc where sc.created_at >= w.t0 and sc.created_at < w.t1 group by 1),
  dn as (select date_trunc(unit, (sc.completed_at at time zone w.tz))::date as d, count(*) as n, count(*) filter (where sc.due_at is not null and sc.completed_at <= sc.due_at) as ok,
                count(*) filter (where sc.due_at is not null and sc.completed_at > sc.due_at) as lt,
                round((avg(extract(epoch from (sc.completed_at - sc.created_at))) / 3600)::numeric, 1) as av
         from sc where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1 group by 1),
  dv as (select date_trunc(unit, (x.delivered_at at time zone w.tz))::date as d, count(*) as n from public.deliverables x
         where x.organization_id = p_org and x.status in ('published', 'acknowledged') and x.delivered_at >= w.t0 and x.delivered_at < w.t1 and (p_client is null or x.client_account_id = p_client) group by 1),
  axis as (select generate_series(date_trunc(unit, p_from::timestamp), date_trunc(unit, p_to::timestamp), ('1 ' || unit)::interval)::date as d)
  select axis.d, unit, coalesce(cr.n, 0), coalesce(dn.n, 0), coalesce(dn.ok, 0), coalesce(dn.lt, 0), dn.av, coalesce(dv.n, 0)
  from axis left join cr on cr.d = axis.d left join dn on dn.d = axis.d left join dv on dv.d = axis.d order by axis.d;
end $$;

-- ======================================================================= distribuições e rankings
create function public.pt_status_distribution(p_org uuid, p_client uuid default null, p_assignee uuid default null, p_category uuid default null, p_priority public.pt_priority default null)
returns table (status public.pt_request_status, requests bigint)
language sql stable security invoker set search_path = '' as $$
  select e.s, (select count(*) from private.pt_scope(p_org, p_client, p_assignee, p_category, p_priority, null) r where r.status = e.s)
  from unnest(enum_range(null::public.pt_request_status)) as e(s);
$$;
create function public.pt_priority_distribution(p_org uuid, p_client uuid default null, p_assignee uuid default null, p_category uuid default null, p_status public.pt_request_status default null)
returns table (priority public.pt_priority, requests bigint)
language sql stable security invoker set search_path = '' as $$
  select e.p, (select count(*) from private.pt_scope(p_org, p_client, p_assignee, p_category, null, p_status) r where r.priority = e.p)
  from unnest(enum_range(null::public.pt_priority)) as e(p);
$$;

create function public.pt_by_assignee(p_org uuid, p_from date, p_to date, p_client uuid default null)
returns table (assignee_id uuid, open_requests bigint, completed bigint, avg_resolution_hours numeric, on_time_pct numeric)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare w record;
begin
  select * into w from private.pt_window(p_org, p_from, p_to);
  return query
  with sc as (select * from private.pt_scope(p_org, p_client, null, null, null, null))
  select sc.assigned_to,
    count(*) filter (where sc.status not in ('completed', 'cancelled')),
    count(*) filter (where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1),
    round((avg(extract(epoch from (sc.completed_at - sc.created_at))) filter (where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1) / 3600)::numeric, 1),
    case when count(*) filter (where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1 and sc.due_at is not null) = 0 then null
         else round(100.0 * count(*) filter (where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1 and sc.due_at is not null and sc.completed_at <= sc.due_at)
              / count(*) filter (where sc.status = 'completed' and sc.completed_at >= w.t0 and sc.completed_at < w.t1 and sc.due_at is not null), 1) end
  from sc group by sc.assigned_to order by 2 desc, 3 desc;
end $$;

create function public.pt_by_client(p_org uuid, p_from date, p_to date)
returns table (client_id uuid, name text, created bigint, open_requests bigint, overdue bigint, completed bigint)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare w record;
begin
  select * into w from private.pt_window(p_org, p_from, p_to);
  return query
  select ca.id, ca.name,
    (select count(*) from public.requests r where r.client_account_id = ca.id and r.created_at >= w.t0 and r.created_at < w.t1),
    (select count(*) from public.requests r where r.client_account_id = ca.id and r.status not in ('completed', 'cancelled')),
    (select count(*) from public.requests r where r.client_account_id = ca.id and r.status not in ('completed', 'cancelled') and r.due_at is not null and r.due_at < now()),
    (select count(*) from public.requests r where r.client_account_id = ca.id and r.status = 'completed' and r.completed_at >= w.t0 and r.completed_at < w.t1)
  from public.client_accounts ca where ca.organization_id = p_org and ca.archived_at is null order by 3 desc, ca.name;
end $$;

-- ======================================================================= alertas (agora)
create function public.pt_alerts(p_org uuid) returns table (key text, requests bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare s public.portal_settings%rowtype;
begin
  select * into s from public.portal_settings where organization_id = p_org;
  if not found then raise exception 'organização sem configuração' using errcode = 'P0002'; end if;
  return query
  select 'overdue', (select count(*) from public.requests r where r.organization_id = p_org and r.status not in ('completed', 'cancelled') and r.due_at is not null and r.due_at < now())
  union all select 'due_soon', (select count(*) from public.requests r where r.organization_id = p_org and r.status not in ('completed', 'cancelled') and r.due_at >= now() and r.due_at <= now() + make_interval(hours => s.alert_due_soon_hours))
  union all select 'awaiting_provider', (select count(*) from public.requests r where r.organization_id = p_org and r.status in ('open', 'waiting_provider'))
  union all select 'unassigned', (select count(*) from public.requests r where r.organization_id = p_org and r.status not in ('completed', 'cancelled') and r.assigned_to is null)
  union all select 'stale', (select count(*) from public.requests r where r.organization_id = p_org and r.status not in ('completed', 'cancelled') and r.last_activity_at < now() - make_interval(days => s.alert_stale_days))
  union all select 'deliverables_pending', (select count(*) from public.deliverables d where d.organization_id = p_org and d.status in ('draft', 'in_preparation', 'ready'));
end $$;

-- Exportação de CSV deixa rastro na auditoria (quem, qual relatório, quantas linhas; nunca os dados). Só gestão, e com MFA quando exigido.
create function public.pt_log_export(p_org uuid, p_kind text, p_rows integer) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if not private.pt_is_manager(p_org) or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_kind is null or p_kind !~ '^[a-z0-9-]{2,40}$' then raise exception 'relatório inválido' using errcode = '22023'; end if;
  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, changes)
  values (p_org, (select auth.uid()), 'export', 'report', p_kind, jsonb_build_object('rows', greatest(coalesce(p_rows, 0), 0)));
end $fn$;

do $$
declare f text;
begin
  foreach f in array array['public.pt_log_export(uuid, text, integer)', 'public.pt_kpis(uuid, date, date, uuid, uuid, uuid, public.pt_priority, public.pt_request_status)', 'public.pt_series(uuid, date, date, uuid, uuid, uuid, public.pt_priority, public.pt_request_status)',
    'public.pt_status_distribution(uuid, uuid, uuid, uuid, public.pt_priority)', 'public.pt_priority_distribution(uuid, uuid, uuid, uuid, public.pt_request_status)',
    'public.pt_by_assignee(uuid, date, date, uuid)', 'public.pt_by_client(uuid, date, date)', 'public.pt_alerts(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
