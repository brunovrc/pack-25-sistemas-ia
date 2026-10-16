-- Gestão de Comissões — GUARDAS: bootstrap da empresa, guard de função, auditoria, avisos e IMUTABILIDADE (vale até para o dono do schema).
-- Flags de sessão (`cm.*`) só são ligadas por funções cm_* SECURITY DEFINER; o usuário não consegue defini-las para um UPDATE direto porque não tem UPDATE.

begin;
set local check_function_bodies = off;

create function private.cm_tz(org uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce((select s.timezone from public.commission_settings s where s.organization_id = org), 'America/Sao_Paulo');
$$;
create function private.cm_today(org uuid) returns date
language sql stable set search_path = '' as $$ select (now() at time zone private.cm_tz(org))::date; $$;

-- ======================================================================= padrões por empresa
create function private.cm_bootstrap_org(org uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.commission_settings (organization_id) values (org) on conflict do nothing;
end $$;
revoke all on function private.cm_bootstrap_org(uuid) from public, anon, authenticated;
create function private.cm_on_org_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.cm_bootstrap_org(new.id); return null; end $$;
revoke all on function private.cm_on_org_created() from public, anon, authenticated;
create trigger cm_on_org_created after insert on public.organizations for each row execute function private.cm_on_org_created();
select private.cm_bootstrap_org(id) from public.organizations;

-- ======================================================================= guard: sessão + MFA + perfil (toda função cm_* começa por aqui)
-- níveis: admin · finance (admin+financeiro) · manager (admin+financeiro+gestor) · seller · read (qualquer perfil)
create function private.cm_guard(p_org uuid, p_level text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare ok boolean;
begin
  if (select auth.uid()) is null then raise exception 'sessão inválida' using errcode = '28000'; end if;
  if not private.mfa_ok() then raise exception 'verificação em duas etapas necessária' using errcode = '42501'; end if;
  ok := case p_level
    when 'admin' then private.cm_is_admin(p_org)
    when 'finance' then private.cm_is_finance(p_org)
    when 'manager' then private.cm_is_manager(p_org)
    when 'seller' then coalesce(private.cm_profile(p_org) = 'seller', false)
    else private.cm_profile(p_org) is not null end;
  if not ok then raise exception 'sem permissão' using errcode = '42501'; end if;
end $$;
revoke all on function private.cm_guard(uuid, text) from public, anon;
grant execute on function private.cm_guard(uuid, text) to authenticated;

create function private.cm_audit(p_org uuid, p_action text, p_entity text, p_entity_id uuid, p_changes jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, changes) values (p_org, (select auth.uid()), p_action, p_entity, p_entity_id::text, p_changes);
end $$;
revoke all on function private.cm_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- ======================================================================= avisos (sem valores de remuneração no texto; só para quem tem acesso)
create function private.cm_notify_user(p_org uuid, p_user uuid, p_type text, p_title text, p_body text, p_resource_type text, p_resource_id uuid, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.commission_notifications (organization_id, user_id, type, title, body, resource_type, resource_id, dedupe_key)
  select m.organization_id, m.user_id, p_type, p_title, p_body, p_resource_type, p_resource_id, p_dedupe
  from public.organization_members m
  where m.organization_id = p_org and m.user_id = p_user
    and coalesce((select pr.enabled from public.commission_notification_prefs pr where pr.organization_id = m.organization_id and pr.user_id = m.user_id and pr.type = p_type), true)
  on conflict do nothing;
end $$;
-- administradores e financeiros da empresa
create function private.cm_notify_finance(p_org uuid, p_type text, p_title text, p_body text, p_resource_type text, p_resource_id uuid, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in
    select m.user_id from public.organization_members m
    where m.organization_id = p_org and (m.role in ('owner', 'admin')
      or exists (select 1 from public.commission_access a where a.organization_id = p_org and a.user_id = m.user_id and a.profile = 'finance'))
  loop
    perform private.cm_notify_user(p_org, u, p_type, p_title, p_body, p_resource_type, p_resource_id, case when p_dedupe is null then null else p_dedupe || ':' || u end);
  end loop;
end $$;
-- vendedor (se tiver login) e gestor da equipe dele
create function private.cm_notify_seller_side(p_org uuid, p_seller uuid, p_type text, p_title text, p_body text, p_resource_type text, p_resource_id uuid, p_dedupe text, p_include_manager boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare su uuid; mu uuid;
begin
  select s.user_id, t.manager_user_id into su, mu from public.sellers s left join public.sales_teams t on t.id = s.team_id and t.organization_id = s.organization_id
  where s.id = p_seller and s.organization_id = p_org;
  perform private.cm_notify_user(p_org, su, p_type, p_title, p_body, p_resource_type, p_resource_id, case when p_dedupe is null then null else p_dedupe || ':' || su end);
  if p_include_manager and mu is not null then
    perform private.cm_notify_user(p_org, mu, p_type, p_title, p_body, p_resource_type, p_resource_id, case when p_dedupe is null then null else p_dedupe || ':' || mu end);
  end if;
end $$;
revoke all on function private.cm_notify_user(uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.cm_notify_finance(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.cm_notify_seller_side(uuid, uuid, text, text, text, text, uuid, text, boolean) from public, anon, authenticated;

-- ======================================================================= updated_at, auditoria (só metadados) e organização imutável
do $$
declare t text;
begin
  foreach t in array array['commission_settings', 'sales_teams', 'sellers', 'customers', 'products', 'commission_plans', 'sales', 'sales_goals'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', 'upd_' || t, t);
  end loop;
  foreach t in array array['commission_settings', 'commission_access', 'sales_teams', 'sellers', 'customers', 'products', 'product_categories', 'commission_plans', 'commission_plan_versions',
    'commission_rules', 'seller_plan_assignments', 'sales', 'customer_receipts', 'sales_goals', 'goal_bonus_rules', 'commission_adjustments', 'commission_disputes',
    'commission_periods', 'commission_closings', 'payout_records', 'commission_statements', 'import_jobs'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_trigger(%L, %L)',
      'audit_' || t, t, 'organization_id', case t when 'commission_settings' then 'organization_id' when 'commission_access' then 'user_id' else 'id' end);
  end loop;
end $$;

create function private.cm_org_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then raise exception 'a organização do registro não pode mudar' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.cm_org_immutable() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['sales_teams', 'sellers', 'customers', 'products', 'commission_plans', 'commission_plan_versions', 'commission_rules', 'sales', 'sale_items', 'sale_participants',
    'customer_receipts', 'sales_goals', 'commission_entries', 'commission_closings', 'payout_records', 'commission_periods'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.cm_org_immutable()', 'orgimm_' || t, t);
  end loop;
end $$;

-- ======================================================================= imutabilidade
create function private.cm_no_delete() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'registro não pode ser apagado (histórico preservado): %', tg_table_name using errcode = '23514'; end $$;
create function private.cm_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'registro imutável: %', tg_table_name using errcode = '23514'; end $$;
revoke all on function private.cm_no_delete() from public, anon, authenticated;
revoke all on function private.cm_append_only() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['sales_teams', 'sellers', 'seller_team_history', 'customers', 'product_categories', 'products', 'commission_plans', 'commission_plan_versions', 'commission_rules',
    'commission_tiers', 'seller_plan_assignments', 'sales_goals', 'sale_events', 'customer_receipts', 'commission_calculation_runs', 'commission_calculation_details',
    'commission_pendencies', 'commission_entries', 'commission_approval_events', 'commission_disputes', 'commission_adjustments', 'commission_periods', 'commission_closings',
    'commission_closing_items', 'payout_records', 'payout_allocations', 'commission_statements', 'import_jobs', 'import_row_errors'] loop
    -- rascunhos de plano (regras/faixas) podem ser regravados; tratados mais abaixo
    if t not in ('commission_rules', 'commission_tiers') then
      execute format('create trigger %I before delete on public.%I for each row execute function private.cm_no_delete()', 'nodel_' || t, t);
    end if;
  end loop;
  foreach t in array array['sale_events', 'commission_calculation_details', 'commission_approval_events', 'import_row_errors', 'payout_allocations', 'commission_statements'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.cm_append_only()', 'append_' || t, t);
  end loop;
end $$;
-- Execuções de cálculo: só status/estatística avançam; resultados anteriores não mudam.
create function private.cm_run_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'running' then raise exception 'execução encerrada não pode ser alterada' using errcode = '23514'; end if;
  if new.reference_period_start <> old.reference_period_start or new.reference_period_end <> old.reference_period_end or new.initiated_by is distinct from old.initiated_by or new.engine_version <> old.engine_version then
    raise exception 'parâmetros da execução são imutáveis' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cm_run_guard() from public, anon, authenticated;
create trigger run_guard before update on public.commission_calculation_runs for each row execute function private.cm_run_guard();

-- Lançamento: valores e vínculos NUNCA mudam. Só o estado de aprovação, por função autorizada (flag), e nunca para trás de 'approved' sem evento.
create function private.cm_entry_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'approval_status') is distinct from (to_jsonb(old) - 'approval_status') then
    raise exception 'lançamento é imutável: corrija com um novo lançamento compensatório' using errcode = '23514';
  end if;
  if new.approval_status is distinct from old.approval_status and coalesce(current_setting('cm.entry_update', true), '') <> 'on' then
    raise exception 'o estado de aprovação só muda por função autorizada' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cm_entry_guard() from public, anon, authenticated;
create trigger entry_guard before update on public.commission_entries for each row execute function private.cm_entry_guard();

-- Lançamento de venda cancelada/devolvida por inteiro não pode receber NOVA comissão positiva (cenário §37); ajustes manuais são exceção.
create function private.cm_entry_insert_guard() returns trigger language plpgsql set search_path = '' as $$
declare st text;
begin
  if new.sale_id is not null and new.amount_cents > 0 and new.origin = 'engine' then
    select s.status into st from public.sales s where s.id = new.sale_id and s.organization_id = new.organization_id;
    if st in ('cancelled', 'totally_returned') then
      raise exception 'venda cancelada/devolvida não gera nova comissão positiva' using errcode = '23514';
    end if;
    if st = 'draft' then raise exception 'venda em rascunho não gera comissão' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke all on function private.cm_entry_insert_guard() from public, anon, authenticated;
create trigger entry_insert_guard before insert on public.commission_entries for each row execute function private.cm_entry_insert_guard();

-- Plano publicado: versão congelada (só valid_until, ao ser sucedida); regras e faixas só mudam em rascunho.
create function private.cm_version_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' then
    if (to_jsonb(new) - 'valid_until') is distinct from (to_jsonb(old) - 'valid_until') then
      raise exception 'versão de plano publicada é imutável (crie uma nova versão)' using errcode = '23514';
    end if;
    if new.valid_until is distinct from old.valid_until and coalesce(current_setting('cm.version_update', true), '') <> 'on' then
      raise exception 'vigência só muda por função autorizada' using errcode = '23514';
    end if;
  end if;
  if old.status = 'draft' and new.status = 'draft' and (new.plan_id <> old.plan_id or new.version_number <> old.version_number) then
    raise exception 'identidade da versão é imutável' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cm_version_guard() from public, anon, authenticated;
create trigger version_guard before update on public.commission_plan_versions for each row execute function private.cm_version_guard();

create function private.cm_rule_draft_guard() returns trigger language plpgsql set search_path = '' as $$
declare v uuid := coalesce(new.plan_version_id, old.plan_version_id); st text;
begin
  select status into st from public.commission_plan_versions where id = v;
  if st is distinct from 'draft' then raise exception 'regras e faixas de versão publicada são imutáveis' using errcode = '23514'; end if;
  return coalesce(new, old);
end $$;
revoke all on function private.cm_rule_draft_guard() from public, anon, authenticated;
create trigger rule_draft_guard before insert or update or delete on public.commission_rules for each row execute function private.cm_rule_draft_guard();
create trigger tier_draft_guard before insert or update or delete on public.commission_tiers for each row execute function private.cm_rule_draft_guard();

-- Venda: itens, participantes e totais só mudam em rascunho; depois da confirmação, só cancelamento/devolução/plano fixado, por função autorizada.
create function private.cm_sale_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'venda confirmada não pode ser apagada' using errcode = '23514'; end if;
    return old;
  end if;
  if old.status <> 'draft' then
    if (to_jsonb(new) - 'status' - 'cancelled_at' - 'cancelled_on' - 'cancel_reason' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'cancelled_at' - 'cancelled_on' - 'cancel_reason' - 'updated_at') then
      raise exception 'venda confirmada é imutável (somente cancelamento/devolução por procedimento)' using errcode = '23514';
    end if;
    if new.status is distinct from old.status and coalesce(current_setting('cm.sale_update', true), '') <> 'on' then
      raise exception 'o estado da venda só muda por função autorizada' using errcode = '23514';
    end if;
    if old.status in ('cancelled', 'totally_returned') and new.status is distinct from old.status then raise exception 'venda encerrada não volta a ser usada' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke all on function private.cm_sale_guard() from public, anon, authenticated;
create trigger sale_guard before update or delete on public.sales for each row execute function private.cm_sale_guard();

create function private.cm_sale_child_guard() returns trigger language plpgsql set search_path = '' as $$
declare sid uuid := coalesce(new.sale_id, old.sale_id); st text;
begin
  select status into st from public.sales where id = sid;
  if tg_table_name = 'sale_participants' and tg_op = 'UPDATE' and st is distinct from 'draft'
     and (to_jsonb(new) - 'plan_version_id') is not distinct from (to_jsonb(old) - 'plan_version_id') and coalesce(current_setting('cm.sale_update', true), '') = 'on' then
    return new; -- fixação do plano na confirmação
  end if;
  if st is distinct from 'draft' then raise exception 'itens e participantes de venda confirmada são imutáveis' using errcode = '23514'; end if;
  return coalesce(new, old);
end $$;
revoke all on function private.cm_sale_child_guard() from public, anon, authenticated;
create trigger sale_items_guard before insert or update or delete on public.sale_items for each row execute function private.cm_sale_child_guard();
create trigger sale_participants_guard before insert or update or delete on public.sale_participants for each row execute function private.cm_sale_child_guard();

-- Recebimento: só pode ser ESTORNADO (nunca apagado nem ter o valor reescrito).
create function private.cm_receipt_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'status' - 'reversed_at' - 'reversed_by' - 'reversal_reason') is distinct from (to_jsonb(old) - 'status' - 'reversed_at' - 'reversed_by' - 'reversal_reason') then
    raise exception 'recebimento é imutável (estorne e registre outro)' using errcode = '23514';
  end if;
  if old.status = 'reversed' then raise exception 'recebimento já estornado' using errcode = '23514'; end if;
  if coalesce(current_setting('cm.receipt_update', true), '') <> 'on' then raise exception 'recebimento só muda por função autorizada' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.cm_receipt_guard() from public, anon, authenticated;
create trigger receipt_guard before update on public.customer_receipts for each row execute function private.cm_receipt_guard();

-- Fechamento: depois de fechado, só pode ser CANCELADO por procedimento de reabertura; valores nunca mudam.
create function private.cm_closing_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('cm.closing_update', true), '') <> 'on' then raise exception 'fechamento só muda por função autorizada' using errcode = '23514'; end if;
  if old.status = 'cancelled' then raise exception 'fechamento cancelado é definitivo' using errcode = '23514'; end if;
  if old.status = 'closed' then
    if new.status <> 'cancelled' or (to_jsonb(new) - 'status' - 'cancelled_at' - 'cancel_reason') is distinct from (to_jsonb(old) - 'status' - 'cancelled_at' - 'cancel_reason') then
      raise exception 'fechamento concluído é imutável (reabra o período por procedimento formal)' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.cm_closing_guard() from public, anon, authenticated;
create trigger closing_guard before update on public.commission_closings for each row execute function private.cm_closing_guard();

create function private.cm_closing_item_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('cm.closing_update', true), '') <> 'on' then raise exception 'itens de fechamento só mudam por função autorizada' using errcode = '23514'; end if;
  if (to_jsonb(new) - 'voided_at') is distinct from (to_jsonb(old) - 'voided_at') or old.voided_at is not null then
    raise exception 'item de fechamento é imutável' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cm_closing_item_guard() from public, anon, authenticated;
create trigger closing_item_guard before update on public.commission_closing_items for each row execute function private.cm_closing_item_guard();

create function private.cm_period_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('cm.period_update', true), '') <> 'on' then raise exception 'período só muda por função autorizada' using errcode = '23514'; end if;
  if new.period_start <> old.period_start or new.period_end <> old.period_end then raise exception 'datas do período são imutáveis' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.cm_period_guard() from public, anon, authenticated;
create trigger period_guard before update on public.commission_periods for each row execute function private.cm_period_guard();

-- Pagamento registrado: só pode ser ESTORNADO (o registro permanece). Soma das alocações = valor do pagamento (verificada ao fim da transação).
create function private.cm_payout_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'status' - 'reversed_at' - 'reversed_by' - 'reversal_reason') is distinct from (to_jsonb(old) - 'status' - 'reversed_at' - 'reversed_by' - 'reversal_reason') then
    raise exception 'pagamento registrado é imutável (estorne e registre outro)' using errcode = '23514';
  end if;
  if old.status = 'reversed' then raise exception 'pagamento já estornado' using errcode = '23514'; end if;
  if coalesce(current_setting('cm.payout_update', true), '') <> 'on' then raise exception 'pagamento só muda por função autorizada' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.cm_payout_guard() from public, anon, authenticated;
create trigger payout_guard before update on public.payout_records for each row execute function private.cm_payout_guard();

create function private.cm_payout_sum_check() returns trigger language plpgsql set search_path = '' as $$
declare pid uuid := coalesce(new.id, old.id); amt bigint; s bigint;
begin
  select amount_cents into amt from public.payout_records where id = pid;
  select coalesce(sum(amount_cents), 0) into s from public.payout_allocations where payout_id = pid;
  if amt is not null and s <> amt then raise exception 'as alocações do pagamento devem somar exatamente o valor pago' using errcode = '23514'; end if;
  return null;
end $$;
revoke all on function private.cm_payout_sum_check() from public, anon, authenticated;
create constraint trigger payout_sum_check after insert on public.payout_records deferrable initially deferred for each row execute function private.cm_payout_sum_check();

-- Pendência e contestação: só mudam por funções autorizadas.
create function private.cm_flag_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('cm.flag_update', true), '') <> 'on' then raise exception 'registro só muda por função autorizada' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.cm_flag_guard() from public, anon, authenticated;
create trigger flag_guard_pend before update on public.commission_pendencies for each row execute function private.cm_flag_guard();
create trigger flag_guard_disp before update on public.commission_disputes for each row execute function private.cm_flag_guard();
create trigger flag_guard_adj before update on public.commission_adjustments for each row execute function private.cm_flag_guard();
create trigger flag_guard_job before update on public.import_jobs for each row execute function private.cm_flag_guard();

commit;
