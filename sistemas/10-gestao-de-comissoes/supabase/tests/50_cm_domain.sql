-- Gestão de Comissões — fluxo de domínio no banco: cadastros, planos versionados, vendas, gravação idempotente do cálculo, aprovação,
-- contestação, ajustes, fechamento, pagamentos, reabertura e imutabilidade. O motor matemático é testado em TS (tests/unit); aqui o banco
-- prova que NÃO deixa passar duplicidade, plano injetado, histórico reescrito, pagamento acima do saldo nem fechamento alterado.

\set as_oa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a0","aal":"aal2","email":"oa@t.invalid"}'', true); set local role authenticated;'
\set as_ma 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a1","aal":"aal1","email":"ma@t.invalid"}'', true); set local role authenticated;'
\set as_ma2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a2","aal":"aal1","email":"ma2@t.invalid"}'', true); set local role authenticated;'
\set as_fa 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a3","aal":"aal1","email":"fa@t.invalid"}'', true); set local role authenticated;'
\set as_s1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a4","aal":"aal1","email":"s1@t.invalid"}'', true); set local role authenticated;'
\set as_s2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a5","aal":"aal1","email":"s2@t.invalid"}'', true); set local role authenticated;'
\set as_va 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000a7","aal":"aal1","email":"va@t.invalid"}'', true); set local role authenticated;'

begin;

create function test.errmsg(q text) returns text language plpgsql as $$ begin execute q; return null; exception when others then return sqlerrm; end $$;
create function test.t(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
create function test.cnt(q text) returns bigint language plpgsql security definer set search_path = '' as $$ declare n bigint; begin execute q into n; return n; end $$;
create function test.sql(q text) returns void language plpgsql security definer set search_path = '' as $$ begin execute q; end $$;
create function test.txt(q text) returns text language plpgsql security definer set search_path = '' as $$ declare s text; begin execute q into s; return s; end $$;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000a0', 'oa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a1', 'ma@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a2', 'ma2@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000a3', 'fa@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a4', 's1@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a5', 's2@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000a6', 's3@t.invalid'), ('ffffffff-0000-4000-8000-0000000000a7', 'va@t.invalid');

-- ===================================================================== (1) organização, perfis, equipes e vendedores
:as_oa
do $$
declare org uuid; t1 uuid; t2 uuid;
begin
  org := public.create_organization('Comissões Teste', 'cm-teste');
  perform set_config('t.org', org::text, true);
  insert into public.organization_members (organization_id, user_id, role) values
    (org, 'ffffffff-0000-4000-8000-0000000000a1', 'manager'), (org, 'ffffffff-0000-4000-8000-0000000000a2', 'manager'), (org, 'ffffffff-0000-4000-8000-0000000000a3', 'member'),
    (org, 'ffffffff-0000-4000-8000-0000000000a4', 'member'), (org, 'ffffffff-0000-4000-8000-0000000000a5', 'member'), (org, 'ffffffff-0000-4000-8000-0000000000a6', 'member'),
    (org, 'ffffffff-0000-4000-8000-0000000000a7', 'viewer');
  perform public.cm_set_access(org, 'ffffffff-0000-4000-8000-0000000000a3', 'finance');
  assert private.cm_profile(org) = 'admin', 'dono é administrador';
  t1 := public.cm_save_team(org, null, 'Equipe Norte', null, 'ffffffff-0000-4000-8000-0000000000a1', true);
  t2 := public.cm_save_team(org, null, 'Equipe Sul', null, 'ffffffff-0000-4000-8000-0000000000a2', true);
  perform set_config('t.t1', t1::text, true); perform set_config('t.t2', t2::text, true);
  perform set_config('t.sel1', public.cm_save_seller(org, null, 'Ana Souza', 'V001', 'internal', t1, 'ffffffff-0000-4000-8000-0000000000a4', date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.sel2', public.cm_save_seller(org, null, 'Breno Lima', 'V002', 'internal', t1, 'ffffffff-0000-4000-8000-0000000000a5', date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.sel3', public.cm_save_seller(org, null, 'Carla Dias', 'V003', 'internal', t2, 'ffffffff-0000-4000-8000-0000000000a6', date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.sel4', public.cm_save_seller(org, null, 'Diego Rocha', 'V004', 'external', null, null, date '2026-01-01', null, null, 'active', null)::text, true);
  raise notice 'PASS: organização, perfis, equipes e vendedores (1)';
end $$;
reset role;

:as_ma
do $$
declare org uuid := test.t('org');
begin
  assert private.cm_profile(org) = 'manager', 'gestor';
  assert test.errmsg(format($q$select public.cm_save_team(%L, null, 'Nova', null, null, true)$q$, org)) like '%sem permissão%', 'gestor não cria equipe';
  assert test.errmsg(format($q$select public.cm_save_seller(%L, null, 'Fora', 'V999', 'internal', %L, null, date '2026-01-01', null, null, 'active', null)$q$, org, test.t('t2'))) like '%sem permissão sobre esta equipe%', 'gestor não cadastra em equipe alheia';
  assert test.errmsg(format($q$select public.cm_save_seller(%L, %L, 'Ana S.', 'V001', 'internal', %L, 'ffffffff-0000-4000-8000-0000000000a7', date '2026-01-01', null, null, 'active', null)$q$, org, test.t('sel1'), test.t('t1'))) like '%somente administrador vincula%', 'gestor não vincula login';
  assert (select count(*) from public.sellers) = 3, 'gestor vê só as equipes que gere + vendedores sem equipe (3, não 4)';
  assert test.errmsg(format($q$select public.cm_save_settings(%L, '{"timezone":"America/Sao_Paulo"}')$q$, org)) like '%sem permissão%', 'gestor não altera configurações';
  raise notice 'PASS: escopo do gestor (2)';
end $$;
reset role;

-- ===================================================================== (2) planos: rascunho, validação, publicação imutável
:as_oa
do $$
declare org uuid := test.t('org'); r jsonb; va uuid; vb uuid; v_bad uuid; e text;
begin
  r := public.cm_create_plan(org, 'Plano A 5%', 'Percentual sobre a venda líquida', 'net_value', 'sale_confirmation', 'individual', 'proportional');
  va := (r ->> 'version_id')::uuid;
  perform set_config('t.planA', r ->> 'plan_id', true); perform set_config('t.verA', va::text, true);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, va)) like '%ao menos uma regra%', 'plano sem regra não publica';
  perform public.cm_save_plan_draft(org, va, '{"rules":[{"name":"Global 5%","rule_type":"percentage","rate":"0.05"}]}'::jsonb);
  perform public.cm_publish_plan_version(org, va, date '2026-01-01');
  perform set_config('t.ruleA', (select id::text from public.commission_rules where plan_version_id = va), true);
  assert (select status from public.commission_plan_versions where id = va) = 'published', 'publicada';

  r := public.cm_create_plan(org, 'Plano B faixas', null, 'net_value', 'sale_confirmation', 'individual', 'proportional');
  vb := (r ->> 'version_id')::uuid;
  perform set_config('t.planB', r ->> 'plan_id', true); perform set_config('t.verB', vb::text, true);
  perform public.cm_save_plan_draft(org, vb, $j${"rules":[{"name":"Faixas","rule_type":"tiered","tier":{"mode":"marginal","period":"month","scope":"individual","bands":[
    {"order":1,"from_cents":0,"to_cents":1000000,"rate":"0.02"},{"order":2,"from_cents":1000000,"to_cents":2000000,"rate":"0.04"},{"order":3,"from_cents":2000000,"to_cents":null,"rate":"0.06"}]}}]}$j$::jsonb);
  perform public.cm_publish_plan_version(org, vb, date '2026-01-01');

  -- planos inválidos NÃO publicam (faixas sobrepostas, lacuna, última fechada, conflito, condição maliciosa, escopo fora da precedência, tipo incompatível)
  r := public.cm_create_plan(org, 'Ruim', null, 'net_value', 'sale_confirmation', 'individual', 'proportional'); v_bad := (r ->> 'version_id')::uuid;
  perform public.cm_save_plan_draft(org, v_bad, $j${"rules":[{"name":"Faixa X","rule_type":"tiered","tier":{"mode":"marginal","period":"month","scope":"individual","bands":[
    {"order":1,"from_cents":0,"to_cents":1000000,"rate":"0.02"},{"order":2,"from_cents":900000,"to_cents":null,"rate":"0.04"}]}}]}$j$::jsonb);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, v_bad)) like '%sobrepõe%', 'faixas sobrepostas';
  perform public.cm_save_plan_draft(org, v_bad, $j${"rules":[{"name":"Faixa X","rule_type":"tiered","tier":{"mode":"marginal","period":"month","scope":"individual","bands":[
    {"order":1,"from_cents":0,"to_cents":1000000,"rate":"0.02"},{"order":2,"from_cents":1100000,"to_cents":null,"rate":"0.04"}]}}]}$j$::jsonb);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, v_bad)) like '%lacuna%', 'lacuna entre faixas';
  perform public.cm_save_plan_draft(org, v_bad, $j${"rules":[{"name":"Faixa X","rule_type":"tiered","tier":{"mode":"marginal","period":"month","scope":"individual","bands":[
    {"order":1,"from_cents":0,"to_cents":1000000,"rate":"0.02"}]}}]}$j$::jsonb);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, v_bad)) like '%sem teto%', 'última faixa deve ser aberta';
  perform public.cm_save_plan_draft(org, v_bad, '{"rules":[{"name":"Regra A","rule_type":"percentage","rate":"0.05"},{"name":"Regra B","rule_type":"percentage","rate":"0.06"}]}'::jsonb);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, v_bad)) like '%conflitam%', 'regras em conflito';
  assert test.errmsg(format($q$select public.cm_save_plan_draft(%L, %L, %L)$q$, org, v_bad, '{"rules":[{"name":"Regra X","rule_type":"percentage","rate":"0.05","conditions":{"fact":"process.env","op":"eq","value":"x"}}]}')) like '%condição inválida%', 'fato não autorizado';
  assert test.errmsg(format($q$select public.cm_save_plan_draft(%L, %L, %L)$q$, org, v_bad, '{"rules":[{"name":"Regra X","rule_type":"percentage","rate":"0.05","conditions":{"all":[{"fact":"seller.id","op":"regex","value":"x"}]}}]}')) like '%condição inválida%', 'operador não autorizado';
  assert test.errmsg(format($q$select public.cm_save_plan_draft(%L, %L, %L)$q$, org, v_bad, '{"rules":[{"name":"Regra X","rule_type":"percentage","rate":"1.5"}]}')) is not null, 'taxa acima de 100% recusada';
  perform public.cm_save_plan_draft(org, v_bad, '{"precedence":[["product"]],"rules":[{"name":"Eq","rule_type":"percentage","rate":"0.05","scope_type":"team","scope_reference":"x"}]}'::jsonb);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, v_bad)) like '%precedência%', 'escopo fora da ordem de precedência';
  perform public.cm_save_plan_draft(org, v_bad, '{"rules":[{"name":"Fixo","rule_type":"fixed","fixed_amount_cents":1000}]}'::jsonb);
  assert test.errmsg(format($q$select public.cm_publish_plan_version(%L, %L, date '2026-01-01')$q$, org, v_bad)) like '%valor fixo exige%', 'tipo de regra incompatível com a base';

  -- versão publicada é imutável
  assert test.errmsg(format($q$select public.cm_save_plan_draft(%L, %L, '{"rules":[]}')$q$, org, va)) like '%imutável%', 'publicada não regrava';
  assert test.errmsg(format($q$update public.commission_rules set rate_decimal = 0.5 where plan_version_id = %L$q$, va)) like '%permission denied%', 'usuário não altera regra';
  raise notice 'PASS: planos versionados, validação e publicação (3)';
end $$;
reset role;

:as_oa
do $$
declare org uuid := test.t('org');
begin
  -- mesmo como dono do schema, regra de versão publicada é imutável
  assert test.errmsg(format($q$select test.sql('update public.commission_rules set rate_decimal = 0.5 where plan_version_id = ''%s''')$q$, test.t('verA'))) like '%imutáveis%', 'trigger protege regra publicada';
  assert test.errmsg(format($q$select test.sql('update public.commission_plan_versions set precedence_json = ''[]'' where id = ''%s''')$q$, test.t('verA'))) like '%imutável%', 'trigger protege versão publicada';
  assert test.errmsg(format($q$select test.sql('update public.commission_plans set calculation_basis = ''gross_margin'' where id = ''%s''')$q$, test.t('planA'))) like '%não mudam depois da primeira publicação%', 'base do plano não muda após publicar';
  -- atribuição de plano: uma por data; a troca encerra a anterior no dia anterior
  perform public.cm_assign_plan(org, test.t('sel1'), test.t('planA'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('sel2'), test.t('planA'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('sel3'), test.t('planB'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('sel4'), test.t('planA'), date '2026-01-01');
  assert test.errmsg(format($q$select public.cm_assign_plan(%L, %L, %L, date '2026-01-01')$q$, org, test.t('sel1'), test.t('planB'))) like '%já existe atribuição%', 'sem atribuição conflitante na mesma data';
  perform public.cm_assign_plan(org, test.t('sel1'), test.t('planB'), date '2026-06-01');
  assert (select valid_until from public.seller_plan_assignments where seller_id = test.t('sel1') and plan_id = test.t('planA')) = date '2026-05-31', 'atribuição anterior encerrada no dia anterior';
  assert test.txt(format($q$select private.cm_plan_version_at(%L, %L, date '2026-03-10')::text$q$, org, test.t('sel1'))) = test.t('verA')::text, 'março usa o plano A';
  assert test.txt(format($q$select private.cm_plan_version_at(%L, %L, date '2026-06-10')::text$q$, org, test.t('sel1'))) = test.t('verB')::text, 'junho usa o plano B';
  -- nova versão: vigência futura; a antiga continua valendo até lá
  perform public.cm_save_plan_draft(org, public.cm_new_plan_version(org, test.t('planA')), '{"rules":[{"name":"Global 7%","rule_type":"percentage","rate":"0.07"}]}'::jsonb);
  perform set_config('t.verA2', (select id::text from public.commission_plan_versions where plan_id = test.t('planA') and status = 'draft'), true);
  perform public.cm_publish_plan_version(org, test.t('verA2'), date '2026-09-01');
  assert (select valid_until from public.commission_plan_versions where id = test.t('verA')) = date '2026-08-31', 'versão 1 encerra no dia anterior à 2';
  assert test.txt(format($q$select private.cm_plan_version_at(%L, %L, date '2026-03-10')::text$q$, org, test.t('sel2'))) = test.t('verA')::text, 'março continua na v1 (5%)';
  assert test.txt(format($q$select private.cm_plan_version_at(%L, %L, date '2026-09-10')::text$q$, org, test.t('sel2'))) = test.t('verA2')::text, 'setembro na v2 (7%)';
  assert (select rate_decimal from public.commission_rules where plan_version_id = test.t('verA')) = 0.05, 'taxa histórica preservada';
  raise notice 'PASS: imutabilidade de planos e atribuições (4)';
end $$;
reset role;

-- ===================================================================== (3) vendas: rascunho, confirmação (fixa o plano), escopo do gestor
:as_ma
do $$
declare org uuid := test.t('org'); s uuid; hdr jsonb; items jsonb;
begin
  hdr := '{"sale_number":"V-001","sale_date":"2026-03-10","split_model":"pool","channel":"web"}';
  items := '[{"quantity":"1","unit_price_cents":2000000,"discount_cents":0}]';
  s := public.cm_save_sale_draft(org, null, hdr, items, jsonb_build_array(
    jsonb_build_object('seller_id', test.t('sel1'), 'allocation_percentage', '60', 'participation_type', 'primary'),
    jsonb_build_object('seller_id', test.t('sel2'), 'allocation_percentage', '40', 'participation_type', 'secondary')));
  perform set_config('t.sale1', s::text, true);
  assert (select net_amount_cents from public.sales where id = s) = 2000000, 'totais calculados no servidor';
  assert test.errmsg(format($q$select public.cm_save_sale_draft(%L, null, '{"sale_number":"V-X","sale_date":"2026-03-10"}', %L, %L)$q$, org, items,
    jsonb_build_array(jsonb_build_object('seller_id', test.t('sel3'), 'allocation_percentage', '100', 'participation_type', 'primary')))) like '%sem permissão sobre este vendedor%', 'gestor só vende para as próprias equipes';
  -- pool que não soma 100% não confirma
  perform public.cm_save_sale_draft(org, null, '{"sale_number":"V-BAD","sale_date":"2026-03-10","split_model":"pool"}', items, jsonb_build_array(
    jsonb_build_object('seller_id', test.t('sel1'), 'allocation_percentage', '60', 'participation_type', 'primary'),
    jsonb_build_object('seller_id', test.t('sel2'), 'allocation_percentage', '30', 'participation_type', 'secondary')));
  assert test.errmsg(format($q$select public.cm_confirm_sale(%L, %L)$q$, org, (select id from public.sales where sale_number = 'V-BAD'))) like '%somar exatamente 100%', 'pool exige 100%';
  perform public.cm_confirm_sale(org, s);
  assert (select status from public.sales where id = s) = 'confirmed', 'confirmada';
  assert (select plan_version_id from public.sale_participants where sale_id = s and seller_id = test.t('sel1')) = test.t('verA'), 'plano fixado na confirmação';
  assert test.errmsg(format($q$select public.cm_confirm_sale(%L, %L)$q$, org, s)) like '%já foi confirmada%', 'não confirma duas vezes';
  assert test.errmsg(format($q$select public.cm_save_sale_draft(%L, %L, %L, %L, '[]')$q$, org, s, hdr, items)) is not null, 'venda confirmada não edita';
  assert (select count(*) from public.sale_events where sale_id = s and event_type = 'confirmed') = 1, 'evento de confirmação';
  raise notice 'PASS: venda confirmada fixa o plano; pool valida 100%% (5)';
end $$;
reset role;

:as_oa
do $$
declare org uuid := test.t('org');
begin
  -- mesmo dono do schema não altera venda confirmada nem seus itens/participantes
  assert test.errmsg(format($q$select test.sql('update public.sales set net_amount_cents = 1, gross_amount_cents = 1, commissionable_amount_cents = 1 where id = ''%s''')$q$, test.t('sale1'))) like '%imutável%', 'venda confirmada imutável';
  assert test.errmsg(format($q$select test.sql('update public.sale_items set unit_price_cents = 1 where sale_id = ''%s''')$q$, test.t('sale1'))) like '%imutáveis%', 'itens imutáveis';
  assert test.errmsg(format($q$select test.sql('delete from public.sales where id = ''%s''')$q$, test.t('sale1'))) like '%não pode ser apagada%', 'venda confirmada não se apaga';
  raise notice 'PASS: venda confirmada é imutável (6)';
end $$;
reset role;

-- ===================================================================== (4) gravação do cálculo: idempotência e travas de integridade
:as_fa
do $$
declare org uuid := test.t('org'); sale uuid := test.t('sale1'); item uuid; rule uuid := test.t('ruleA'); k1 text; k2 text; det jsonb; ent jsonb; r jsonb; r2 jsonb;
begin
  select id into item from public.sale_items where sale_id = sale;
  k1 := format('c:%s:%s:%s:%s', sale, test.t('sel1'), item, rule);
  det := jsonb_build_array(
    jsonb_build_object('componentKey', k1, 'saleId', sale, 'itemId', item, 'sellerId', test.t('sel1'), 'planVersionId', test.t('verA'), 'ruleId', rule, 'baseCents', 2000000, 'rate', '0.05', 'potentialCents', 60000, 'eligibleCents', 60000, 'snapshot', '{"engine":"1.0.0"}'::jsonb),
    jsonb_build_object('componentKey', k1, 'saleId', sale, 'itemId', item, 'sellerId', test.t('sel2'), 'planVersionId', test.t('verA'), 'ruleId', rule, 'baseCents', 2000000, 'rate', '0.05', 'potentialCents', 40000, 'eligibleCents', 40000, 'snapshot', '{"engine":"1.0.0"}'::jsonb));
  ent := jsonb_build_array(
    jsonb_build_object('idempotencyKey', k1 || '|' || test.t('sel1') || '#1', 'componentKey', k1, 'sellerId', test.t('sel1'), 'saleId', sale, 'itemId', item, 'planVersionId', test.t('verA'), 'ruleId', rule, 'entryType', 'commission', 'amountCents', 60000, 'effectiveAt', '2026-03-10', 'eligibleAt', '2026-03-10', 'cause', 'initial'),
    jsonb_build_object('idempotencyKey', k1 || '|' || test.t('sel2') || '#1', 'componentKey', k1, 'sellerId', test.t('sel2'), 'saleId', sale, 'itemId', item, 'planVersionId', test.t('verA'), 'ruleId', rule, 'entryType', 'commission', 'amountCents', 40000, 'effectiveAt', '2026-03-10', 'eligibleAt', '2026-03-10', 'cause', 'initial'));
  r := public.cm_post_calculation(org, 'sale', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('a', 64), array[sale], det, ent, '[]');
  assert (r ->> 'entries_new')::int = 2 and (r ->> 'entries_skipped')::int = 0, 'duas comissões gravadas';
  -- reprocessar a MESMA venda/evento: nenhuma duplicação (invariante 2)
  r2 := public.cm_post_calculation(org, 'sale', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('a', 64), array[sale], det, ent, '[]');
  assert (r2 ->> 'entries_new')::int = 0 and (r2 ->> 'entries_skipped')::int = 2, 'reprocessamento não duplica';
  assert (r2 ->> 'details_inserted')::int = 0, 'memória idêntica não é regravada';
  assert test.cnt(format($q$select count(*) from public.commission_entries where sale_id = '%s'$q$, sale)) = 2, 'continuam 2 lançamentos';
  assert (select sum(amount_cents) from public.commission_entries where sale_id = sale) = 100000, 'soma exata = R$ 1.000,00';
  assert (select count(*) from public.commission_entries where approval_status = 'calculated') = 2, 'nascem como calculadas (não aprovadas, não pagas)';
  assert (select count(*) from public.commission_entries e join public.commission_calculation_details d on d.id = e.calculation_detail_id) = 2, 'cada lançamento aponta sua memória de cálculo';
  perform set_config('t.k1', k1, true);
  raise notice 'PASS: cálculo gravado de forma idempotente (7)';
end $$;
reset role;

:as_fa
do $$
declare org uuid := test.t('org'); sale uuid := test.t('sale1'); item uuid; rule uuid := test.t('ruleA'); k1 text := test.txt('select current_setting(''t.k1'')'); base jsonb; bad jsonb;
begin
  select id into item from public.sale_items where sale_id = sale;
  base := jsonb_build_object('idempotencyKey', 'X#1', 'componentKey', k1, 'sellerId', test.t('sel1'), 'saleId', sale, 'itemId', item, 'planVersionId', test.t('verA'), 'ruleId', rule, 'entryType', 'commission', 'amountCents', 100, 'effectiveAt', '2026-03-10', 'eligibleAt', '2026-03-10', 'cause', 'initial');
  -- plano injetado (outra versão que não a fixada na venda): recusado — «usuário altera taxa histórica»
  bad := jsonb_set(base, '{planVersionId}', to_jsonb(test.t('verA2')::text));
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('a', 64), jsonb_build_array(bad))) like '%diferente da fixada%', 'plano injetado recusado';
  -- vendedor que não participa da venda
  bad := jsonb_set(base, '{sellerId}', to_jsonb(test.t('sel3')::text));
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('a', 64), jsonb_build_array(bad))) like '%não participa%', 'vendedor alheio à venda';
  -- regra de outra versão
  bad := jsonb_set(base, '{ruleId}', to_jsonb((select id::text from public.commission_rules where plan_version_id = test.t('verB'))));
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('a', 64), jsonb_build_array(bad))) like '%regra não pertence%', 'regra de outra versão';
  -- sinais: comissão negativa e estorno positivo são impossíveis
  bad := jsonb_set(base, '{amountCents}', '-100');
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('a', 64), jsonb_build_array(bad))) like '%check%', 'comissão negativa recusada';
  bad := jsonb_set(jsonb_set(base, '{entryType}', '"reversal"'), '{originalIdempotencyKey}', to_jsonb(k1 || '|' || test.t('sel1') || '#1'));
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('a', 64), jsonb_build_array(bad))) like '%check%', 'estorno positivo recusado';
  -- estorno sem original
  bad := jsonb_set(jsonb_set(base, '{entryType}', '"reversal"'), '{amountCents}', '-100');
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('a', 64), jsonb_build_array(bad))) like '%check%', 'estorno exige lançamento original';
  assert test.cnt(format($q$select count(*) from public.commission_entries where sale_id = '%s'$q$, sale)) = 2, 'nada foi gravado pelas tentativas inválidas';
  raise notice 'PASS: banco recusa plano injetado, vendedor alheio, sinais inválidos (8)';
end $$;
reset role;

-- estorno: referência ao original, único por evento (invariante 5)
:as_fa
do $$
declare org uuid := test.t('org'); sale uuid := test.t('sale1'); item uuid; rule uuid := test.t('ruleA'); k1 text := test.txt('select current_setting(''t.k1'')'); rev jsonb; r jsonb; r2 jsonb;
begin
  select id into item from public.sale_items where sale_id = sale;
  rev := jsonb_build_array(jsonb_build_object('idempotencyKey', k1 || '|' || test.t('sel1') || '#2', 'componentKey', k1, 'sellerId', test.t('sel1'), 'saleId', sale, 'itemId', item, 'planVersionId', test.t('verA'), 'ruleId', rule,
    'entryType', 'reversal', 'amountCents', -6000, 'effectiveAt', '2026-03-25', 'eligibleAt', '2026-03-25', 'originalIdempotencyKey', k1 || '|' || test.t('sel1') || '#1', 'cause', 'return', 'sourceEventId', 'dev-1'));
  r := public.cm_post_calculation(org, 'sale', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('b', 64), array[sale], '[]', rev, '[]');
  assert (r ->> 'entries_new')::int = 1, 'estorno gravado';
  assert (select original_entry_id from public.commission_entries where idempotency_key = k1 || '|' || test.t('sel1') || '#2') = (select id from public.commission_entries where idempotency_key = k1 || '|' || test.t('sel1') || '#1'), 'estorno referencia o original';
  -- mesmo evento de origem com outra chave de idempotência: NÃO duplica
  r2 := public.cm_post_calculation(org, 'sale', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('b', 64), array[sale], '[]',
    jsonb_build_array(jsonb_set(rev -> 0, '{idempotencyKey}', to_jsonb(k1 || '|' || test.t('sel1') || '#99'))), '[]');
  assert (r2 ->> 'entries_new')::int = 0, 'estorno do mesmo evento não se repete';
  assert (select count(*) from public.commission_entries where entry_type = 'reversal') = 1, 'um único estorno';
  assert (select amount_cents from public.commission_entries where idempotency_key = k1 || '|' || test.t('sel1') || '#1') = 60000, 'comissão original continua R$ 600,00';
  raise notice 'PASS: estorno referenciado e único por evento (9)';
end $$;
reset role;

-- ===================================================================== (5) lançamentos são imutáveis (até para o dono do schema)
:as_oa
do $$
declare e uuid;
begin
  select id into e from public.commission_entries where entry_type = 'commission' and seller_id = test.t('sel1');
  assert test.errmsg(format($q$select test.sql('update public.commission_entries set amount_cents = 1 where id = ''%s''')$q$, e)) like '%lançamento é imutável%', 'valor imutável';
  assert test.errmsg(format($q$select test.sql('update public.commission_entries set approval_status = ''approved'' where id = ''%s''')$q$, e)) like '%só muda por função autorizada%', 'estado só por função autorizada';
  assert test.errmsg(format($q$select test.sql('delete from public.commission_entries where id = ''%s''')$q$, e)) like '%não pode ser apagado%', 'lançamento não se apaga';
  assert test.errmsg(format($q$select test.sql('update public.commission_calculation_details set base_amount_cents = 1')$q$)) like '%imutável%', 'memória de cálculo imutável';
  assert test.errmsg(format($q$update public.commission_entries set amount_cents = 1 where id = %L$q$, e)) like '%permission denied%', 'usuário nem tem UPDATE';
  raise notice 'PASS: livro imutável (10)';
end $$;
reset role;

-- ===================================================================== (6) aprovação
:as_ma
do $$
declare org uuid := test.t('org'); e1 uuid; e2 uuid; r jsonb;
begin
  select id into e1 from public.commission_entries where entry_type = 'commission' and seller_id = test.t('sel1');
  select id into e2 from public.commission_entries where entry_type = 'commission' and seller_id = test.t('sel2');
  select id into e1 from public.commission_entries where entry_type = 'commission' and seller_id = test.t('sel1');
  perform set_config('t.e1', e1::text, true); perform set_config('t.e2', e2::text, true);
  assert test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'reject', 'curto')$q$, org, e1)) like '%justificativa%', 'rejeição exige justificativa';
  r := public.cm_review_entries(org, array[e1, e2], 'approve', null);
  assert (r ->> 'changed')::int = 2, 'gestor aprova as da própria equipe';
  assert test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, org, e1)) like '%estado inválido%', 'aprovação duplicada recusada';
  assert (select count(*) from public.commission_approval_events where commission_entry_id = e1 and decision = 'approved') = 1, 'uma decisão registrada';
  raise notice 'PASS: aprovação com histórico e proteção contra duplicidade (11)';
end $$;
reset role;

:as_ma2
do $$
declare org uuid := test.t('org');
begin
  assert test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'reject', 'não é da minha equipe mesmo')$q$, org, test.t('e1'))) is not null, 'gestor de outra equipe não vê nem aprova';
  assert (select count(*) from public.commission_entries) = 0, 'gestor da outra equipe não enxerga lançamentos';
  raise notice 'PASS: gestor só enxerga e decide sobre a própria equipe (12)';
end $$;
reset role;

:as_s1
do $$
declare org uuid := test.t('org');
begin
  assert test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, org, test.t('e1'))) like '%sem permissão%', 'vendedor não aprova';
  assert (select count(*) from public.commission_entries) = 2 and (select count(*) from public.commission_entries where seller_id <> test.t('sel1')) = 0, 'vendedor vê só os próprios lançamentos (comissão + estorno)';
  assert test.errmsg(format($q$select public.cm_save_plan_draft(%L, %L, '{"rules":[]}')$q$, org, test.t('verA2'))) like '%sem permissão%', 'vendedor não altera plano';
  raise notice 'PASS: vendedor não aprova nem altera plano (13)';
end $$;
reset role;

-- ===================================================================== (7) contestação
:as_s2
do $$
declare org uuid := test.t('org'); d uuid;
begin
  assert test.errmsg(format($q$select public.cm_open_dispute(%L, %L, 'quero contestar a comissão de outra pessoa')$q$, org, test.t('e1'))) like '%não encontrado%', 'não contesta o lançamento do colega';
  d := public.cm_open_dispute(org, test.t('e2'), 'Esperava a divisão 50/50 acordada com o gestor.');
  perform set_config('t.disp', d::text, true);
  assert (select approval_status from public.commission_entries where id = test.t('e2')) = 'contested', 'lançamento sinalizado como contestado';
  assert (select amount_cents from public.commission_entries where id = test.t('e2')) = 40000, 'valor NÃO muda por contestação';
  assert test.errmsg(format($q$select public.cm_open_dispute(%L, %L, 'segunda contestação do mesmo lançamento')$q$, org, test.t('e2'))) like '%já existe contestação%', 'uma contestação aberta por lançamento';
  raise notice 'PASS: contestação não altera valores (14)';
end $$;
reset role;

:as_ma
do $$
declare org uuid := test.t('org');
begin
  assert test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, org, test.t('e2'))) like '%estado inválido%', 'contestado não é aprovado de novo';
  perform public.cm_respond_dispute(org, test.t('disp'), 'resolved', 'Conferido: a divisão registrada em contrato é 60/40.', null);
  assert (select approval_status from public.commission_entries where id = test.t('e2')) = 'approved', 'estado anterior restaurado';
  assert (select status from public.commission_disputes where id = test.t('disp')) = 'resolved', 'contestação resolvida';
  assert test.errmsg(format($q$select public.cm_respond_dispute(%L, %L, 'resolved', 'de novo', null)$q$, org, test.t('disp'))) like '%já encerrada%', 'resposta única';
  raise notice 'PASS: resposta restaura o estado sem mexer em valores (15)';
end $$;
reset role;

-- ===================================================================== (8) ajustes manuais com segregação
:as_oa
do $$ begin perform public.cm_save_settings(test.t('org'), '{"segregation_of_duties":true}'); end $$;
reset role;
:as_fa
do $$
declare org uuid := test.t('org'); a uuid;
begin
  assert test.errmsg(format($q$select public.cm_create_adjustment(%L, %L, 'negative', 'debit', 1000, 'curto', null, null, null)$q$, org, test.t('sel1'))) like '%entre 10 e 1000%' or
         test.errmsg(format($q$select public.cm_create_adjustment(%L, %L, 'negative', 'debit', 1000, 'curto', null, null, null)$q$, org, test.t('sel1'))) like '%Motivo%', 'ajuste exige justificativa';
  a := public.cm_create_adjustment(org, test.t('sel1'), 'negative', 'debit', 1000, 'Desconto de amostra entregue ao cliente em março.', 'AM-12', test.t('e1'), date '2026-03-31');
  perform set_config('t.adj', a::text, true);
  assert (select status from public.commission_adjustments where id = a) = 'pending', 'ajuste nasce pendente';
  assert test.errmsg(format($q$select public.cm_decide_adjustment(%L, %L, 'approve', null)$q$, org, a)) like '%segregação%', 'quem criou não aprova (segregação)';
  raise notice 'PASS: ajuste exige justificativa e segregação (16)';
end $$;
reset role;
:as_oa
do $$
declare org uuid := test.t('org'); e uuid;
begin
  perform public.cm_decide_adjustment(org, test.t('adj'), 'approve', 'ok');
  select id into e from public.commission_entries where origin = 'adjustment' and seller_id = test.t('sel1');
  assert (select amount_cents from public.commission_entries where id = e) = -1000 and (select entry_type from public.commission_entries where id = e) = 'adjustment_negative', 'ajuste negativo lançado com sinal';
  assert (select original_entry_id from public.commission_entries where id = e) = test.t('e1'), 'ajuste referencia o lançamento original';
  assert (select amount_cents from public.commission_entries where id = test.t('e1')) = 60000, 'original intacto';
  assert test.errmsg(format($q$select public.cm_decide_adjustment(%L, %L, 'approve', null)$q$, org, test.t('adj'))) like '%já decidido%', 'decisão única';
  perform public.cm_save_settings(org, '{"segregation_of_duties":false}');
  raise notice 'PASS: ajuste aprovado vira lançamento compensatório (17)';
end $$;
reset role;

-- ===================================================================== (9) o estorno do passo (4) também precisa ser aprovado para entrar no fechamento
:as_ma
do $$
declare org uuid := test.t('org'); rv uuid;
begin
  select id into rv from public.commission_entries where entry_type = 'reversal';
  perform public.cm_review_entries(org, array[rv], 'approve', null);
  assert (select approval_status from public.commission_entries where id = rv) = 'approved', 'estorno aprovado';
end $$;
reset role;

-- ===================================================================== (10) fechamento mensal
:as_fa
do $$
declare org uuid := test.t('org'); p uuid; r jsonb; c1 public.commission_closings;
begin
  assert test.errmsg(format($q$select public.cm_open_period(%L, date '2026-03-31', date '2026-03-01')$q$, org)) like '%período inválido%', 'período invertido';
  p := public.cm_open_period(org, date '2026-03-01', date '2026-03-31');
  perform set_config('t.per', p::text, true);
  assert test.errmsg(format($q$select public.cm_open_period(%L, date '2026-03-15', date '2026-04-15')$q$, org)) like '%sobrepõe%', 'períodos não se sobrepõem';
  r := public.cm_prepare_closings(org, p);
  assert (r ->> 'closings')::int = 2, 'um fechamento por vendedor com lançamento aprovado';
  select * into c1 from public.commission_closings where period_id = p and seller_id = test.t('sel1');
  -- sel1: comissão 600,00 − estorno 60,00 − ajuste 10,00 = 530,00
  assert c1.total_commissions_cents = 60000 and c1.total_reversals_cents = -6000 and c1.total_adjustments_cents = -1000 and c1.payable_amount_cents = 53000, 'totais por tipo e a pagar R$ 530,00';
  assert (select payable_amount_cents from public.commission_closings where period_id = p and seller_id = test.t('sel2')) = 40000, 'sel2 a pagar R$ 400,00';
  assert test.errmsg(format($q$select public.cm_close_period(%L, %L)$q$, org, p)) like '%não está aguardando%', 'não fecha sem enviar para aprovação';
  -- refazer a conferência não duplica nem mantém itens órfãos (invariante 7)
  perform public.cm_prepare_closings(org, p);
  assert (select count(*) from public.commission_closing_items where voided_at is null) = 4, 'cada lançamento em UM fechamento ativo';
  assert (select count(*) from public.commission_closings where period_id = p and status = 'draft') = 2, 'rascunhos refeitos';
  perform public.cm_submit_period(org, p);
  perform public.cm_close_period(org, p);
  assert (select status from public.commission_periods where id = p) = 'closed', 'período fechado';
  assert (select count(*) from public.commission_closings where period_id = p and status = 'closed') = 2, 'fechamentos concluídos';
  raise notice 'PASS: fechamento mensal com totais exatos e itens únicos (18)';
end $$;
reset role;

:as_oa
do $$
declare org uuid := test.t('org'); cl uuid;
begin
  select id into cl from public.commission_closings where seller_id = test.t('sel1') and status = 'closed';
  perform set_config('t.cl1', cl::text, true);
  perform set_config('t.cl2', (select id::text from public.commission_closings where seller_id = test.t('sel2') and status = 'closed'), true);
  assert test.errmsg(format($q$select test.sql('update public.commission_closings set payable_amount_cents = 1, total_commissions_cents = 1 where id = ''%s''')$q$, cl)) like '%só muda por função autorizada%', 'fechamento fechado não muda por UPDATE direto';
  assert test.errmsg(format($q$select test.sql('select set_config(''cm.closing_update'', ''on'', true); update public.commission_closings set total_commissions_cents = 1, payable_amount_cents = 0 where id = ''%s''')$q$, cl)) like '%imutável%', 'mesmo com a flag, valores de fechamento concluído não mudam';
  assert test.errmsg(format($q$select test.sql('delete from public.commission_closings where id = ''%s''')$q$, cl)) like '%não pode ser apagado%', 'fechamento não se apaga';
  assert test.errmsg(format($q$select public.cm_prepare_closings(%L, %L)$q$, org, test.t('per'))) like '%não está em conferência%', 'reprocessamento não altera fechamento concluído';
  raise notice 'PASS: fechamento concluído é imutável (19)';
end $$;
reset role;

-- ===================================================================== (11) pagamentos registrados
:as_ma
do $$
begin
  assert test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-05', 'pix', 'PIX-1', null, %L)$q$, test.t('org'), test.t('sel1'), jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 1000)))) like '%sem permissão%', 'gestor sem autorização não registra pagamento';
end $$;
reset role;
:as_fa
do $$
declare org uuid := test.t('org'); p1 uuid; p2 uuid; bal bigint;
begin
  p1 := public.cm_record_payout(org, test.t('sel1'), date '2026-04-05', 'pix', 'PIX-1', null, jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 30000)));
  perform set_config('t.pay1', p1::text, true);
  assert test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-06', 'pix', 'PIX-1', null, %L)$q$, org, test.t('sel1'), jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 100)))) like '%já existe pagamento%', 'referência duplicada';
  assert test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-06', 'pix', 'PIX-2', null, %L)$q$, org, test.t('sel1'), jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 30000)))) like '%excede o saldo%', 'pagamento acima do saldo';
  assert test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-06', 'pix', 'PIX-3', null, %L)$q$, org, test.t('sel2'), jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 100)))) like '%inválido para este vendedor%', 'fechamento de outro vendedor';
  select payable_amount_cents - paid_cents into bal from public.commission_closing_balances where closing_id = test.t('cl1');
  assert bal = 23000, 'saldo pendente parcial R$ 230,00';
  p2 := public.cm_record_payout(org, test.t('sel1'), date '2026-04-10', 'ted', 'TED-9', 'saldo', jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 23000)));
  perform set_config('t.pay2', p2::text, true);
  assert (select payable_amount_cents - paid_cents from public.commission_closing_balances where closing_id = test.t('cl1')) = 0, 'quitado';
  -- pagamento cuja soma de alocações difere do valor é recusado no commit (aqui forçado com SET CONSTRAINTS)
  assert test.errmsg(format($q$select test.sql('insert into public.payout_records (organization_id, seller_id, amount_cents, payment_date, payment_method) values (''%s'', ''%s'', 5, current_date, ''pix''); set constraints all immediate')$q$, org, test.t('sel1'))) like '%somar exatamente%', 'alocações devem somar o valor pago';
  raise notice 'PASS: pagamentos parciais, sem duplicidade e sem exceder o saldo (20)';
end $$;
reset role;

:as_oa
do $$
declare org uuid := test.t('org');
begin
  assert test.errmsg(format($q$select test.sql('delete from public.payout_records where id = ''%s''')$q$, test.t('pay1'))) like '%não pode ser apagado%', 'pagamento registrado não se apaga';
  assert test.errmsg(format($q$select test.sql('update public.payout_records set amount_cents = 1 where id = ''%s''')$q$, test.t('pay1'))) like '%imutável%', 'valor do pagamento não é reescrito';
  assert test.errmsg(format($q$select public.cm_reopen_period(%L, %L, 'Preciso corrigir um lançamento antigo do período.')$q$, org, test.t('per'))) like '%pagamentos registrados%', 'não reabre período com pagamentos ativos';
  raise notice 'PASS: pagamento preservado e reabertura bloqueada com pagamentos (21)';
end $$;
reset role;

-- ===================================================================== (12) estorno de pagamento e reabertura formal
:as_fa
do $$
declare org uuid := test.t('org');
begin
  perform public.cm_reverse_payout(org, test.t('pay2'), 'Registrado por engano: o valor foi pago em outra data.');
  perform public.cm_reverse_payout(org, test.t('pay1'), 'Registrado por engano: referência incorreta informada.');
  assert (select status from public.payout_records where id = test.t('pay2')) = 'reversed' and (select count(*) from public.payout_records) = 2, 'registro permanece, só muda o estado';
  assert test.errmsg(format($q$select public.cm_reverse_payout(%L, %L, 'de novo, mas já estornado')$q$, org, test.t('pay2'))) like '%já estornado%', 'estorno único';
  assert (select payable_amount_cents - paid_cents from public.commission_closing_balances where closing_id = test.t('cl1')) = 53000, 'saldo volta a R$ 530,00';
  raise notice 'PASS: estorno de pagamento preserva o histórico (22)';
end $$;
reset role;
:as_oa
do $$
declare org uuid := test.t('org');
begin
  assert test.errmsg(format($q$select public.cm_reopen_period(%L, %L, 'curta')$q$, org, test.t('per'))) like '%justificativa%', 'reabertura exige justificativa';
  perform public.cm_reopen_period(org, test.t('per'), 'Reabertura para incluir ajuste esquecido da campanha de março.');
  assert (select status from public.commission_periods where id = test.t('per')) = 'open' and (select reopened_count from public.commission_periods where id = test.t('per')) = 1, 'período reaberto e contado';
  assert (select count(*) from public.commission_closings where period_id = test.t('per') and status = 'cancelled' and cancel_reason like 'reabertura%') = 2, 'fechamentos anteriores cancelados (preservados)';
  assert (select count(*) from public.commission_closing_items where voided_at is null) = 0, 'itens liberados';
  assert (select count(*) from public.audit_log where entity = 'commission_periods' and action = 'reopen') = 1, 'reabertura auditada';
  raise notice 'PASS: reabertura formal, justificada e auditada (23)';
end $$;
reset role;

-- ===================================================================== (13) cancelamento, devoluções e recebimentos
:as_ma
do $$
declare org uuid := test.t('org'); s uuid; it uuid; items jsonb := '[{"quantity":"2","unit_price_cents":500000,"discount_cents":0}]';
begin
  s := public.cm_save_sale_draft(org, null, '{"sale_number":"V-002","sale_date":"2026-03-12","split_model":"independent"}', items,
    jsonb_build_array(jsonb_build_object('seller_id', test.t('sel1'), 'allocation_percentage', '100', 'participation_type', 'primary')));
  perform public.cm_confirm_sale(org, s);
  perform set_config('t.sale2', s::text, true);
  select id into it from public.sale_items where sale_id = s;
  assert test.errmsg(format($q$select public.cm_register_return(%L, %L, 2000000, date '2026-03-20', %L, 'x', null)$q$, org, s, jsonb_build_object(it::text, 2000000))) like '%excede o saldo%', 'devolução acima do valor';
  assert test.errmsg(format($q$select public.cm_register_return(%L, %L, 300000, date '2026-03-20', %L, 'x', null)$q$, org, s, jsonb_build_object(it::text, 100000))) like '%somar%', 'itens devem somar a devolução';
  perform public.cm_register_return(org, s, 300000, date '2026-03-20', jsonb_build_object(it::text, 300000), 'Produto avariado', 'DEV-1');
  assert (select status from public.sales where id = s) = 'partially_returned', 'parcialmente devolvida';
  assert public.cm_register_return(org, s, 300000, date '2026-03-20', jsonb_build_object(it::text, 300000), 'Produto avariado', 'DEV-1') is not null, 'mesmo evento externo é idempotente';
  assert (select count(*) from public.sale_events where sale_id = s and event_type = 'partially_returned') = 1, 'evento único';
  perform public.cm_register_return(org, s, 700000, date '2026-03-22', jsonb_build_object(it::text, 700000), 'Restante', 'DEV-2');
  assert (select status from public.sales where id = s) = 'totally_returned', 'totalmente devolvida';
  assert test.errmsg(format($q$select public.cm_cancel_sale(%L, %L, 'tarde demais', null, null)$q$, org, s)) like '%confirmadas%', 'devolvida por inteiro não se cancela';
end $$;
reset role;
:as_fa
do $$
declare org uuid := test.t('org'); s uuid; r uuid;
begin
  s := test.t('sale1');
  r := public.cm_register_receipt(org, s, 800000, date '2026-03-20', 'REC-1', null);
  assert public.cm_register_receipt(org, s, 800000, date '2026-03-20', 'REC-1', null) = r, 'recebimento idempotente por referência';
  assert test.errmsg(format($q$select public.cm_register_receipt(%L, %L, 1300000, date '2026-03-21', 'REC-2', null)$q$, org, s)) like '%passaria do valor devido%', 'não recebe acima do devido';
  perform public.cm_reverse_receipt(org, r, 'Cheque devolvido pelo banco.');
  assert (select status from public.customer_receipts where id = r) = 'reversed', 'recebimento estornado, não apagado';
  assert test.errmsg(format($q$select test.sql('delete from public.customer_receipts where id = ''%s''')$q$, r)) like '%não pode ser apagado%', 'recebimento não se apaga';
  raise notice 'PASS: devoluções, cancelamento e recebimentos (24)';
end $$;
reset role;

-- venda cancelada não gera NOVA comissão positiva (cenário §37)
:as_ma
do $$
declare org uuid := test.t('org'); s uuid; it uuid; r text;
begin
  s := public.cm_save_sale_draft(org, null, '{"sale_number":"V-003","sale_date":"2026-03-14","split_model":"independent"}', '[{"quantity":"1","unit_price_cents":100000,"discount_cents":0}]',
    jsonb_build_array(jsonb_build_object('seller_id', test.t('sel1'), 'allocation_percentage', '100', 'participation_type', 'primary')));
  perform public.cm_confirm_sale(org, s);
  perform public.cm_cancel_sale(org, s, 'Cliente desistiu da compra', date '2026-03-15', null);
  perform public.cm_cancel_sale(org, s, 'Cliente desistiu da compra', date '2026-03-15', null); -- idempotente
  perform set_config('t.sale3', s::text, true);
  assert (select status from public.sales where id = s) = 'cancelled', 'cancelada';
end $$;
reset role;
:as_fa
do $$
declare org uuid := test.t('org'); s uuid := test.t('sale3'); it uuid; e jsonb;
begin
  select id into it from public.sale_items where sale_id = s;
  e := jsonb_build_array(jsonb_build_object('idempotencyKey', 'c:x#1', 'componentKey', 'c:x', 'sellerId', test.t('sel1'), 'saleId', s, 'itemId', it, 'planVersionId', test.t('verA'), 'ruleId', test.t('ruleA'),
    'entryType', 'commission', 'amountCents', 5000, 'effectiveAt', '2026-03-14', 'eligibleAt', '2026-03-14', 'cause', 'initial'));
  assert test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', %L, null, '[]', %L, '[]')$q$, org, repeat('c', 64), e)) like '%cancelada%', 'venda cancelada não gera comissão positiva';
  raise notice 'PASS: venda cancelada não gera nova comissão (25)';
end $$;
reset role;

-- ===================================================================== (14) métricas dos dashboards (definições de docs/METRICS.md)
:as_oa
do $$
declare org uuid := test.t('org'); d jsonb; k jsonb;
begin
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', '{}');
  k := d -> 'kpis';
  assert d ->> 'base_mode' = 'sale', 'administrador sem filtro vê cada venda uma vez';
  assert (k ->> 'sales_base_cents')::bigint = 2000000 and (k ->> 'sales_count')::int = 1, 'vendas elegíveis: só a V-001 (V-002 devolvida, V-003 cancelada)';
  assert (k ->> 'commissions_cents')::bigint = 100000 and (k ->> 'reversals_cents')::bigint = 6000 and (k ->> 'adjustments_cents')::bigint = -1000, 'comissões, estornos e ajustes separados';
  assert (k ->> 'calculated_cents')::bigint = 93000 and (k ->> 'approved_cents')::bigint = 93000 and (k ->> 'provisional_cents')::bigint = 0, 'calculado = aprovado = R$ 930,00; nada provisório';
  assert (k ->> 'paid_cents')::bigint = 0 and (k ->> 'payable_cents')::bigint = 93000, 'pagamentos estornados não contam; a pagar = aprovado − pago';
  assert (k ->> 'cost_pct')::numeric = 4.65, 'custo de comissão = 930 / 20.000 = 4,65%';
  assert jsonb_array_length(d -> 'monthly') = 1 and ((d -> 'monthly' -> 0) ->> 'base_cents')::bigint = 2000000, 'série mensal';
  assert (select count(*) from jsonb_array_elements(d -> 'by_status')) >= 1, 'distribuição por status';
  -- filtro por vendedor muda a metodologia para crédito atribuído (60% da venda) e continua exato
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', jsonb_build_object('seller_id', test.t('sel1')));
  assert d ->> 'base_mode' = 'credit' and (d -> 'kpis' ->> 'sales_base_cents')::bigint = 1200000 and (d -> 'kpis' ->> 'calculated_cents')::bigint = 53000, 'crédito do vendedor = 60% e comissão líquida R$ 530,00';
  -- mês sem vendas: sem divisão por zero (Caso 14)
  d := public.cm_dashboard(org, date '2026-02-01', date '2026-02-28', '{}');
  assert (d -> 'kpis' ->> 'sales_base_cents')::bigint = 0 and (d -> 'kpis') -> 'cost_pct' = 'null'::jsonb, 'custo de comissão é nulo (não NaN/infinito) sem base';
  -- filtro de plano: comissões do plano A em março
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', jsonb_build_object('plan_id', test.t('planA')));
  assert (d -> 'kpis' ->> 'commissions_cents')::bigint = 100000 and (d -> 'kpis') -> 'paid_cents' = 'null'::jsonb, 'filtro por plano; pagamentos não se aplicam ao filtro';
  raise notice 'PASS: KPIs e séries do dashboard com dados reais (26)';
end $$;
reset role;
:as_s1
do $$
declare org uuid := test.t('org'); d jsonb;
begin
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', '{}');
  assert d ->> 'base_mode' = 'credit' and (d -> 'kpis' ->> 'sales_base_cents')::bigint = 1200000 and (d -> 'kpis' ->> 'calculated_cents')::bigint = 53000, 'vendedor vê só o próprio crédito e a própria comissão';
  assert jsonb_array_length(d -> 'ranking_commission') = 1 and ((d -> 'ranking_commission' -> 0) ->> 'name') = 'Ana Souza', 'ranking só contém o próprio vendedor (sem dados de colegas)';
  assert test.errmsg(format($q$select public.cm_org_aggregates(%L, date '2026-03-01', date '2026-03-31')$q$, org)) like '%sem permissão%', 'vendedor não vê agregados da empresa';
  assert (select count(*) from public.sellers where id = test.t('sel2')) = 1 and (select count(*) from public.sellers where id = test.t('sel3')) = 0, 'colega de venda é visível (nome); vendedor de outra equipe, não';
  raise notice 'PASS: dashboard do vendedor isolado (27)';
end $$;
reset role;
:as_ma
do $$
declare org uuid := test.t('org'); d jsonb;
begin
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', '{}');
  assert (d -> 'kpis' ->> 'sales_base_cents')::bigint = 2000000 and (d -> 'kpis' ->> 'calculated_cents')::bigint = 93000, 'gestor da Equipe Norte vê o crédito dos dois vendedores da equipe';
  raise notice 'PASS: dashboard do gestor limitado à equipe (28)';
end $$;
reset role;
:as_ma2
do $$
declare org uuid := test.t('org'); d jsonb;
begin
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', '{}');
  assert (d -> 'kpis' ->> 'sales_base_cents')::bigint = 0 and (d -> 'kpis' ->> 'calculated_cents')::bigint = 0 and (d -> 'kpis') -> 'cost_pct' = 'null'::jsonb, 'gestor da outra equipe não enxerga valores da Equipe Norte';
  raise notice 'PASS: dashboard de outra equipe vazio (29)';
end $$;
reset role;
:as_va
do $$
declare org uuid := test.t('org'); d jsonb; a jsonb;
begin
  d := public.cm_dashboard(org, date '2026-03-01', date '2026-03-31', '{}');
  assert (d -> 'kpis' ->> 'calculated_cents')::bigint = 0 and jsonb_array_length(d -> 'ranking_commission') = 0, 'consulta não lê remuneração individual';
  a := public.cm_org_aggregates(org, date '2026-03-01', date '2026-03-31');
  assert (a ->> 'calculated_cents')::bigint = 93000 and (a ->> 'cost_pct')::numeric = 4.65 and not (a ? 'ranking_commission'), 'consulta vê só agregados da empresa';
  assert (select count(*) from public.commission_entries) = 0 and (select count(*) from public.sellers) = 0, 'consulta não lê tabelas de remuneração';
  raise notice 'PASS: perfil consulta só vê agregados (30)';
end $$;
reset role;

rollback;
