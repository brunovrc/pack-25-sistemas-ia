-- Gestão de Comissões — VENDAS, DEVOLUÇÕES, CANCELAMENTOS E RECEBIMENTOS.
-- Rascunho é editável; confirmar FIXA a versão do plano de cada participante (mudança futura de plano não toca vendas apuradas).
-- Depois de confirmada a venda é imutável: só cancelamento/devolução (eventos) e recebimentos (estornáveis).

begin;
set local check_function_bodies = off;

-- Versão do plano vigente do vendedor numa data: atribuição vigente → plano ATIVO → última versão publicada em vigor.
create function private.cm_plan_version_at(p_org uuid, p_seller uuid, p_date date) returns uuid
language sql stable security definer set search_path = '' as $$
  select v.id from public.seller_plan_assignments a
  join public.commission_plans p on p.id = a.plan_id and p.organization_id = a.organization_id and p.status = 'active'
  join public.commission_plan_versions v on v.plan_id = p.id and v.organization_id = p.organization_id and v.status = 'published'
    and v.valid_from <= p_date and (v.valid_until is null or v.valid_until >= p_date)
  where a.organization_id = p_org and a.seller_id = p_seller and a.valid_from <= p_date and (a.valid_until is null or a.valid_until >= p_date)
  order by v.version_number desc limit 1;
$$;
revoke all on function private.cm_plan_version_at(uuid, uuid, date) from public, anon, authenticated;

-- ======================================================================= rascunho
create function public.cm_save_sale_draft(p_org uuid, p_id uuid, p_header jsonb, p_items jsonb, p_participants jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; it jsonb; pt jsonb; pos int := 0; qty numeric; unit bigint; disc bigint; gross_item bigint; net_item bigint; comm_item bigint;
  tot_gross bigint := 0; tot_disc bigint := 0; tot_comm bigint := 0; st text; seller_id uuid; seen uuid[] := '{}'; sm text; sdate date;
begin
  perform private.cm_guard(p_org, 'manager');
  if jsonb_typeof(p_header) <> 'object' or jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_participants) <> 'array' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) not between 1 and 500 then raise exception 'a venda deve ter de 1 a 500 itens' using errcode = '22023'; end if;
  if jsonb_array_length(p_participants) not between 1 and 20 then raise exception 'a venda deve ter de 1 a 20 participantes' using errcode = '22023'; end if;
  sm := coalesce(p_header ->> 'split_model', 'pool');
  if sm not in ('pool', 'independent') then raise exception 'modelo de rateio inválido' using errcode = '22023'; end if;
  sdate := (p_header ->> 'sale_date')::date;
  if sdate is null or sdate > private.cm_today(p_org) + 1 then raise exception 'data da venda inválida' using errcode = '22023'; end if;
  if v_id is not null then
    select status into st from public.sales where id = v_id and organization_id = p_org for update;
    if not found then raise exception 'venda não encontrada' using errcode = 'P0002'; end if;
    if st <> 'draft' then raise exception 'venda confirmada não pode ser editada (use cancelamento/devolução)' using errcode = '23514'; end if;
    if not private.cm_can_see_sale(p_org, v_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
    delete from public.sale_participants where sale_id = v_id;
    delete from public.sale_items where sale_id = v_id;
  else
    insert into public.sales (organization_id, customer_id, sale_number, external_reference, sale_date, channel, status, split_model, gross_amount_cents, net_amount_cents, commissionable_amount_cents, created_by)
    values (p_org, nullif(p_header ->> 'customer_id', '')::uuid, private.cm_req_text(p_header ->> 'sale_number', 1, 40, 'Número da venda'), private.cm_opt_text(p_header ->> 'external_reference', 80, 'Referência externa'),
            sdate, private.cm_opt_text(p_header ->> 'channel', 40, 'Canal'), 'draft', sm, 0, 0, 0, (select auth.uid()))
    returning id into v_id;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    pos := pos + 1;
    qty := (it ->> 'quantity')::numeric; unit := (it ->> 'unit_price_cents')::bigint; disc := coalesce((it ->> 'discount_cents')::bigint, 0);
    if qty is null or qty <= 0 or unit is null or unit < 0 or disc < 0 then raise exception 'item % inválido', pos using errcode = '22023'; end if;
    gross_item := round(qty * unit)::bigint;
    net_item := gross_item - disc;
    if net_item < 0 then raise exception 'item %: desconto maior que o valor', pos using errcode = '22023'; end if;
    comm_item := coalesce((it ->> 'commissionable_amount_cents')::bigint, net_item);
    if comm_item < 0 or comm_item > net_item then raise exception 'item %: base comissionável deve estar entre 0 e o valor líquido', pos using errcode = '22023'; end if;
    insert into public.sale_items (organization_id, sale_id, position, product_id, description, quantity_decimal, unit_price_cents, discount_cents, net_amount_cents, commissionable_amount_cents, cost_cents)
    values (p_org, v_id, pos, nullif(it ->> 'product_id', '')::uuid, private.cm_opt_text(it ->> 'description', 200, 'Descrição do item'), qty, unit, disc, net_item, comm_item, nullif(it ->> 'cost_cents', '')::bigint);
    tot_gross := tot_gross + gross_item; tot_disc := tot_disc + disc; tot_comm := tot_comm + comm_item;
  end loop;
  for pt in select * from jsonb_array_elements(p_participants) loop
    seller_id := (pt ->> 'seller_id')::uuid;
    if seller_id = any (seen) then raise exception 'vendedor repetido na venda' using errcode = '22023'; end if;
    seen := seen || seller_id;
    perform private.cm_assert_manage_seller(p_org, seller_id);
    if not exists (select 1 from public.sellers where id = seller_id and organization_id = p_org and status = 'active') then raise exception 'vendedor inativo ou inexistente' using errcode = '22023'; end if;
    insert into public.sale_participants (organization_id, sale_id, seller_id, participation_type, allocation_percentage)
    values (p_org, v_id, seller_id, coalesce(pt ->> 'participation_type', 'primary'), (pt ->> 'allocation_percentage')::numeric);
  end loop;
  update public.sales set customer_id = nullif(p_header ->> 'customer_id', '')::uuid, sale_number = private.cm_req_text(p_header ->> 'sale_number', 1, 40, 'Número da venda'),
    external_reference = private.cm_opt_text(p_header ->> 'external_reference', 80, 'Referência externa'), sale_date = sdate, channel = private.cm_opt_text(p_header ->> 'channel', 40, 'Canal'),
    split_model = sm, gross_amount_cents = tot_gross, discount_amount_cents = tot_disc, net_amount_cents = tot_gross - tot_disc, commissionable_amount_cents = tot_comm
  where id = v_id and organization_id = p_org;
  return v_id;
end $$;

create function public.cm_discard_sale_draft(p_org uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'manager');
  if not exists (select 1 from public.sales where id = p_id and organization_id = p_org and status = 'draft') then raise exception 'rascunho não encontrado' using errcode = 'P0002'; end if;
  if not private.cm_can_see_sale(p_org, p_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  delete from public.sale_participants where sale_id = p_id;
  delete from public.sale_items where sale_id = p_id;
  delete from public.sales where id = p_id and organization_id = p_org and status = 'draft';
end $$;

-- ======================================================================= confirmação (fixa o plano)
create function public.cm_confirm_sale(p_org uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sales; n_items int; n_primary int; sum_pct numeric; p record; v_ver uuid; first_new boolean;
begin
  perform private.cm_guard(p_org, 'manager');
  select * into s from public.sales where id = p_id and organization_id = p_org for update;
  if not found then raise exception 'venda não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'draft' then raise exception 'a venda já foi confirmada' using errcode = '23514'; end if;
  if not private.cm_can_see_sale(p_org, p_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  select count(*) into n_items from public.sale_items where sale_id = p_id;
  if n_items = 0 then raise exception 'a venda não tem itens' using errcode = '23514'; end if;
  if s.gross_amount_cents <> (select coalesce(sum(round(quantity_decimal * unit_price_cents)), 0) from public.sale_items where sale_id = p_id)
     or s.commissionable_amount_cents <> (select coalesce(sum(commissionable_amount_cents), 0) from public.sale_items where sale_id = p_id)
     or s.net_amount_cents <> (select coalesce(sum(net_amount_cents), 0) from public.sale_items where sale_id = p_id) then
    raise exception 'os totais da venda não conferem com os itens' using errcode = '23514';
  end if;
  select count(*) filter (where participation_type = 'primary'), coalesce(sum(allocation_percentage), 0) into n_primary, sum_pct from public.sale_participants where sale_id = p_id;
  if n_primary <> 1 then raise exception 'a venda precisa de exatamente um vendedor principal' using errcode = '23514'; end if;
  if s.split_model = 'pool' and sum_pct <> 100 then raise exception 'no rateio em pool as participações devem somar exatamente 100%% (soma atual: %)', sum_pct using errcode = '23514'; end if;
  if s.customer_id is not null and exists (select 1 from public.customers where id = s.customer_id and archived_at is not null) then raise exception 'cliente arquivado' using errcode = '23514'; end if;
  perform set_config('cm.sale_update', 'on', true);
  for p in select sp.*, sl.name, sl.starts_at, sl.ends_at, sl.status as sstatus from public.sale_participants sp join public.sellers sl on sl.id = sp.seller_id and sl.organization_id = sp.organization_id where sp.sale_id = p_id loop
    if p.sstatus <> 'active' or p.starts_at > s.sale_date or (p.ends_at is not null and p.ends_at < s.sale_date) then
      raise exception 'o vendedor «%» não estava ativo na data da venda', p.name using errcode = '23514';
    end if;
    v_ver := private.cm_plan_version_at(p_org, p.seller_id, s.sale_date);
    -- quem gera comissão (principal no pool; todos nos independentes) precisa de plano vigente; participantes secundários do pool só dividem o resultado
    if v_ver is null and (s.split_model = 'independent' or p.participation_type = 'primary') then
      raise exception 'o vendedor «%» não tem plano de comissão vigente em %', p.name, to_char(s.sale_date, 'DD/MM/YYYY') using errcode = '23514';
    end if;
    update public.sale_participants set plan_version_id = v_ver,
      allocated_amount_cents = round(s.commissionable_amount_cents * allocation_percentage / 100)::bigint where id = p.id;
  end loop;
  first_new := s.customer_id is not null and not exists (select 1 from public.sales o where o.organization_id = p_org and o.customer_id = s.customer_id and o.id <> s.id
    and o.status in ('confirmed', 'partially_returned', 'totally_returned') and o.sale_date <= s.sale_date);
  update public.sales set status = 'confirmed', confirmed_at = now(), confirmed_on = s.sale_date, new_customer = coalesce(first_new, false) where id = p_id;
  insert into public.sale_events (organization_id, sale_id, event_type, event_amount_cents, effective_at, created_by)
  values (p_org, p_id, 'confirmed', s.commissionable_amount_cents, s.sale_date, (select auth.uid()));
  perform set_config('cm.sale_update', 'off', true);
end $$;

-- ======================================================================= cancelamento e devolução (eventos; comissões se ajustam no próximo cálculo)
create function private.cm_sale_remaining(p_sale uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select s.commissionable_amount_cents - coalesce((select sum(e.event_amount_cents) from public.sale_events e where e.sale_id = s.id and e.event_type in ('partially_returned', 'totally_returned')), 0)
  from public.sales s where s.id = p_sale;
$$;
revoke all on function private.cm_sale_remaining(uuid) from public, anon, authenticated;

create function public.cm_cancel_sale(p_org uuid, p_id uuid, p_reason text, p_date date, p_event_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sales; d date;
begin
  perform private.cm_guard(p_org, 'manager');
  select * into s from public.sales where id = p_id and organization_id = p_org for update;
  if not found then raise exception 'venda não encontrada' using errcode = 'P0002'; end if;
  if not private.cm_can_see_sale(p_org, p_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if s.status = 'cancelled' then return; end if; -- idempotente
  if s.status not in ('confirmed', 'partially_returned') then raise exception 'só vendas confirmadas podem ser canceladas' using errcode = '23514'; end if;
  d := coalesce(p_date, private.cm_today(p_org));
  if d < s.sale_date then raise exception 'cancelamento anterior à data da venda' using errcode = '22023'; end if;
  perform set_config('cm.sale_update', 'on', true);
  update public.sales set status = 'cancelled', cancelled_at = now(), cancelled_on = d, cancel_reason = private.cm_req_text(p_reason, 5, 500, 'Motivo') where id = p_id;
  perform set_config('cm.sale_update', 'off', true);
  insert into public.sale_events (organization_id, sale_id, event_type, event_amount_cents, external_event_id, effective_at, metadata_json, created_by)
  values (p_org, p_id, 'cancelled', private.cm_sale_remaining(p_id), nullif(p_event_id, ''), d, jsonb_build_object('reason', private.cm_req_text(p_reason, 5, 500, 'Motivo')), (select auth.uid()));
end $$;

-- p_items: {"<item_id>": centavos}. Soma = valor devolvido; nenhum item passa do seu próprio saldo.
create function public.cm_register_return(p_org uuid, p_sale uuid, p_amount bigint, p_date date, p_items jsonb, p_reason text, p_event_id text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.sales; k text; v bigint; total bigint := 0; rem bigint; existing uuid; d date; item_rem bigint; v_id uuid;
begin
  perform private.cm_guard(p_org, 'manager');
  select * into s from public.sales where id = p_sale and organization_id = p_org for update;
  if not found then raise exception 'venda não encontrada' using errcode = 'P0002'; end if;
  if not private.cm_can_see_sale(p_org, p_sale) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_event_id is not null then
    select id into existing from public.sale_events where organization_id = p_org and sale_id = p_sale and external_event_id = p_event_id;
    if found then return existing; end if; -- idempotente
  end if;
  if s.status not in ('confirmed', 'partially_returned') then raise exception 'só vendas confirmadas aceitam devolução' using errcode = '23514'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor devolvido deve ser positivo' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'object' then raise exception 'informe o valor devolvido por item' using errcode = '22023'; end if;
  d := coalesce(p_date, private.cm_today(p_org));
  if d < s.sale_date or d > private.cm_today(p_org) then raise exception 'data da devolução inválida' using errcode = '22023'; end if;
  rem := private.cm_sale_remaining(p_sale);
  if p_amount > rem then raise exception 'a devolução excede o saldo comissionável da venda' using errcode = '23514'; end if;
  for k, v in select key, value::bigint from jsonb_each_text(p_items) loop
    if v < 0 then raise exception 'valor negativo em item' using errcode = '22023'; end if;
    if v = 0 then continue; end if;
    select i.commissionable_amount_cents - coalesce((select sum((e.metadata_json -> 'itemAmounts' ->> k)::bigint) from public.sale_events e
        where e.sale_id = p_sale and e.event_type in ('partially_returned', 'totally_returned') and e.metadata_json -> 'itemAmounts' ? k), 0)
      into item_rem from public.sale_items i where i.id = k::uuid and i.sale_id = p_sale and i.organization_id = p_org;
    if not found then raise exception 'item não pertence à venda' using errcode = '22023'; end if;
    if v > item_rem then raise exception 'a devolução excede o saldo do item' using errcode = '23514'; end if;
    total := total + v;
  end loop;
  if total <> p_amount then raise exception 'os itens devolvidos devem somar o valor da devolução' using errcode = '22023'; end if;
  insert into public.sale_events (organization_id, sale_id, event_type, event_amount_cents, external_event_id, effective_at, metadata_json, created_by)
  values (p_org, p_sale, case when p_amount = rem then 'totally_returned' else 'partially_returned' end, p_amount, nullif(p_event_id, ''), d,
          jsonb_build_object('itemAmounts', p_items, 'reason', private.cm_opt_text(p_reason, 300, 'Motivo')), (select auth.uid()))
  returning id into v_id;
  perform set_config('cm.sale_update', 'on', true);
  update public.sales set status = case when p_amount = rem then 'totally_returned' else 'partially_returned' end,
    cancelled_at = case when p_amount = rem then now() end, cancelled_on = case when p_amount = rem then d end where id = p_sale;
  perform set_config('cm.sale_update', 'off', true);
  return v_id;
end $$;

-- ======================================================================= recebimentos de clientes (não é conciliação bancária)
create function public.cm_register_receipt(p_org uuid, p_sale uuid, p_amount bigint, p_date date, p_reference text, p_notes text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.sales; existing uuid; d date; due bigint; got bigint; v_id uuid; allow boolean;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into s from public.sales where id = p_sale and organization_id = p_org for update;
  if not found then raise exception 'venda não encontrada' using errcode = 'P0002'; end if;
  if p_reference is not null and btrim(p_reference) <> '' then
    select id into existing from public.customer_receipts where organization_id = p_org and sale_id = p_sale and external_reference = btrim(p_reference) and status = 'confirmed';
    if found then return existing; end if; -- idempotente por referência
  end if;
  if s.status not in ('confirmed', 'partially_returned') then raise exception 'recebimento só em venda confirmada' using errcode = '23514'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor recebido deve ser positivo' using errcode = '22023'; end if;
  d := coalesce(p_date, private.cm_today(p_org));
  if d > private.cm_today(p_org) then raise exception 'data de recebimento no futuro' using errcode = '22023'; end if;
  select coalesce(sum(amount_cents), 0) into got from public.customer_receipts where sale_id = p_sale and status = 'confirmed';
  -- devido = líquido × fração ainda não devolvida
  due := case when s.commissionable_amount_cents = 0 then 0 else round(s.net_amount_cents * private.cm_sale_remaining(p_sale)::numeric / s.commissionable_amount_cents)::bigint end;
  select allow_receipt_over_sale into allow from public.commission_settings where organization_id = p_org;
  if got + p_amount > due and not coalesce(allow, false) then
    raise exception 'o total recebido (%) passaria do valor devido da venda (%)', got + p_amount, due using errcode = '23514';
  end if;
  insert into public.customer_receipts (organization_id, sale_id, external_reference, amount_cents, received_at, notes, created_by)
  values (p_org, p_sale, private.cm_opt_text(p_reference, 80, 'Referência'), p_amount, d, private.cm_opt_text(p_notes, 300, 'Observações'), (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

create function public.cm_reverse_receipt(p_org uuid, p_receipt uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'finance');
  perform set_config('cm.receipt_update', 'on', true);
  update public.customer_receipts set status = 'reversed', reversed_at = now(), reversed_by = (select auth.uid()), reversal_reason = private.cm_req_text(p_reason, 5, 300, 'Motivo')
  where id = p_receipt and organization_id = p_org and status = 'confirmed';
  perform set_config('cm.receipt_update', 'off', true);
  if not found then raise exception 'recebimento não encontrado ou já estornado' using errcode = 'P0002'; end if;
end $$;

commit;
