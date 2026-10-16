-- Gestão de Comissões — SEGURANÇA: isolamento entre empresas em TODAS as tabelas, anon sem acesso, 2º fator no banco, privilégios de função,
-- referências cruzadas entre empresas, identificadores adulterados, histórico de equipe e o Caso 15 (empresa A R$ 10.000 × empresa B R$ 20.000).

\set as_oa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal2","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_oa1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal1","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_s1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a4","aal":"aal1","email":"s1@t.invalid"}'', true); set local role authenticated;'
\set as_s2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a5","aal":"aal1","email":"s2@t.invalid"}'', true); set local role authenticated;'
\set as_ob 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b0","aal":"aal2","email":"ob@t.invalid"}'', true); set local role authenticated;'
\set as_anon 'select set_config(''request.jwt.claims'', ''{}'', true); set local role anon;'

begin;

create function test.errmsg(q text) returns text language plpgsql as $$ begin execute q; return null; exception when others then return sqlerrm; end $$;
create function test.t(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
create function test.sql(q text) returns void language plpgsql security definer set search_path = '' as $$ begin execute q; end $$;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000a0', 'oa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a4', 's1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a5', 's2@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000b0', 'ob@t.invalid');

-- monta, pelos caminhos oficiais, uma empresa com 1 venda e a comissão aprovada de 5% (valor da venda em centavos informado)
create function test.build(p_slug text, p_sale_cents bigint, p_with_sellers boolean) returns void language plpgsql as $$
declare org uuid; r jsonb; ver uuid; s1 uuid; s2 uuid; sale uuid; item uuid; rule uuid; k text; ent jsonb; tm uuid;
begin
  org := public.create_organization('Empresa ' || p_slug, p_slug);
  perform set_config('t.org_' || p_slug, org::text, true);
  if p_with_sellers then
    insert into public.organization_members (organization_id, user_id, role) values (org, 'ffffffff-0000-4000-8000-0000000000a4', 'member'), (org, 'ffffffff-0000-4000-8000-0000000000a5', 'member');
  end if;
  tm := public.cm_save_team(org, null, 'Equipe 1', null, null, true);
  perform set_config('t.team_' || p_slug, tm::text, true);
  s1 := public.cm_save_seller(org, null, 'Vendedora Um', 'V1', 'internal', tm, case when p_with_sellers then 'ffffffff-0000-4000-8000-0000000000a4'::uuid end, date '2026-01-01', null, null, 'active', null);
  s2 := public.cm_save_seller(org, null, 'Vendedor Dois', 'V2', 'internal', tm, case when p_with_sellers then 'ffffffff-0000-4000-8000-0000000000a5'::uuid end, date '2026-01-01', null, null, 'active', null);
  perform set_config('t.s1_' || p_slug, s1::text, true); perform set_config('t.s2_' || p_slug, s2::text, true);
  r := public.cm_create_plan(org, 'Plano 5%', null, 'net_value', 'sale_confirmation', 'individual', 'proportional');
  ver := (r ->> 'version_id')::uuid;
  perform public.cm_save_plan_draft(org, ver, '{"rules":[{"name":"Global 5%","rule_type":"percentage","rate":"0.05"}]}'::jsonb);
  perform public.cm_publish_plan_version(org, ver, date '2026-01-01');
  perform public.cm_assign_plan(org, s1, (r ->> 'plan_id')::uuid, date '2026-01-01');
  perform public.cm_assign_plan(org, s2, (r ->> 'plan_id')::uuid, date '2026-01-01');
  perform set_config('t.plan_' || p_slug, (r ->> 'plan_id'), true); perform set_config('t.ver_' || p_slug, ver::text, true);
  sale := public.cm_save_sale_draft(org, null, '{"sale_number":"S-1","sale_date":"2026-03-10","split_model":"independent"}',
    jsonb_build_array(jsonb_build_object('quantity', '1', 'unit_price_cents', p_sale_cents, 'discount_cents', 0)),
    jsonb_build_array(jsonb_build_object('seller_id', s1, 'allocation_percentage', '100', 'participation_type', 'primary')));
  perform public.cm_confirm_sale(org, sale);
  perform set_config('t.sale_' || p_slug, sale::text, true);
  select id into item from public.sale_items where sale_id = sale;
  select id into rule from public.commission_rules where plan_version_id = ver;
  k := format('c:%s:%s:%s:%s', sale, s1, item, rule);
  ent := jsonb_build_array(jsonb_build_object('idempotencyKey', k || '|' || s1 || '#1', 'componentKey', k, 'sellerId', s1, 'saleId', sale, 'itemId', item, 'planVersionId', ver, 'ruleId', rule,
    'entryType', 'commission', 'amountCents', p_sale_cents / 20, 'effectiveAt', '2026-03-10', 'eligibleAt', '2026-03-10', 'cause', 'initial'));
  perform public.cm_post_calculation(org, 'sale', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('d', 64), array[sale], '[]', ent, '[]');
  perform public.cm_review_entries(org, array[(select id from public.commission_entries where sale_id = sale)], 'approve', null);
end $$;
grant execute on function test.build(text, bigint, boolean) to authenticated;

:as_oa
select test.build('aaa', 20000000, true);   -- venda de R$ 200.000 ⇒ comissão R$ 10.000
reset role;
:as_ob
select test.build('bbb', 40000000, false);  -- venda de R$ 400.000 ⇒ comissão R$ 20.000
reset role;

-- ===================================================================== Caso 15 e isolamento em TODAS as tabelas
:as_oa
do $$
declare a uuid := test.t('org_aaa'); b uuid := test.t('org_bbb'); t text; n bigint; d jsonb; bad text := '';
begin
  d := public.cm_dashboard(a, date '2026-03-01', date '2026-03-31', '{}');
  assert (d -> 'kpis' ->> 'calculated_cents')::bigint = 1000000, 'empresa A: R$ 10.000,00 (e só os dela)';
  assert test.errmsg(format($q$select public.cm_dashboard(%L, date '2026-03-01', date '2026-03-31', '{}')$q$, b)) like '%sem permissão%', 'A não consulta o dashboard de B';
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'organization_id')
      and c.relname in (select tablename from pg_tables where schemaname = 'public' and tablename not in ('organization_members', 'organization_settings', 'audit_log', 'privacy_requests', 'profiles'))
  loop
    execute format('select count(*) from public.%I where organization_id = %L', t, b) into n;
    if n > 0 then bad := bad || t || ' '; end if;
  end loop;
  assert bad = '', 'A enxerga linhas de B em: ' || bad;
  raise notice 'PASS: Caso 15 e isolamento A×B em todas as tabelas do sistema (1)';
end $$;
reset role;
:as_ob
do $$
declare a uuid := test.t('org_aaa'); b uuid := test.t('org_bbb'); d jsonb;
begin
  d := public.cm_dashboard(b, date '2026-03-01', date '2026-03-31', '{}');
  assert (d -> 'kpis' ->> 'calculated_cents')::bigint = 2000000, 'empresa B: R$ 20.000,00';
  assert (select count(*) from public.commission_entries where organization_id = a) = 0, 'B não lê lançamentos de A';
  raise notice 'PASS: isolamento B×A (2)';
end $$;
reset role;

-- ===================================================================== referências cruzadas entre empresas
:as_oa
do $$
declare a uuid := test.t('org_aaa'); b uuid := test.t('org_bbb');
begin
  assert test.errmsg(format($q$select public.cm_assign_plan(%L, %L, %L, date '2026-04-01')$q$, a, test.t('s1_bbb'), test.t('plan_aaa'))) like '%vendedor não encontrado%', 'não atribui plano a vendedor de outra empresa';
  assert test.errmsg(format($q$select public.cm_assign_plan(%L, %L, %L, date '2026-04-01')$q$, a, test.t('s1_aaa'), test.t('plan_bbb'))) like '%plano não encontrado%', 'não usa plano de outra empresa';
  assert test.errmsg(format($q$select public.cm_save_sale_draft(%L, null, '{"sale_number":"X","sale_date":"2026-03-11"}', '[{"quantity":"1","unit_price_cents":100,"discount_cents":0}]', %L)$q$, a,
    jsonb_build_array(jsonb_build_object('seller_id', test.t('s1_bbb'), 'allocation_percentage', '100', 'participation_type', 'primary')))) is not null, 'venda não aceita vendedor de outra empresa';
  assert test.errmsg(format($q$select public.cm_register_receipt(%L, %L, 100, date '2026-03-11', 'R', null)$q$, a, test.t('sale_bbb'))) like '%venda não encontrada%', 'recebimento em venda alheia';
  assert test.errmsg(format($q$select public.cm_cancel_sale(%L, %L, 'tentativa indevida', null, null)$q$, a, test.t('sale_bbb'))) like '%venda não encontrada%', 'cancelamento de venda alheia';
  -- função da empresa B chamada com a empresa A como contexto e id de B
  assert test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, a, test.t('sale_bbb'))) is not null, 'ids de B não passam por A';
  assert test.errmsg(format($q$select public.cm_save_team(%L, null, 'Invasora', null, null, true)$q$, b)) like '%sem permissão%', 'sem permissão no contexto de B';
  -- FK composta impede vínculo cruzado mesmo para quem ignora as funções (dono do schema)
  assert test.errmsg(format($q$select test.sql('insert into public.sale_events (organization_id, sale_id, event_type, effective_at) values (''%s'', ''%s'', ''corrected'', current_date)')$q$, a, test.t('sale_bbb'))) like '%violates foreign key%', 'FK composta bloqueia vínculo com venda de outra empresa';
  raise notice 'PASS: nenhuma referência cruzada entre empresas (3)';
end $$;
reset role;

-- ===================================================================== vendedor: nada de dados privados de terceiros; identificador adulterado
:as_s1
do $$
declare a uuid := test.t('org_aaa'); n bigint;
begin
  assert (select count(*) from public.commission_entries) = 1, 'vendedor 1 vê o próprio lançamento';
  assert (select count(*) from public.commission_entries where seller_id = test.t('s2_aaa')) = 0, 'não vê lançamentos do colega';
  assert (select count(*) from public.commission_calculation_details where seller_id = test.t('s2_aaa')) = 0, 'nem a memória de cálculo do colega';
  assert (select count(*) from public.commission_closings) = 0 and (select count(*) from public.payout_records) = 0, 'sem fechamentos/pagamentos ainda';
  assert (select count(*) from public.seller_plan_assignments where seller_id = test.t('s2_aaa')) = 0, 'nem a atribuição de plano do colega';
  assert test.errmsg(format($q$select public.cm_open_dispute(%L, %L, 'tentando contestar com id adulterado')$q$, a, (select id from public.commission_entries where seller_id = test.t('s1_aaa') limit 1))) is null, 'contesta o próprio';
  assert test.errmsg(format($q$select public.cm_register_statement(%L, %L, 'x/y.pdf', null)$q$, a, test.t('sale_aaa'))) like '%sem permissão%', 'vendedor não registra demonstrativo';
  assert test.errmsg(format($q$select public.cm_create_adjustment(%L, %L, 'positive', 'credit', 100000, 'Quero um ajuste para mim mesmo, por favor.', null, null, null)$q$, a, test.t('s1_aaa'))) like '%sem permissão%', 'vendedor não cria ajuste';
  assert test.errmsg(format($q$select public.cm_open_period(%L, date '2026-04-01', date '2026-04-30')$q$, a)) like '%sem permissão%', 'vendedor não abre período';
  assert test.errmsg(format($q$select public.cm_record_payout(%L, %L, current_date, 'pix', 'Z', null, '[]')$q$, a, test.t('s1_aaa'))) is not null, 'vendedor não registra pagamento';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, '{"name":"Minha meta","goal_type":"sold_value","target_value":"1000","period_start":"2026-03-01","period_end":"2026-03-31","scope_type":"seller","scope_reference_id":"%s"}', '[]')$q$, a, test.t('s1_aaa'))) like '%sem permissão%', 'vendedor não cria meta';
  raise notice 'PASS: vendedor não acessa dados de terceiros nem cria registros administrativos (4)';
end $$;
reset role;

-- ===================================================================== anon: nada; privilégios de função
:as_anon
do $$
declare t text; bad text := ''; f record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and (tablename like 'commission%' or tablename in ('sales', 'sale_items', 'sale_participants', 'sale_events', 'sellers', 'sales_teams', 'customers', 'customer_receipts',
      'payout_records', 'payout_allocations', 'products', 'product_categories', 'seller_plan_assignments', 'seller_team_history', 'sales_goals', 'goal_bonus_rules', 'import_jobs', 'import_row_errors', 'saved_simulations')) loop
    if test.errmsg(format('select 1 from public.%I limit 1', t)) not like '%permission denied%' then bad := bad || t || ' '; end if;
  end loop;
  assert bad = '', 'anon lê: ' || bad;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'cm\_%' loop
    if has_function_privilege('anon', f.sig, 'execute') then bad := bad || f.sig::text || ' '; end if;
  end loop;
  assert bad = '', 'anon executa: ' || bad;
  raise notice 'PASS: anon sem acesso a tabelas nem a funções (5)';
end $$;
reset role;
:as_oa
do $$
declare f record; bad text := ''; n int := 0;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'cm\_%' loop
    n := n + 1;
    if not has_function_privilege('authenticated', f.sig, 'execute') then bad := bad || f.sig::text || ' '; end if;
  end loop;
  assert bad = '' and n >= 40, 'funções cm_* acessíveis a usuário autenticado (' || n || ')';
  assert test.errmsg(format($q$select private.cm_apply_adjustment(%L)$q$, test.t('sale_aaa'))) like '%permission denied%', 'internas do schema private não são chamáveis';
  assert test.errmsg(format($q$select private.cm_notify_user(%L, %L, 't', 't', 't', null, null, null)$q$, test.t('org_aaa'), test.t('org_aaa'))) like '%permission denied%', 'notificação interna não é chamável';
  raise notice 'PASS: privilégios mínimos nas funções (6)';
end $$;
reset role;

-- ===================================================================== 2º fator no banco (leitura e escrita)
:as_oa1
do $$
declare a uuid := test.t('org_aaa');
begin
  assert (select count(*) from public.commission_entries) = 0 and (select count(*) from public.sales) = 0, 'administrador sem AAL2 não lê remuneração nem vendas pela API';
  assert test.errmsg(format($q$select public.cm_save_team(%L, null, 'Sem MFA', null, null, true)$q$, a)) like '%duas etapas%', 'administrador sem AAL2 não escreve';
  assert test.errmsg(format($q$select public.cm_dashboard(%L, date '2026-03-01', date '2026-03-31', '{}')$q$, a)) like '%duas etapas%', 'nem consulta o dashboard';
  raise notice 'PASS: 2º fator exigido no banco (7)';
end $$;
reset role;

-- ===================================================================== duplicidade e idempotência por referência externa; histórico de equipe
:as_oa
do $$
declare a uuid := test.t('org_aaa'); t2 uuid; d jsonb;
begin
  perform public.cm_save_sale_draft(a, null, '{"sale_number":"IMP-1","external_reference":"ERP-777","sale_date":"2026-03-12","split_model":"independent"}', '[{"quantity":"1","unit_price_cents":1000,"discount_cents":0}]',
    jsonb_build_array(jsonb_build_object('seller_id', test.t('s1_aaa'), 'allocation_percentage', '100', 'participation_type', 'primary')));
  assert test.errmsg(format($q$select public.cm_save_sale_draft(%L, null, '{"sale_number":"IMP-2","external_reference":"ERP-777","sale_date":"2026-03-12","split_model":"independent"}', '[{"quantity":"1","unit_price_cents":1000,"discount_cents":0}]', %L)$q$, a,
    jsonb_build_array(jsonb_build_object('seller_id', test.t('s1_aaa'), 'allocation_percentage', '100', 'participation_type', 'primary')))) like '%sales_external_ref_uniq%', 'mesma referência externa não duplica a venda';
  -- mudança de equipe com data futura NÃO muda o resultado histórico por equipe
  t2 := public.cm_save_team(a, null, 'Equipe 2', null, null, true);
  perform public.cm_save_seller(a, test.t('s1_aaa'), 'Vendedora Um', 'V1', 'internal', t2, 'ffffffff-0000-4000-8000-0000000000a4', date '2026-01-01', null, null, 'active', date '2026-06-01');
  d := public.cm_dashboard(a, date '2026-03-01', date '2026-03-31', jsonb_build_object('team_id', test.t('team_aaa')));
  assert (d -> 'kpis' ->> 'calculated_cents')::bigint = 1000000, 'março continua atribuído à equipe antiga';
  d := public.cm_dashboard(a, date '2026-03-01', date '2026-03-31', jsonb_build_object('team_id', t2));
  assert (d -> 'kpis' ->> 'calculated_cents')::bigint = 0, 'e não à nova equipe';
  assert (select count(*) from public.seller_team_history where seller_id = test.t('s1_aaa')) = 2 and (select valid_until from public.seller_team_history where seller_id = test.t('s1_aaa') and team_id = test.t('team_aaa')) = date '2026-05-31', 'histórico de lotação preservado';
  raise notice 'PASS: duplicidade por referência externa e histórico de equipe (8)';
end $$;
reset role;

-- ===================================================================== metas: bônus não se repete e congela a meta
:as_oa
do $$
declare a uuid := test.t('org_aaa'); g uuid; ver uuid := test.t('ver_aaa'); ent jsonb; r1 jsonb; r2 jsonb; k text;
begin
  g := public.cm_save_goal(a, null, jsonb_build_object('name', 'Meta de março', 'goal_type', 'sold_value', 'target_value', '10000000', 'period_start', '2026-03-01', 'period_end', '2026-03-31', 'scope_type', 'seller', 'scope_reference_id', test.t('s1_aaa')),
    jsonb_build_array(jsonb_build_object('plan_id', test.t('plan_aaa'), 'threshold_pct', '100', 'bonus_type', 'fixed', 'bonus_amount_cents', 50000)));
  assert (select count(*) from public.goal_bonus_rules where goal_id = g) = 1, 'regra de bônus criada';
  k := format('g:%s:%s:%s', g, (select id from public.goal_bonus_rules where goal_id = g), test.t('s1_aaa'));
  ent := jsonb_build_array(jsonb_build_object('idempotencyKey', k || '#1', 'componentKey', k, 'sellerId', test.t('s1_aaa'), 'planVersionId', ver, 'entryType', 'bonus', 'amountCents', 50000, 'effectiveAt', '2026-03-31', 'eligibleAt', '2026-03-31', 'cause', 'goal'));
  r1 := public.cm_post_calculation(a, 'goals', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('e', 64), '{}', '[]', ent, '[]');
  r2 := public.cm_post_calculation(a, 'goals', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('e', 64), '{}', '[]', ent, '[]');
  assert (r1 ->> 'entries_new')::int = 1 and (r2 ->> 'entries_new')::int = 0 and (r2 ->> 'entries_skipped')::int = 1, 'meta não gera o mesmo bônus duas vezes';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, %L, %L, '[]')$q$, a, g, jsonb_build_object('name', 'Meta de março', 'goal_type', 'sold_value', 'target_value', '1', 'period_start', '2026-03-01', 'period_end', '2026-03-31', 'scope_type', 'seller', 'scope_reference_id', test.t('s1_aaa')))) like '%já gerou bônus%', 'meta que gerou bônus não é reescrita';
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'goals', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, a, repeat('e', 64),
    jsonb_build_array(jsonb_set(ent -> 0, '{idempotencyKey}', to_jsonb('outra#1'::text))))) like '%bônus acima do valor%', 'bônus fixo não passa do valor da regra mesmo com outra chave';
  raise notice 'PASS: bônus idempotente e meta congelada (9)';
end $$;
reset role;

rollback;
