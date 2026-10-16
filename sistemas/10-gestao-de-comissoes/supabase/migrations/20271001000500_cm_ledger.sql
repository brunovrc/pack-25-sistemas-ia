-- Gestão de Comissões — LIVRO: gravação idempotente do cálculo, aprovação, contestações e ajustes.
-- O cálculo matemático roda no servidor (motor TS único, sem duplicar regra no banco). O banco é a trava de integridade:
-- valida vínculo venda/vendedor/plano/regra, sinal por tipo, unicidade por chave de idempotência e estorno único por evento.

begin;
set local check_function_bodies = off;

-- ======================================================================= gravação do cálculo
create function public.cm_post_calculation(
  p_org uuid, p_run_type text, p_start date, p_end date, p_engine text, p_hash text, p_scope_sales uuid[], p_details jsonb, p_entries jsonb, p_pendencies jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run_id uuid; d jsonb; e jsonb; pd jsonb; sale_ids uuid[]; sid uuid; det_id uuid; orig uuid; ent_id uuid; owner_ver uuid; part record;
  n_det int := 0; n_new int := 0; n_skip int := 0; n_pend int := 0; sellers_new uuid[] := '{}'; sellers_rev uuid[] := '{}'; sl uuid; crit int := 0; new_ids uuid[] := '{}'; gp text[]; br public.goal_bonus_rules; booked_g bigint;
begin
  perform private.cm_guard(p_org, 'finance');
  if p_run_type not in ('sale', 'period', 'goals', 'reprocess') then raise exception 'tipo de execução inválido' using errcode = '22023'; end if;
  if jsonb_typeof(p_details) <> 'array' or jsonb_typeof(p_entries) <> 'array' or jsonb_typeof(coalesce(p_pendencies, '[]'::jsonb)) <> 'array' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  if jsonb_array_length(p_details) > 6000 or jsonb_array_length(p_entries) > 6000 or jsonb_array_length(coalesce(p_pendencies, '[]'::jsonb)) > 2000 then raise exception 'lote grande demais' using errcode = '22023'; end if;
  -- serializa processamentos simultâneos da MESMA venda (a chave de idempotência cuida do resto)
  select coalesce(array_agg(distinct x order by x), '{}') into sale_ids from (
    select unnest(coalesce(p_scope_sales, '{}')) as x
    union select (je ->> 'saleId')::uuid from jsonb_array_elements(p_entries) je where je ->> 'saleId' is not null) q;
  foreach sid in array sale_ids loop perform pg_advisory_xact_lock(hashtextextended(p_org::text || sid::text, 7)); end loop;

  insert into public.commission_calculation_runs (organization_id, reference_period_start, reference_period_end, run_type, initiated_by, input_hash, engine_version)
  values (p_org, p_start, p_end, p_run_type, (select auth.uid()), p_hash, left(coalesce(p_engine, '?'), 20)) returning id into run_id;

  for d in select * from jsonb_array_elements(p_details) loop
    if not exists (
      select 1 from (select x.base_amount_cents b, x.calculated_amount_cents c, x.eligible_amount_cents el, x.plan_version_id pv, x.rate_decimal r from public.commission_calculation_details x
        where x.organization_id = p_org and x.component_key = d ->> 'componentKey' and x.seller_id = (d ->> 'sellerId')::uuid order by x.created_at desc, x.id desc limit 1) l
      where l.b = (d ->> 'baseCents')::bigint and l.c = (d ->> 'potentialCents')::bigint and l.el = (d ->> 'eligibleCents')::bigint and l.pv = (d ->> 'planVersionId')::uuid
        and l.r is not distinct from nullif(d ->> 'rate', '')::numeric) then
      insert into public.commission_calculation_details (organization_id, calculation_run_id, component_key, sale_id, sale_item_id, seller_id, plan_version_id, rule_id, base_amount_cents, rate_decimal,
        calculated_amount_cents, eligible_amount_cents, calculation_snapshot_json)
      values (p_org, run_id, d ->> 'componentKey', nullif(d ->> 'saleId', '')::uuid, nullif(d ->> 'itemId', '')::uuid, (d ->> 'sellerId')::uuid, (d ->> 'planVersionId')::uuid, nullif(d ->> 'ruleId', '')::uuid,
        (d ->> 'baseCents')::bigint, nullif(d ->> 'rate', '')::numeric, (d ->> 'potentialCents')::bigint, (d ->> 'eligibleCents')::bigint, d -> 'snapshot');
      n_det := n_det + 1;
    end if;
  end loop;

  for e in select * from jsonb_array_elements(p_entries) loop
    -- vínculos: o vendedor participa da venda e o plano/regra são os FIXADOS na confirmação (não aceita plano injetado)
    if e ->> 'saleId' is not null then
      select sp.plan_version_id, sp.participation_type into part from public.sale_participants sp
        where sp.sale_id = (e ->> 'saleId')::uuid and sp.seller_id = (e ->> 'sellerId')::uuid and sp.organization_id = p_org;
      if not found then raise exception 'o vendedor não participa da venda informada' using errcode = '23514'; end if;
      select coalesce(case when s.split_model = 'pool' then (select p2.plan_version_id from public.sale_participants p2 where p2.sale_id = s.id and p2.participation_type = 'primary') else part.plan_version_id end, part.plan_version_id)
        into owner_ver from public.sales s where s.id = (e ->> 'saleId')::uuid and s.organization_id = p_org;
      if owner_ver is distinct from (e ->> 'planVersionId')::uuid then raise exception 'versão de plano diferente da fixada na venda' using errcode = '23514'; end if;
    end if;
    if e ->> 'ruleId' is not null and not exists (select 1 from public.commission_rules r where r.id = (e ->> 'ruleId')::uuid and r.organization_id = p_org and r.plan_version_id = (e ->> 'planVersionId')::uuid) then
      raise exception 'regra não pertence à versão do plano' using errcode = '23514';
    end if;
    if not exists (select 1 from public.commission_plan_versions v where v.id = (e ->> 'planVersionId')::uuid and v.organization_id = p_org and v.status = 'published') then
      raise exception 'plano não publicado' using errcode = '23514';
    end if;
    -- bônus de meta: a chave identifica (meta, regra, vendedor); a regra existe, é da meta, usa o plano informado e o fixo nunca passa do valor definido
    if e ->> 'cause' = 'goal' then
      gp := string_to_array(e ->> 'componentKey', ':');
      if array_length(gp, 1) <> 4 or gp[1] <> 'g' or e ->> 'saleId' is not null then raise exception 'chave de bônus inválida' using errcode = '23514'; end if;
      select * into br from public.goal_bonus_rules where id = gp[3]::uuid and goal_id = gp[2]::uuid and organization_id = p_org;
      if not found or br.plan_version_id <> (e ->> 'planVersionId')::uuid or gp[4]::uuid <> (e ->> 'sellerId')::uuid then raise exception 'regra de bônus inválida para a meta' using errcode = '23514'; end if;
      if br.bonus_type = 'fixed' then
        select coalesce(sum(amount_cents), 0) into booked_g from public.commission_entries where organization_id = p_org and component_key = e ->> 'componentKey' and seller_id = (e ->> 'sellerId')::uuid;
        if booked_g + (e ->> 'amountCents')::bigint > br.bonus_amount_cents and not exists (select 1 from public.commission_entries x where x.organization_id = p_org and x.idempotency_key = e ->> 'idempotencyKey') then
          raise exception 'bônus acima do valor da regra' using errcode = '23514';
        end if;
      end if;
    end if;
    select x.id into det_id from public.commission_calculation_details x where x.organization_id = p_org and x.component_key = e ->> 'componentKey' and x.seller_id = (e ->> 'sellerId')::uuid
      order by x.created_at desc, x.id desc limit 1;
    orig := null;
    if e ->> 'originalIdempotencyKey' is not null then
      select id into orig from public.commission_entries where organization_id = p_org and idempotency_key = e ->> 'originalIdempotencyKey';
      if orig is null then raise exception 'lançamento original não encontrado para o estorno' using errcode = '23514'; end if;
    end if;
    begin
      insert into public.commission_entries (organization_id, seller_id, sale_id, sale_item_id, plan_version_id, rule_id, calculation_detail_id, component_key, idempotency_key, entry_type, amount_cents,
        effective_at, eligible_at, original_entry_id, cause, source_event_id, created_by)
      values (p_org, (e ->> 'sellerId')::uuid, nullif(e ->> 'saleId', '')::uuid, nullif(e ->> 'itemId', '')::uuid, (e ->> 'planVersionId')::uuid, nullif(e ->> 'ruleId', '')::uuid, det_id,
        e ->> 'componentKey', e ->> 'idempotencyKey', e ->> 'entryType', (e ->> 'amountCents')::bigint, (e ->> 'effectiveAt')::date, (e ->> 'eligibleAt')::date, orig,
        e ->> 'cause', nullif(e ->> 'sourceEventId', ''), (select auth.uid()))
      on conflict (organization_id, idempotency_key) do nothing returning id into ent_id;
    exception when unique_violation then
      ent_id := null; -- estorno do mesmo evento já existe com outra chave: não duplica
    end;
    if ent_id is null then n_skip := n_skip + 1;
    else
      n_new := n_new + 1; new_ids := new_ids || ent_id;
      if (e ->> 'amountCents')::bigint > 0 then sellers_new := sellers_new || (e ->> 'sellerId')::uuid; else sellers_rev := sellers_rev || (e ->> 'sellerId')::uuid; end if;
    end if;
  end loop;

  -- pendências: grava as novas, resolve as que sumiram para as vendas processadas
  perform set_config('cm.flag_update', 'on', true);
  for pd in select * from jsonb_array_elements(coalesce(p_pendencies, '[]'::jsonb)) loop
    insert into public.commission_pendencies (organization_id, calculation_run_id, code, severity, message, sale_id, seller_id)
    select p_org, run_id, pd ->> 'code', pd ->> 'severity', left(pd ->> 'message', 300), nullif(pd ->> 'saleId', '')::uuid, nullif(pd ->> 'sellerId', '')::uuid
    where not exists (select 1 from public.commission_pendencies x where x.organization_id = p_org and x.status = 'open' and x.code = pd ->> 'code'
      and coalesce(x.sale_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(nullif(pd ->> 'saleId', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(x.seller_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(nullif(pd ->> 'sellerId', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));
    n_pend := n_pend + 1;
    if pd ->> 'severity' = 'critical' then crit := crit + 1; end if;
  end loop;
  update public.commission_pendencies x set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid())
  where x.organization_id = p_org and x.status = 'open' and x.sale_id = any (coalesce(p_scope_sales, '{}'))
    and not exists (select 1 from jsonb_array_elements(coalesce(p_pendencies, '[]'::jsonb)) q
      where q ->> 'code' = x.code and nullif(q ->> 'saleId', '')::uuid is not distinct from x.sale_id and nullif(q ->> 'sellerId', '')::uuid is not distinct from x.seller_id);
  perform set_config('cm.flag_update', 'off', true);

  update public.commission_calculation_runs set status = 'completed', completed_at = now(),
    stats_json = jsonb_build_object('details', n_det, 'entries_new', n_new, 'entries_skipped', n_skip, 'pendencies', n_pend, 'critical_pendencies', crit, 'sales', coalesce(array_length(sale_ids, 1), 0))
  where id = run_id;

  -- avisos (sem valores): quem tem acesso é avisado
  if n_new > 0 then
    perform private.cm_notify_finance(p_org, 'calculation_done', 'Cálculo de comissões concluído', n_new || ' lançamento(s) novo(s) aguardam revisão.', 'run', run_id, 'run:' || run_id);
    for sl in select distinct unnest(sellers_new) loop
      perform private.cm_notify_seller_side(p_org, sl, 'commission_calculated', 'Nova comissão calculada', 'Há lançamentos novos no seu extrato.', 'seller', sl, 'calc:' || run_id || ':' || sl, true);
    end loop;
    for sl in select distinct unnest(sellers_rev) loop
      perform private.cm_notify_seller_side(p_org, sl, 'commission_reversed', 'Comissão estornada', 'Um estorno foi lançado por devolução ou cancelamento.', 'seller', sl, 'rev:' || run_id || ':' || sl, true);
    end loop;
  end if;
  if crit > 0 then
    perform private.cm_notify_finance(p_org, 'calculation_failed', 'Cálculo com pendências críticas', crit || ' pendência(s) crítica(s) impedem o fechamento.', 'run', run_id, 'crit:' || run_id);
  end if;
  return jsonb_build_object('run_id', run_id, 'details_inserted', n_det, 'entries_new', n_new, 'entries_skipped', n_skip, 'pendencies', n_pend, 'critical_pendencies', crit);
end $$;

-- A execução falhou ANTES de gravar (erro do motor/validação): avisa o financeiro e registra para o histórico.
create function public.cm_report_calculation_failure(p_org uuid, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare run_id uuid;
begin
  perform private.cm_guard(p_org, 'finance');
  insert into public.commission_calculation_runs (organization_id, reference_period_start, reference_period_end, run_type, status, initiated_by, completed_at, engine_version, error_message)
  values (p_org, private.cm_today(p_org), private.cm_today(p_org), 'reprocess', 'failed', (select auth.uid()), now(), '?', left(coalesce(p_message, 'falha'), 500)) returning id into run_id;
  perform private.cm_notify_finance(p_org, 'calculation_failed', 'Falha de cálculo', 'A execução não pôde ser concluída; veja o histórico de execuções.', 'run', run_id, 'fail:' || run_id);
end $$;

-- ======================================================================= revisão e aprovação
create function public.cm_review_entries(p_org uuid, p_ids uuid[], p_decision text, p_justification text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_eid uuid; e public.commission_entries; n int := 0; seg boolean; initiator uuid; new_status text; ev text; sellers uuid[] := '{}'; sl uuid; my_seller uuid;
begin
  perform private.cm_guard(p_org, 'manager');
  if p_decision not in ('submit', 'approve', 'reject', 'reopen') then raise exception 'decisão inválida' using errcode = '22023'; end if;
  if p_ids is null or array_length(p_ids, 1) is null or array_length(p_ids, 1) > 500 then raise exception 'selecione de 1 a 500 lançamentos' using errcode = '22023'; end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_justification, ''))) < 10 then raise exception 'a rejeição exige justificativa (mín. 10 caracteres)' using errcode = '22023'; end if;
  if p_decision = 'reopen' then perform private.cm_guard(p_org, 'finance'); end if;
  select segregation_of_duties into seg from public.commission_settings where organization_id = p_org;
  my_seller := private.cm_my_seller(p_org);
  perform set_config('cm.entry_update', 'on', true);
  for v_eid in select distinct unnest(p_ids) order by 1 loop
    select * into e from public.commission_entries where commission_entries.id = v_eid and organization_id = p_org for update;
    if not found then raise exception 'lançamento não encontrado' using errcode = 'P0002'; end if;
    if not private.cm_can_see_seller(p_org, e.seller_id) then raise exception 'sem permissão sobre este vendedor' using errcode = '42501'; end if;
    if e.seller_id = my_seller then raise exception 'ninguém aprova a própria comissão' using errcode = '42501'; end if;
    new_status := case p_decision when 'submit' then 'pending_review' when 'approve' then 'approved' when 'reject' then 'rejected' when 'reopen' then 'pending_review' end;
    ev := case p_decision when 'submit' then 'submitted' when 'approve' then 'approved' when 'reject' then 'rejected' when 'reopen' then 'restored' end;
    if (p_decision = 'submit' and e.approval_status <> 'calculated')
       or (p_decision in ('approve', 'reject') and e.approval_status not in ('calculated', 'pending_review'))
       or (p_decision = 'reopen' and e.approval_status <> 'rejected') then
      raise exception 'estado inválido para esta decisão (atual: %)', e.approval_status using errcode = '23514';
    end if;
    if p_decision = 'approve' and seg then
      select r.initiated_by into initiator from public.commission_calculation_details d join public.commission_calculation_runs r on r.id = d.calculation_run_id and r.organization_id = d.organization_id
        where d.id = e.calculation_detail_id;
      if initiator = (select auth.uid()) then raise exception 'segregação de funções: quem calculou não aprova' using errcode = '42501'; end if;
    end if;
    if p_decision = 'approve' and exists (select 1 from public.commission_disputes x where x.commission_entry_id = e.id and x.status in ('open', 'in_review')) then
      raise exception 'há contestação aberta para este lançamento' using errcode = '23514';
    end if;
    update public.commission_entries set approval_status = new_status where commission_entries.id = e.id;
    insert into public.commission_approval_events (organization_id, commission_entry_id, decision, reviewed_by, justification) values (p_org, e.id, ev, (select auth.uid()), private.cm_opt_text(p_justification, 1000, 'Justificativa'));
    n := n + 1;
    sellers := sellers || e.seller_id;
  end loop;
  perform set_config('cm.entry_update', 'off', true);
  if p_decision in ('approve', 'reject') then
    for sl in select distinct unnest(sellers) loop
      perform private.cm_notify_seller_side(p_org, sl, case p_decision when 'approve' then 'commission_approved' else 'commission_rejected' end,
        case p_decision when 'approve' then 'Comissão aprovada' else 'Comissão rejeitada' end, 'Veja o detalhe no seu extrato.', 'seller', sl, 'rev:' || p_decision || ':' || sl || ':' || to_char(now(), 'YYYYMMDDHH24MI'), false);
    end loop;
  end if;
  return jsonb_build_object('changed', n);
end $$;

-- ======================================================================= contestações (nunca alteram valores sozinhas)
create function public.cm_open_dispute(p_org uuid, p_entry uuid, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.commission_entries; v_id uuid; me uuid := private.cm_my_seller(p_org);
begin
  perform private.cm_guard(p_org, 'seller');
  select * into e from public.commission_entries where id = p_entry and organization_id = p_org for update;
  if not found or e.seller_id is distinct from me then raise exception 'lançamento não encontrado' using errcode = 'P0002'; end if;
  if exists (select 1 from public.commission_disputes where commission_entry_id = p_entry and status in ('open', 'in_review')) then raise exception 'já existe contestação aberta para este lançamento' using errcode = '23514'; end if;
  insert into public.commission_disputes (organization_id, seller_id, commission_entry_id, description, previous_approval_status, opened_by)
  values (p_org, me, p_entry, private.cm_req_text(p_description, 10, 2000, 'Descrição'), e.approval_status, (select auth.uid())) returning id into v_id;
  -- só sinaliza (status), nunca altera valor; lançamento já em fechamento fica como está
  if e.approval_status in ('calculated', 'pending_review', 'approved') and not exists (select 1 from public.commission_closing_items i where i.commission_entry_id = e.id and i.voided_at is null) then
    perform set_config('cm.entry_update', 'on', true);
    update public.commission_entries set approval_status = 'contested' where id = e.id;
    perform set_config('cm.entry_update', 'off', true);
    insert into public.commission_approval_events (organization_id, commission_entry_id, decision, reviewed_by, justification) values (p_org, e.id, 'contested', (select auth.uid()), 'Contestação aberta pelo vendedor');
  end if;
  perform private.cm_notify_finance(p_org, 'commission_contested', 'Comissão contestada', 'Um vendedor abriu uma contestação.', 'dispute', v_id, 'disp:' || v_id);
  perform private.cm_notify_seller_side(p_org, me, 'commission_contested', 'Comissão contestada', 'Um vendedor da sua equipe abriu uma contestação.', 'dispute', v_id, 'disp:' || v_id, true);
  return v_id;
end $$;

create function public.cm_respond_dispute(p_org uuid, p_dispute uuid, p_status text, p_resolution text, p_adjustment_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.commission_disputes; e public.commission_entries; restore text;
begin
  perform private.cm_guard(p_org, 'manager');
  if p_status not in ('in_review', 'resolved', 'rejected') then raise exception 'status inválido' using errcode = '22023'; end if;
  select * into d from public.commission_disputes where id = p_dispute and organization_id = p_org for update;
  if not found then raise exception 'contestação não encontrada' using errcode = 'P0002'; end if;
  if not private.cm_can_see_seller(p_org, d.seller_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if d.status in ('resolved', 'rejected') then raise exception 'contestação já encerrada' using errcode = '23514'; end if;
  if p_status = 'in_review' and d.status = 'in_review' then return; end if;
  if p_status in ('resolved', 'rejected') then
    perform private.cm_req_text(p_resolution, 5, 2000, 'Resposta');
    if p_adjustment_entry is not null and not exists (select 1 from public.commission_entries x where x.id = p_adjustment_entry and x.organization_id = p_org and x.seller_id = d.seller_id and x.origin = 'adjustment') then
      raise exception 'o lançamento de ajuste informado não é válido' using errcode = '22023';
    end if;
  end if;
  perform set_config('cm.flag_update', 'on', true);
  update public.commission_disputes set status = p_status, resolution = case when p_status in ('resolved', 'rejected') then btrim(p_resolution) else resolution end,
    resolved_at = case when p_status in ('resolved', 'rejected') then now() end, resolved_by = case when p_status in ('resolved', 'rejected') then (select auth.uid()) end,
    adjustment_entry_id = p_adjustment_entry where id = p_dispute;
  perform set_config('cm.flag_update', 'off', true);
  if p_status in ('resolved', 'rejected') then
    select * into e from public.commission_entries where id = d.commission_entry_id and organization_id = p_org for update;
    if e.approval_status = 'contested' then
      restore := case when p_adjustment_entry is not null then 'adjusted' else coalesce(d.previous_approval_status, 'pending_review') end;
      perform set_config('cm.entry_update', 'on', true);
      update public.commission_entries set approval_status = restore where id = e.id;
      perform set_config('cm.entry_update', 'off', true);
      insert into public.commission_approval_events (organization_id, commission_entry_id, decision, reviewed_by, justification)
      values (p_org, e.id, case when restore = 'adjusted' then 'adjusted' else 'restored' end, (select auth.uid()), 'Contestação encerrada: ' || p_status);
    end if;
    perform private.cm_notify_seller_side(p_org, d.seller_id, 'dispute_resolved', 'Contestação respondida', 'Sua contestação recebeu uma resposta.', 'dispute', d.id, 'disp-res:' || d.id, false);
  end if;
end $$;

-- ======================================================================= ajustes manuais (justificados, aprovados e auditáveis)
create function private.cm_apply_adjustment(p_adj uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.commission_adjustments; v_entry uuid; t text; amt bigint;
begin
  select * into a from public.commission_adjustments where id = p_adj for update;
  amt := case when a.direction = 'credit' then a.amount_cents else -a.amount_cents end;
  t := case when a.adjustment_type = 'exceptional_bonus' then 'bonus' when a.direction = 'credit' then 'adjustment_positive' else 'adjustment_negative' end;
  insert into public.commission_entries (organization_id, seller_id, component_key, idempotency_key, entry_type, amount_cents, approval_status, effective_at, eligible_at, original_entry_id, cause, origin, created_by)
  values (a.organization_id, a.seller_id, 'adj:' || a.id, 'adj:' || a.id, t, amt, 'approved', a.effective_at, a.effective_at, case when t = 'bonus' then null else a.related_entry_id end, 'adjustment', 'adjustment', (select auth.uid()))
  returning id into v_entry;
  insert into public.commission_approval_events (organization_id, commission_entry_id, decision, reviewed_by, justification) values (a.organization_id, v_entry, 'approved', (select auth.uid()), left(a.reason, 1000));
  return v_entry;
end $$;
revoke all on function private.cm_apply_adjustment(uuid) from public, anon, authenticated;

create function public.cm_create_adjustment(p_org uuid, p_seller uuid, p_type text, p_direction text, p_amount bigint, p_reason text, p_reference text, p_related uuid, p_effective date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; need boolean; v_entry uuid; eff date := coalesce(p_effective, private.cm_today(p_org));
begin
  perform private.cm_guard(p_org, 'finance');
  if not exists (select 1 from public.sellers where id = p_seller and organization_id = p_org) then raise exception 'vendedor não encontrado' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'o valor do ajuste deve ser positivo (o tipo define o sinal)' using errcode = '22023'; end if;
  if p_related is not null and not exists (select 1 from public.commission_entries where id = p_related and organization_id = p_org and seller_id = p_seller) then raise exception 'lançamento relacionado inválido' using errcode = '22023'; end if;
  insert into public.commission_adjustments (organization_id, seller_id, adjustment_type, direction, amount_cents, reason, reference, related_entry_id, effective_at, created_by)
  values (p_org, p_seller, p_type, p_direction, p_amount, private.cm_req_text(p_reason, 10, 1000, 'Motivo'), private.cm_opt_text(p_reference, 120, 'Referência'), p_related, eff, (select auth.uid())) returning id into v_id;
  select adjustment_approval_required into need from public.commission_settings where organization_id = p_org;
  if not coalesce(need, true) then
    v_entry := private.cm_apply_adjustment(v_id);
    perform set_config('cm.flag_update', 'on', true);
    update public.commission_adjustments set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), entry_id = v_entry where id = v_id;
    perform set_config('cm.flag_update', 'off', true);
    perform private.cm_notify_seller_side(p_org, p_seller, 'adjustment_posted', 'Ajuste lançado', 'Um ajuste foi lançado no seu extrato.', 'seller', p_seller, 'adj:' || v_id, false);
  else
    perform private.cm_notify_finance(p_org, 'adjustment_pending', 'Ajuste aguardando aprovação', 'Há um ajuste manual pendente.', 'adjustment', v_id, 'adjp:' || v_id);
  end if;
  return v_id;
end $$;

create function public.cm_decide_adjustment(p_org uuid, p_adj uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.commission_adjustments; v_entry uuid; seg boolean;
begin
  perform private.cm_guard(p_org, 'finance');
  if p_decision not in ('approve', 'reject') then raise exception 'decisão inválida' using errcode = '22023'; end if;
  select * into a from public.commission_adjustments where id = p_adj and organization_id = p_org for update;
  if not found then raise exception 'ajuste não encontrado' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'ajuste já decidido' using errcode = '23514'; end if;
  select segregation_of_duties into seg from public.commission_settings where organization_id = p_org;
  if coalesce(seg, false) and a.created_by = (select auth.uid()) then raise exception 'segregação de funções: quem criou o ajuste não o aprova' using errcode = '42501'; end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'informe o motivo da rejeição' using errcode = '22023'; end if;
  perform set_config('cm.flag_update', 'on', true);
  if p_decision = 'approve' then
    v_entry := private.cm_apply_adjustment(p_adj);
    update public.commission_adjustments set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), decision_note = private.cm_opt_text(p_note, 500, 'Observação'), entry_id = v_entry where id = p_adj;
  else
    update public.commission_adjustments set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(), decision_note = private.cm_opt_text(p_note, 500, 'Observação') where id = p_adj;
  end if;
  perform set_config('cm.flag_update', 'off', true);
  if p_decision = 'approve' then
    perform private.cm_notify_seller_side(p_org, a.seller_id, 'adjustment_posted', 'Ajuste lançado', 'Um ajuste foi lançado no seu extrato.', 'seller', a.seller_id, 'adj:' || p_adj, false);
  end if;
end $$;

commit;
