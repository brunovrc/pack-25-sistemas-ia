-- Gestão de Comissões — PLANOS: criação, rascunho, validação, publicação imutável e atribuição a vendedores.
-- Versão publicada é congelada (snapshot + triggers). Mudar uma taxa = nova versão com vigência futura; vendas já apuradas mantêm a versão antiga.

begin;
set local check_function_bodies = off;

-- ======================================================================= condições JSON: gramática fechada (sem código arbitrário)
create function private.cm_valid_condition(c jsonb, depth int default 1) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; e jsonb; f text; o text; v jsonb;
begin
  if depth > 4 or c is null or jsonb_typeof(c) <> 'object' then return false; end if;
  if c ? 'all' or c ? 'any' then
    k := case when c ? 'all' then 'all' else 'any' end;
    if (select count(*) from jsonb_object_keys(c)) <> 1 or jsonb_typeof(c -> k) <> 'array' or jsonb_array_length(c -> k) not between 1 and 30 then return false; end if;
    for e in select * from jsonb_array_elements(c -> k) loop
      if not private.cm_valid_condition(e, depth + 1) then return false; end if;
    end loop;
    return true;
  end if;
  if c ? 'not' then
    return (select count(*) from jsonb_object_keys(c)) = 1 and private.cm_valid_condition(c -> 'not', depth + 1);
  end if;
  if (select count(*) from jsonb_object_keys(c)) <> 3 or not (c ? 'fact' and c ? 'op' and c ? 'value') then return false; end if;
  f := c ->> 'fact'; o := c ->> 'op'; v := c -> 'value';
  if f is null or f not in ('seller.id', 'seller.team_id', 'seller.type', 'product.id', 'product.category_id', 'sale.channel', 'customer.id', 'sale.net_cents', 'item.net_cents', 'item.quantity') then return false; end if;
  if o is null or o not in ('eq', 'ne', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'between') then return false; end if;
  if o in ('gt', 'gte', 'lt', 'lte', 'between') and f not in ('sale.net_cents', 'item.net_cents', 'item.quantity') then return false; end if;
  if o in ('in', 'not_in', 'between') then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) not between 1 and 50 or (o = 'between' and jsonb_array_length(v) <> 2) then return false; end if;
    for e in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(e) not in ('string', 'number') or (jsonb_typeof(e) = 'string' and char_length(e #>> '{}') > 200) then return false; end if;
    end loop;
    return true;
  end if;
  return jsonb_typeof(v) in ('string', 'number') and (jsonb_typeof(v) = 'number' or char_length(v #>> '{}') <= 200);
end $$;

-- Dimensões de especificidade da regra: escopo + igualdades de primeiro nível nas condições.
create function private.cm_rule_dims(p_scope text, p_cond jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare dims text[] := '{}'; leaf jsonb; leaves jsonb; d text;
begin
  if p_scope <> 'organization' then dims := dims || p_scope; end if;
  if p_cond is not null then
    leaves := case when p_cond ? 'all' then p_cond -> 'all' else jsonb_build_array(p_cond) end;
    for leaf in select * from jsonb_array_elements(leaves) loop
      if leaf ? 'fact' and (leaf ->> 'op') in ('eq', 'in') then
        d := case leaf ->> 'fact' when 'seller.id' then 'seller' when 'seller.team_id' then 'team' when 'product.id' then 'product'
                  when 'product.category_id' then 'category' when 'sale.channel' then 'channel' end;
        if d is not null then dims := dims || d; end if;
      end if;
    end loop;
  end if;
  return coalesce((select string_agg(x, '+' order by x) from (select distinct unnest(dims) x) s), '');
end $$;

create function private.cm_precedence_keys(p jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare keys text[] := '{}'; row jsonb; d text; ds text[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20 then raise exception 'ordem de precedência inválida' using errcode = '22023'; end if;
  for row in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(row) <> 'array' then raise exception 'ordem de precedência inválida' using errcode = '22023'; end if;
    ds := '{}';
    for d in select jsonb_array_elements_text(row) loop
      if d not in ('seller', 'team', 'product', 'category', 'channel') then raise exception 'dimensão de precedência inválida: %', d using errcode = '22023'; end if;
      ds := ds || d;
    end loop;
    keys := keys || coalesce((select string_agg(x, '+' order by x) from (select distinct unnest(ds) x) s), '');
  end loop;
  return keys;
end $$;

-- ======================================================================= validação completa de uma versão (devolve a lista de problemas)
create function private.cm_version_issues(p_version uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v public.commission_plan_versions; pl public.commission_plans; issues text[] := '{}'; r record; tr record; prev_to bigint; first_row boolean; n int; keys text[]; fixed boolean; a record; b record;
begin
  select * into v from public.commission_plan_versions where id = p_version;
  if not found then return array['versão não encontrada']; end if;
  select * into pl from public.commission_plans where id = v.plan_id and organization_id = v.organization_id;
  fixed := pl.calculation_basis in ('fixed_per_sale', 'fixed_per_unit');
  keys := private.cm_precedence_keys(v.precedence_json);
  if not exists (select 1 from public.commission_rules where plan_version_id = p_version and enabled) then issues := issues || 'A versão precisa de ao menos uma regra ativa.'; end if;
  for r in select * from public.commission_rules where plan_version_id = p_version and enabled order by name, id loop
    if fixed and r.rule_type <> 'fixed' then issues := issues || format('Regra «%s»: base fixa aceita somente regras de valor fixo.', r.name); end if;
    if not fixed and r.rule_type = 'fixed' then issues := issues || format('Regra «%s»: valor fixo exige base «fixo por venda» ou «fixo por unidade».', r.name); end if;
    if pl.calculation_basis = 'fixed_per_sale' and (r.scope_type in ('product', 'category') or private.cm_rule_dims('organization', r.conditions_json) ~ '(product|category)') then
      issues := issues || format('Regra «%s»: valor fixo por venda não pode ter escopo de produto/categoria.', r.name);
    end if;
    if r.conditions_json is not null and not private.cm_valid_condition(r.conditions_json) then issues := issues || format('Regra «%s»: condição inválida.', r.name); end if;
    if not (private.cm_rule_dims(r.scope_type, r.conditions_json) = any (keys)) then
      issues := issues || format('Regra «%s»: a combinação de escopo «%s» não está na ordem de precedência.', r.name, coalesce(nullif(private.cm_rule_dims(r.scope_type, r.conditions_json), ''), 'global'));
    end if;
    if r.rule_type = 'tiered' then
      n := 0; prev_to := null; first_row := true;
      for tr in select * from public.commission_tiers where rule_id = r.id order by tier_order loop
        n := n + 1;
        if tr.calculation_mode <> r.tier_mode then issues := issues || format('Regra «%s»: modo da faixa %s difere do modo da regra.', r.name, tr.tier_order); end if;
        if first_row then
          if tr.threshold_from_cents <> 0 then issues := issues || format('Regra «%s»: a primeira faixa deve começar em R$ 0,00.', r.name); end if;
          first_row := false;
        else
          if prev_to is null then issues := issues || format('Regra «%s»: somente a última faixa pode ficar sem teto.', r.name);
          elsif tr.threshold_from_cents < prev_to then issues := issues || format('Regra «%s»: faixa %s se sobrepõe à anterior.', r.name, tr.tier_order);
          elsif tr.threshold_from_cents > prev_to then issues := issues || format('Regra «%s»: lacuna antes da faixa %s.', r.name, tr.tier_order);
          end if;
        end if;
        prev_to := tr.threshold_to_cents;
      end loop;
      if n = 0 then issues := issues || format('Regra «%s»: informe ao menos uma faixa.', r.name);
      elsif prev_to is not null then issues := issues || format('Regra «%s»: a última faixa deve ficar sem teto.', r.name); end if;
    end if;
  end loop;
  -- conflito estático: exclusivas, mesma especificidade, mesma prioridade, mesmo alvo, sem condição, vigências que se cruzam
  for a in select * from public.commission_rules where plan_version_id = p_version and enabled and stack_behavior = 'exclusive' and conditions_json is null loop
    for b in select * from public.commission_rules x where x.plan_version_id = p_version and x.enabled and x.stack_behavior = 'exclusive' and x.conditions_json is null and x.id > a.id loop
      if private.cm_rule_dims(a.scope_type, null) = private.cm_rule_dims(b.scope_type, null) and a.priority = b.priority and coalesce(a.scope_reference, '') = coalesce(b.scope_reference, '')
         and coalesce(a.valid_from, date '0001-01-01') <= coalesce(b.valid_until, date '9999-12-31') and coalesce(b.valid_from, date '0001-01-01') <= coalesce(a.valid_until, date '9999-12-31') then
        issues := issues || format('Regras «%s» e «%s» conflitam (mesma especificidade e prioridade).', a.name, b.name);
      end if;
    end loop;
  end loop;
  return issues;
end $$;
revoke all on function private.cm_version_issues(uuid) from public, anon, authenticated;

create function public.cm_validate_plan_version(p_org uuid, p_version uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'manager');
  if not exists (select 1 from public.commission_plan_versions where id = p_version and organization_id = p_org) then raise exception 'versão não encontrada' using errcode = 'P0002'; end if;
  return private.cm_version_issues(p_version);
end $$;

-- ======================================================================= plano
create function private.cm_plan_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.commission_plan_versions v where v.plan_id = old.id and v.status = 'published')
     and (new.calculation_basis <> old.calculation_basis or new.eligibility_event <> old.eligibility_event or new.returns_policy <> old.returns_policy) then
    raise exception 'base, elegibilidade e política de devolução não mudam depois da primeira publicação (crie outro plano)' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cm_plan_guard() from public, anon, authenticated;
create trigger plan_guard before update on public.commission_plans for each row execute function private.cm_plan_guard();

create function public.cm_create_plan(p_org uuid, p_name text, p_description text, p_basis text, p_eligibility text, p_type text, p_returns text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_plan uuid; v_ver uuid;
begin
  perform private.cm_guard(p_org, 'admin');
  insert into public.commission_plans (organization_id, name, description, calculation_basis, eligibility_event, plan_type, returns_policy, created_by)
  values (p_org, private.cm_req_text(p_name, 2, 100, 'Nome do plano'), private.cm_opt_text(p_description, 500, 'Descrição'), p_basis, p_eligibility, coalesce(p_type, 'individual'), coalesce(p_returns, 'proportional'), (select auth.uid()))
  returning id into v_plan;
  insert into public.commission_plan_versions (organization_id, plan_id, version_number) values (p_org, v_plan, 1) returning id into v_ver;
  return jsonb_build_object('plan_id', v_plan, 'version_id', v_ver);
end $$;

create function public.cm_update_plan(p_org uuid, p_plan uuid, p_name text, p_description text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'admin');
  if p_status not in ('active', 'archived') then raise exception 'status inválido' using errcode = '22023'; end if;
  update public.commission_plans p set name = private.cm_req_text(p_name, 2, 100, 'Nome do plano'), description = private.cm_opt_text(p_description, 500, 'Descrição'), status = p_status
  where p.id = p_plan and p.organization_id = p_org;
  if not found then raise exception 'plano não encontrado' using errcode = 'P0002'; end if;
end $$;

-- Regrava o RASCUNHO inteiro (precedência + regras + faixas) de uma vez. Publicada, a versão não aceita mais edição.
create function public.cm_save_plan_draft(p_org uuid, p_version uuid, p_config jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; b jsonb; v_rule uuid; prec jsonb; nrules int := 0; st text;
begin
  perform private.cm_guard(p_org, 'admin');
  select status into st from public.commission_plan_versions where id = p_version and organization_id = p_org for update;
  if not found then raise exception 'versão não encontrada' using errcode = 'P0002'; end if;
  if st <> 'draft' then raise exception 'versão publicada é imutável: crie uma nova versão' using errcode = '23514'; end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'configuração inválida' using errcode = '22023'; end if;
  prec := coalesce(p_config -> 'precedence', '[["product","seller"],["category","seller"],["channel","product"],["product"],["category"],["seller"],["channel"],["team"],[]]'::jsonb);
  perform private.cm_precedence_keys(prec);
  update public.commission_plan_versions set precedence_json = prec where id = p_version;
  delete from public.commission_tiers where plan_version_id = p_version;
  delete from public.commission_rules where plan_version_id = p_version;
  if jsonb_typeof(coalesce(p_config -> 'rules', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_config -> 'rules', '[]'::jsonb)) > 60 then raise exception 'lista de regras inválida (máximo 60)' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_config -> 'rules', '[]'::jsonb)) loop
    nrules := nrules + 1;
    if r ? 'conditions' and r -> 'conditions' <> 'null'::jsonb and not private.cm_valid_condition(r -> 'conditions') then raise exception 'condição inválida na regra %', nrules using errcode = '22023'; end if;
    insert into public.commission_rules (organization_id, plan_version_id, name, rule_type, scope_type, scope_reference, conditions_json, rate_decimal, fixed_amount_cents,
        tier_mode, tier_period, tier_scope, priority, stack_behavior, entry_kind, enabled, valid_from, valid_until)
    values (p_org, p_version, private.cm_req_text(r ->> 'name', 2, 100, 'Nome da regra'), r ->> 'rule_type', coalesce(r ->> 'scope_type', 'organization'), nullif(r ->> 'scope_reference', ''),
        case when r -> 'conditions' is null or r -> 'conditions' = 'null'::jsonb then null else r -> 'conditions' end,
        nullif(r ->> 'rate', '')::numeric, nullif(r ->> 'fixed_amount_cents', '')::bigint,
        case when r ->> 'rule_type' = 'tiered' then r #>> '{tier,mode}' end, case when r ->> 'rule_type' = 'tiered' then r #>> '{tier,period}' end, case when r ->> 'rule_type' = 'tiered' then r #>> '{tier,scope}' end,
        coalesce((r ->> 'priority')::int, 0), coalesce(r ->> 'stack_behavior', 'exclusive'), coalesce(r ->> 'entry_kind', 'commission'), coalesce((r ->> 'enabled')::boolean, true),
        nullif(r ->> 'valid_from', '')::date, nullif(r ->> 'valid_until', '')::date)
    returning id into v_rule;
    if r ->> 'rule_type' = 'tiered' then
      if jsonb_typeof(r #> '{tier,bands}') <> 'array' or jsonb_array_length(r #> '{tier,bands}') not between 1 and 20 then raise exception 'faixas inválidas na regra %', nrules using errcode = '22023'; end if;
      for b in select * from jsonb_array_elements(r #> '{tier,bands}') loop
        insert into public.commission_tiers (organization_id, plan_version_id, rule_id, tier_order, threshold_from_cents, threshold_to_cents, rate_decimal, calculation_mode)
        values (p_org, p_version, v_rule, (b ->> 'order')::int, (b ->> 'from_cents')::bigint, nullif(b ->> 'to_cents', '')::bigint, (b ->> 'rate')::numeric, r #>> '{tier,mode}');
      end loop;
    end if;
  end loop;
end $$;

-- Publica: valida, congela (snapshot) e encerra a vigência da versão anterior.
create function public.cm_publish_plan_version(p_org uuid, p_version uuid, p_valid_from date) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.commission_plan_versions; issues text[]; prev public.commission_plan_versions; snap jsonb; today date := private.cm_today(p_org);
begin
  perform private.cm_guard(p_org, 'admin');
  select * into v from public.commission_plan_versions where id = p_version and organization_id = p_org for update;
  if not found then raise exception 'versão não encontrada' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'versão já publicada' using errcode = '23514'; end if;
  if p_valid_from is null then raise exception 'informe o início da vigência' using errcode = '22023'; end if;
  if (select status from public.commission_plans where id = v.plan_id) <> 'active' then raise exception 'plano arquivado' using errcode = '23514'; end if;
  issues := private.cm_version_issues(p_version);
  if array_length(issues, 1) > 0 then raise exception 'plano inválido: %', issues[1] using errcode = '23514'; end if;
  select * into prev from public.commission_plan_versions where plan_id = v.plan_id and status = 'published' order by version_number desc limit 1;
  if found and p_valid_from <= prev.valid_from then raise exception 'a vigência deve começar depois da versão anterior (%)', prev.valid_from using errcode = '23514'; end if;
  if p_valid_from < today and exists (select 1 from public.commission_entries e join public.commission_plan_versions pv on pv.id = e.plan_version_id and pv.organization_id = e.organization_id
      where pv.plan_id = v.plan_id and e.organization_id = p_org) then
    raise exception 'vigência retroativa não é permitida para plano que já gerou comissões' using errcode = '23514';
  end if;
  snap := jsonb_build_object(
    'precedence', v.precedence_json,
    'rules', coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'rule_type', r.rule_type, 'scope_type', r.scope_type, 'scope_reference', r.scope_reference, 'conditions', r.conditions_json,
        'rate', r.rate_decimal, 'fixed_amount_cents', r.fixed_amount_cents, 'priority', r.priority, 'stack_behavior', r.stack_behavior, 'entry_kind', r.entry_kind, 'enabled', r.enabled,
        'valid_from', r.valid_from, 'valid_until', r.valid_until,
        'tier', case when r.rule_type = 'tiered' then jsonb_build_object('mode', r.tier_mode, 'period', r.tier_period, 'scope', r.tier_scope,
            'bands', (select jsonb_agg(jsonb_build_object('order', t.tier_order, 'from_cents', t.threshold_from_cents, 'to_cents', t.threshold_to_cents, 'rate', t.rate_decimal) order by t.tier_order)
                      from public.commission_tiers t where t.rule_id = r.id)) end) order by r.name, r.id)
      from public.commission_rules r where r.plan_version_id = p_version), '[]'::jsonb));
  perform set_config('cm.version_update', 'on', true);
  if prev.id is not null then update public.commission_plan_versions set valid_until = p_valid_from - 1 where id = prev.id and (valid_until is null or valid_until >= p_valid_from); end if;
  update public.commission_plan_versions set status = 'published', configuration_snapshot_json = snap, valid_from = p_valid_from, published_at = now(), published_by = (select auth.uid()) where id = p_version;
  perform set_config('cm.version_update', 'off', true);
end $$;

-- Nova versão = cópia editável da última publicada (a anterior continua valendo até a nova entrar em vigor).
create function public.cm_new_plan_version(p_org uuid, p_plan uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare src public.commission_plan_versions; v_new uuid; r record; v_rule uuid;
begin
  perform private.cm_guard(p_org, 'admin');
  perform 1 from public.commission_plans where id = p_plan and organization_id = p_org for update;
  if not found then raise exception 'plano não encontrado' using errcode = 'P0002'; end if;
  select id into v_new from public.commission_plan_versions where plan_id = p_plan and status = 'draft';
  if found then return v_new; end if;
  select * into src from public.commission_plan_versions where plan_id = p_plan order by version_number desc limit 1;
  insert into public.commission_plan_versions (organization_id, plan_id, version_number, precedence_json)
  values (p_org, p_plan, src.version_number + 1, src.precedence_json) returning id into v_new;
  for r in select * from public.commission_rules where plan_version_id = src.id order by name, id loop
    insert into public.commission_rules (organization_id, plan_version_id, name, rule_type, scope_type, scope_reference, conditions_json, rate_decimal, fixed_amount_cents, tier_mode, tier_period, tier_scope,
        priority, stack_behavior, entry_kind, enabled, valid_from, valid_until)
    values (p_org, v_new, r.name, r.rule_type, r.scope_type, r.scope_reference, r.conditions_json, r.rate_decimal, r.fixed_amount_cents, r.tier_mode, r.tier_period, r.tier_scope,
        r.priority, r.stack_behavior, r.entry_kind, r.enabled, r.valid_from, r.valid_until) returning id into v_rule;
    insert into public.commission_tiers (organization_id, plan_version_id, rule_id, tier_order, threshold_from_cents, threshold_to_cents, rate_decimal, calculation_mode)
    select p_org, v_new, v_rule, t.tier_order, t.threshold_from_cents, t.threshold_to_cents, t.rate_decimal, t.calculation_mode from public.commission_tiers t where t.rule_id = r.id;
  end loop;
  return v_new;
end $$;

-- Atribuição de plano ao vendedor: UMA por data. A nova atribuição encerra a anterior no dia anterior (nunca reescreve vendas já apuradas).
create function public.cm_assign_plan(p_org uuid, p_seller uuid, p_plan uuid, p_valid_from date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; cur record;
begin
  perform private.cm_guard(p_org, 'admin');
  if p_valid_from is null then raise exception 'informe o início da vigência' using errcode = '22023'; end if;
  if not exists (select 1 from public.sellers where id = p_seller and organization_id = p_org) then raise exception 'vendedor não encontrado' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.commission_plans where id = p_plan and organization_id = p_org and status = 'active') then raise exception 'plano não encontrado ou arquivado' using errcode = 'P0002'; end if;
  if exists (select 1 from public.seller_plan_assignments a where a.seller_id = p_seller and a.valid_from >= p_valid_from) then
    raise exception 'já existe atribuição que começa nesta data ou depois: encerre-a antes' using errcode = '23514';
  end if;
  select * into cur from public.seller_plan_assignments a where a.seller_id = p_seller and (a.valid_until is null or a.valid_until >= p_valid_from) order by a.valid_from desc limit 1;
  if found then update public.seller_plan_assignments set valid_until = p_valid_from - 1 where id = cur.id; end if;
  insert into public.seller_plan_assignments (organization_id, seller_id, plan_id, valid_from, assigned_by) values (p_org, p_seller, p_plan, p_valid_from, (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

commit;
