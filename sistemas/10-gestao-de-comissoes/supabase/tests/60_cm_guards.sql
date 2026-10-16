-- Gestão de Comissões — travas de negócio, uma a uma, com a MENSAGEM esperada. Cada bloco nasceu de uma mutação que sobreviveu em
-- scripts/mutation-check.mjs: afirmar só "deu erro" deixa passar a regra removida quando outra camada também recusa; aqui a mensagem prova QUAL regra agiu.

\set as_ob 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b0","aal":"aal2","email":"ob@t.invalid"}'', true); set local role authenticated;'
\set as_mb 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b1","aal":"aal1","email":"mb@t.invalid"}'', true); set local role authenticated;'
\set as_fb 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b2","aal":"aal1","email":"fb@t.invalid"}'', true); set local role authenticated;'
\set as_fb2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b3","aal":"aal1","email":"fb2@t.invalid"}'', true); set local role authenticated;'
\set as_s1b 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000b4","aal":"aal1","email":"s1b@t.invalid"}'', true); set local role authenticated;'

begin;

create function test.errmsg(q text) returns text language plpgsql as $$ begin execute q; return null; exception when others then return sqlerrm; end $$;
create function test.has(msg text, pat text, label text) returns void language plpgsql as $$ begin if msg is null or msg not like pat then raise exception 'FALHOU: % — esperado %, veio %', label, pat, coalesce(msg, '(sem erro)'); end if; end $$;
create function test.t(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
create function test.sql(q text) returns void language plpgsql security definer set search_path = '' as $$ begin execute q; end $$;
create function test.cnt(q text) returns bigint language plpgsql security definer set search_path = '' as $$ declare n bigint; begin execute q into n; return n; end $$;
-- rascunho de venda com um item de 60.000 e outro de 40.000 centavos (total 100.000), um único vendedor principal
create function test.draft(org uuid, num text, sel uuid, sdate date default date '2026-03-10', ptype text default 'primary') returns uuid language sql as $$
  select public.cm_save_sale_draft(org, null,
    jsonb_build_object('sale_number', num, 'sale_date', sdate::text, 'split_model', 'independent'),
    '[{"quantity":"1","unit_price_cents":60000,"discount_cents":0},{"quantity":"1","unit_price_cents":40000,"discount_cents":0}]'::jsonb,
    jsonb_build_array(jsonb_build_object('seller_id', sel, 'allocation_percentage', '100', 'participation_type', ptype)));
$$;
-- grava UMA comissão de `cents` para o vendedor numa venda já confirmada (como o servidor faria após rodar o motor)
create function test.post(org uuid, sale uuid, sel uuid, cents bigint, pends jsonb default '[]', eff date default date '2026-03-10') returns jsonb language plpgsql as $$
declare item uuid; ver uuid; rule uuid := test.t('ruleA'); k text; det jsonb; ent jsonb; n int;
begin
  select id into item from public.sale_items where sale_id = sale order by position limit 1;
  select plan_version_id into ver from public.sale_participants where sale_id = sale and seller_id = sel;
  k := format('c:%s:%s:%s:%s', sale, sel, item, rule);
  select count(*) + 1 into n from public.commission_entries where component_key = k and seller_id = sel;
  det := jsonb_build_array(jsonb_build_object('componentKey', k, 'saleId', sale, 'itemId', item, 'sellerId', sel, 'planVersionId', ver, 'ruleId', rule, 'baseCents', 100000, 'rate', '0.05', 'potentialCents', cents, 'eligibleCents', cents, 'snapshot', '{"engine":"1.0.0"}'::jsonb));
  ent := jsonb_build_array(jsonb_build_object('idempotencyKey', k || '|' || sel || '#' || n, 'componentKey', k, 'sellerId', sel, 'saleId', sale, 'itemId', item, 'planVersionId', ver, 'ruleId', rule,
    'entryType', 'commission', 'amountCents', cents, 'effectiveAt', eff::text, 'eligibleAt', eff::text, 'cause', 'initial'));
  return public.cm_post_calculation(org, 'sale', date '2026-03-01', date '2026-03-31', '1.0.0', repeat('c', 64), array[sale], det, ent, pends);
end $$;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000b0', 'ob@t.invalid'), ('ffffffff-0000-4000-8000-0000000000b1', 'mb@t.invalid'), ('ffffffff-0000-4000-8000-0000000000b2', 'fb@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000b3', 'fb2@t.invalid'), ('ffffffff-0000-4000-8000-0000000000b4', 's1b@t.invalid');

-- ===================================================================== (1) cenário
:as_ob
do $$
declare org uuid; t1 uuid; t2 uuid; r jsonb; v uuid;
begin
  org := public.create_organization('Guardas Teste', 'cm-guardas');
  perform set_config('t.org', org::text, true);
  insert into public.organization_members (organization_id, user_id, role) values
    (org, 'ffffffff-0000-4000-8000-0000000000b1', 'manager'), (org, 'ffffffff-0000-4000-8000-0000000000b2', 'member'),
    (org, 'ffffffff-0000-4000-8000-0000000000b3', 'member'), (org, 'ffffffff-0000-4000-8000-0000000000b4', 'member');
  perform public.cm_set_access(org, 'ffffffff-0000-4000-8000-0000000000b2', 'finance');
  perform public.cm_set_access(org, 'ffffffff-0000-4000-8000-0000000000b3', 'finance');
  t1 := public.cm_save_team(org, null, 'Equipe Um', null, 'ffffffff-0000-4000-8000-0000000000b1', true);
  t2 := public.cm_save_team(org, null, 'Equipe Dois', null, null, true);
  -- S1 (equipe 1, usuário s1b), FIN (equipe 1, é também o usuário financeiro fb), S2 (equipe 2), S3/S4/S5 sem usuário
  perform set_config('t.s1', public.cm_save_seller(org, null, 'Vendedor Um', 'G001', 'internal', t1, 'ffffffff-0000-4000-8000-0000000000b4', date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.fin', public.cm_save_seller(org, null, 'Vendedor Financeiro', 'G002', 'internal', t1, 'ffffffff-0000-4000-8000-0000000000b2', date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.s2', public.cm_save_seller(org, null, 'Vendedor Dois', 'G003', 'internal', t2, null, date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.s3', public.cm_save_seller(org, null, 'Vendedor Tres', 'G004', 'internal', null, null, date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.s4', public.cm_save_seller(org, null, 'Vendedor Quatro', 'G005', 'internal', null, null, date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.s5', public.cm_save_seller(org, null, 'Vendedor Cinco', 'G006', 'internal', null, null, date '2026-01-01', null, null, 'active', null)::text, true);
  r := public.cm_create_plan(org, 'Plano 5%', null, 'net_value', 'sale_confirmation', 'individual', 'proportional');
  v := (r ->> 'version_id')::uuid;
  perform public.cm_save_plan_draft(org, v, '{"rules":[{"name":"Global 5%","rule_type":"percentage","rate":"0.05"}]}'::jsonb);
  perform public.cm_publish_plan_version(org, v, date '2026-01-01');
  perform set_config('t.planA', r ->> 'plan_id', true);
  perform set_config('t.verA', v::text, true);
  perform set_config('t.ruleA', (select id::text from public.commission_rules where plan_version_id = v), true);
  perform public.cm_assign_plan(org, test.t('s1'), test.t('planA'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('fin'), test.t('planA'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('s2'), test.t('planA'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('s3'), test.t('planA'), date '2026-01-01');
  perform public.cm_assign_plan(org, test.t('s5'), test.t('planA'), date '2026-01-01');
  -- s4 fica SEM plano de propósito
  raise notice 'PASS: cenário das travas (1)';
end $$;
reset role;

-- ===================================================================== (2) vendas: confirmação
:as_ob
do $$
declare org uuid := test.t('org'); d uuid;
begin
  -- venda confirmada não é editada: a recusa vem da regra de negócio (não só do trigger)
  d := test.draft(org, 'G-OK', test.t('s1'));
  perform public.cm_confirm_sale(org, d);
  perform set_config('t.saleOK', d::text, true);
  perform test.has(test.errmsg(format($q$select public.cm_save_sale_draft(%L, %L, '{"sale_number":"G-OK","sale_date":"2026-03-10"}', '[{"quantity":"1","unit_price_cents":1,"discount_cents":0}]', %L)$q$, org, d, jsonb_build_array(jsonb_build_object('seller_id', test.t('s1'), 'allocation_percentage', '100', 'participation_type', 'primary')))), '%confirmada não pode ser editada%', 'venda confirmada não edita (mensagem da regra)');

  -- totais da venda adulterados no rascunho: a confirmação confere item a item
  d := test.draft(org, 'G-TOT', test.t('s1'));
  perform test.sql('select set_config(''cm.sale_update'', ''on'', true)');
  perform test.sql(format('update public.sales set gross_amount_cents = gross_amount_cents + 1000, net_amount_cents = net_amount_cents + 1000 where id = %L', d));
  perform test.sql('select set_config(''cm.sale_update'', ''off'', true)');
  perform test.has(test.errmsg(format($q$select public.cm_confirm_sale(%L, %L)$q$, org, d)), '%totais da venda não conferem%', 'totais divergentes não confirmam');

  -- exatamente um vendedor principal
  d := test.draft(org, 'G-SEC', test.t('s1'), date '2026-03-10', 'secondary');
  perform test.has(test.errmsg(format($q$select public.cm_confirm_sale(%L, %L)$q$, org, d)), '%exatamente um vendedor principal%', 'sem principal não confirma');

  -- vendedor inativado depois do rascunho não confirma
  d := test.draft(org, 'G-INA', test.t('s5'));
  perform public.cm_save_seller(org, test.t('s5'), 'Vendedor Cinco', 'G006', 'internal', null, null, date '2026-01-01', null, null, 'inactive', null);
  perform test.has(test.errmsg(format($q$select public.cm_confirm_sale(%L, %L)$q$, org, d)), '%não estava ativo na data da venda%', 'vendedor inativo não confirma');

  -- vendedor sem plano vigente não confirma
  d := test.draft(org, 'G-SEMPLANO', test.t('s4'));
  perform test.has(test.errmsg(format($q$select public.cm_confirm_sale(%L, %L)$q$, org, d)), '%não tem plano de comissão vigente%', 'sem plano não confirma');
  raise notice 'PASS: confirmação de venda recusa totais, principal, inativo e sem plano (2)';
end $$;
reset role;

-- ===================================================================== (3) devoluções e recebimentos
:as_ob
do $$
declare org uuid := test.t('org'); sale uuid := test.t('saleOK'); i1 uuid; i2 uuid; d uuid;
begin
  select id into i1 from public.sale_items where sale_id = sale order by position limit 1;
  select id into i2 from public.sale_items where sale_id = sale order by position desc limit 1;
  -- rascunho não recebe devolução
  d := test.draft(org, 'G-DRAFT', test.t('s1'));
  perform test.has(test.errmsg(format($q$select public.cm_register_return(%L, %L, 100, date '2026-03-20', '{}', 'teste de devolução', 'ev-x')$q$, org, d)), '%só vendas confirmadas aceitam devolução%', 'devolução exige venda confirmada');
  -- acima do saldo da venda
  perform test.has(test.errmsg(format($q$select public.cm_register_return(%L, %L, 100001, date '2026-03-20', jsonb_build_object(%L, 100001), 'teste de devolução', 'ev-1')$q$, org, sale, i1)), '%excede o saldo comissionável da venda%', 'devolução acima do saldo da venda');
  -- acima do saldo do item (o item 2 vale 40.000; o total ainda cabe na venda)
  perform test.has(test.errmsg(format($q$select public.cm_register_return(%L, %L, 50000, date '2026-03-20', jsonb_build_object(%L, 50000), 'teste de devolução', 'ev-2')$q$, org, sale, i2)), '%excede o saldo do item%', 'devolução acima do saldo do item');
  -- recebimento com data futura
  perform test.has(test.errmsg(format($q$select public.cm_register_receipt(%L, %L, 1000, current_date + 30, 'REC-FUT', null)$q$, org, sale)), '%data de recebimento no futuro%', 'recebimento no futuro');
  raise notice 'PASS: devoluções e recebimentos respeitam saldo e data (3)';
end $$;
reset role;

-- ===================================================================== (4) vendas e comissões gravadas pelo financeiro (quem CALCULA é fb2)
:as_ob
do $$
declare org uuid := test.t('org'); d uuid;
begin
  foreach d in array array[test.draft(org, 'G-FIN', test.t('fin')), test.draft(org, 'G-S2', test.t('s2')), test.draft(org, 'G-S3', test.t('s3'))] loop
    perform public.cm_confirm_sale(org, d);
  end loop;
  perform set_config('t.saleFIN', (select id::text from public.sales where sale_number = 'G-FIN'), true);
  perform set_config('t.saleS2', (select id::text from public.sales where sale_number = 'G-S2'), true);
  perform set_config('t.saleS3', (select id::text from public.sales where sale_number = 'G-S3'), true);
  perform set_config('t.draftVer', (public.cm_new_plan_version(org, test.t('planA')))::text, true);
end $$;
reset role;

:as_fb2
do $$
declare org uuid := test.t('org'); item uuid; ver uuid; rule uuid := test.t('ruleA'); k text;
begin
  perform test.post(org, test.t('saleOK'), test.t('s1'), 5000);
  perform test.post(org, test.t('saleFIN'), test.t('fin'), 5000);
  perform test.post(org, test.t('saleS2'), test.t('s2'), 5000);
  perform test.post(org, test.t('saleS3'), test.t('s3'), 5000);
  perform set_config('t.e1', (select id::text from public.commission_entries where seller_id = test.t('s1')), true);
  perform set_config('t.efin', (select id::text from public.commission_entries where seller_id = test.t('fin')), true);
  perform set_config('t.e2', (select id::text from public.commission_entries where seller_id = test.t('s2')), true);
  perform set_config('t.e3', (select id::text from public.commission_entries where seller_id = test.t('s3')), true);
  select id into item from public.sale_items where sale_id = test.t('saleOK') order by position limit 1;
  select plan_version_id into ver from public.sale_participants where sale_id = test.t('saleOK') and seller_id = test.t('s1');
  k := format('c:%s:%s:%s:%s', test.t('saleOK'), test.t('s1'), item, rule);
  -- estorno que aponta para um original inexistente
  perform test.has(test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', repeat('d', 64), null, '[]', %L, '[]')$q$, org,
    jsonb_build_array(jsonb_build_object('idempotencyKey', 'rv:1', 'componentKey', k, 'sellerId', test.t('s1'), 'saleId', test.t('saleOK'), 'itemId', item, 'planVersionId', ver, 'ruleId', rule,
      'entryType', 'reversal', 'amountCents', -100, 'effectiveAt', '2026-03-12', 'eligibleAt', '2026-03-12', 'cause', 'return', 'originalIdempotencyKey', 'nao-existe', 'sourceEventId', 'ev-9')))),
    '%lançamento original não encontrado%', 'estorno exige original existente');
  -- versão de plano em rascunho nunca recebe lançamento
  perform test.has(test.errmsg(format($q$select public.cm_post_calculation(%L, 'sale', date '2026-03-01', date '2026-03-31', '1', repeat('e', 64), null, '[]', %L, '[]')$q$, org,
    jsonb_build_array(jsonb_build_object('idempotencyKey', 'np:1', 'componentKey', 'np', 'sellerId', test.t('s1'), 'planVersionId', test.t('draftVer'),
      'entryType', 'adjustment_positive', 'amountCents', 100, 'effectiveAt', '2026-03-12', 'eligibleAt', '2026-03-12', 'cause', 'recalculation')))),
    '%plano não publicado%', 'plano em rascunho não recebe lançamento');
  raise notice 'PASS: gravação recusa estorno sem original e plano não publicado (4)';
end $$;
reset role;

-- ===================================================================== (5) aprovação
:as_fb
do $$ begin
  perform test.has(test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, test.t('org'), test.t('efin'))), '%ninguém aprova a própria comissão%', 'ninguém aprova a própria comissão');
end $$;
reset role;

:as_mb
do $$ begin
  perform test.has(test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, test.t('org'), test.t('e2'))), '%sem permissão sobre este vendedor%', 'gestor não aprova fora da própria equipe');
end $$;
reset role;

-- contestação aberta bloqueia a aprovação (defesa em profundidade: o estado «contestado» já bloquearia; aqui o estado é forçado de volta)
:as_s1b
do $$ begin perform set_config('t.disp', public.cm_open_dispute(test.t('org'), test.t('e1'), 'Discordo do valor desta comissão, por favor revisem.')::text, true); end $$;
reset role;
:as_ob
do $$
declare org uuid := test.t('org');
begin
  perform test.sql('select set_config(''cm.entry_update'', ''on'', true)');
  perform test.sql(format('update public.commission_entries set approval_status = ''pending_review'' where id = %L', test.t('e1')));
  perform test.sql('select set_config(''cm.entry_update'', ''off'', true)');
  perform test.has(test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, org, test.t('e1'))), '%há contestação aberta%', 'contestação aberta bloqueia a aprovação');
  perform public.cm_respond_dispute(org, test.t('disp'), 'rejected', 'Valor conferido: está correto conforme o plano.', null);
  raise notice 'PASS: aprovação: própria comissão, escopo do gestor e contestação aberta (5)';
end $$;
reset role;

-- segregação de funções: quem calculou não aprova
:as_ob
do $$ begin perform public.cm_save_settings(test.t('org'), '{"segregation_of_duties":true}'); end $$;
reset role;
:as_fb2
do $$
declare org uuid := test.t('org');
begin
  perform test.has(test.errmsg(format($q$select public.cm_review_entries(%L, array[%L]::uuid[], 'approve', null)$q$, org, test.t('e3'))), '%quem calculou não aprova%', 'quem calculou não aprova');
  perform test.has(test.errmsg(format($q$select public.cm_create_adjustment(%L, %L, 'positive', 'credit', 0, 'ajuste de teste com valor zero', null, null, null)$q$, org, test.t('s1'))), '%valor do ajuste deve ser positivo%', 'ajuste exige valor positivo');
  raise notice 'PASS: segregação na aprovação e valor de ajuste (6)';
end $$;
reset role;
:as_ob
do $$
declare org uuid := test.t('org');
begin
  perform public.cm_review_entries(org, array[test.t('e1'), test.t('efin'), test.t('e2'), test.t('e3')], 'approve', null);
  assert (select count(*) from public.commission_entries where approval_status = 'approved') = 4, 'quatro lançamentos aprovados por quem não calculou';
end $$;
reset role;

-- ===================================================================== (6) períodos e fechamento
:as_fb2
do $$
declare org uuid := test.t('org'); pf uuid;
begin
  -- período que ainda não terminou
  pf := public.cm_open_period(org, date '2099-01-01', date '2099-01-31');
  perform test.has(test.errmsg(format($q$select public.cm_prepare_closings(%L, %L)$q$, org, pf)), '%ainda não terminou%', 'período futuro não fecha');
  -- fevereiro aberto impede preparar março
  perform set_config('t.perFeb', public.cm_open_period(org, date '2026-02-01', date '2026-02-28')::text, true);
  perform set_config('t.perMar', public.cm_open_period(org, date '2026-03-01', date '2026-03-31')::text, true);
  perform test.has(test.errmsg(format($q$select public.cm_prepare_closings(%L, %L)$q$, org, test.t('perMar'))), '%feche os períodos anteriores%', 'períodos anteriores primeiro');
  perform public.cm_prepare_closings(org, test.t('perFeb'));
  perform public.cm_submit_period(org, test.t('perFeb'));
end $$;
reset role;
:as_ob
do $$ begin perform public.cm_close_period(test.t('org'), test.t('perFeb')); end $$;
reset role;

:as_fb2
do $$
declare org uuid := test.t('org'); r jsonb;
begin
  r := public.cm_prepare_closings(org, test.t('perMar'));
  assert (r ->> 'closings')::int = 4, 'um fechamento por vendedor com lançamento aprovado';
  -- inconsistência crítica aberta bloqueia o envio para aprovação
  perform test.post(org, test.t('saleS3'), test.t('s3'), 5000, '[{"code":"TESTE_CRITICA","severity":"critical","message":"inconsistência de teste","saleId":null}]');
  perform test.has(test.errmsg(format($q$select public.cm_submit_period(%L, %L)$q$, org, test.t('perMar'))), '%inconsistências críticas%', 'pendência crítica bloqueia o envio');
  perform test.sql('select set_config(''cm.flag_update'', ''on'', true)');
  perform test.sql('update public.commission_pendencies set status = ''resolved'', resolved_at = now(), resolved_by = ''ffffffff-0000-4000-8000-0000000000b0'' where code = ''TESTE_CRITICA''');
  perform test.sql('select set_config(''cm.flag_update'', ''off'', true)');
  perform public.cm_submit_period(org, test.t('perMar'));
  -- segregação: quem preparou não fecha
  perform test.has(test.errmsg(format($q$select public.cm_close_period(%L, %L)$q$, org, test.t('perMar'))), '%quem preparou o fechamento%', 'quem preparou não fecha');
  raise notice 'PASS: fechamento recusa período futuro, anteriores abertos, pendência crítica, item desaprovado e preparador (7)';
end $$;
reset role;
:as_ob
do $$
declare org uuid := test.t('org');
begin
  -- item que deixou de estar aprovado depois da preparação
  perform test.sql('select set_config(''cm.entry_update'', ''on'', true)');
  perform test.sql(format('update public.commission_entries set approval_status = ''pending_review'' where id = %L', test.t('e2')));
  perform test.has(test.errmsg(format($q$select public.cm_close_period(%L, %L)$q$, org, test.t('perMar'))), '%deixaram de estar aprovados%', 'item que deixou de estar aprovado impede o fechamento');
  perform test.sql(format('update public.commission_entries set approval_status = ''approved'' where id = %L', test.t('e2')));
  perform test.sql('select set_config(''cm.entry_update'', ''off'', true)');
  -- pendência crítica nova depois do envio bloqueia o fechamento
  perform test.sql('select set_config(''cm.flag_update'', ''on'', true)');
  perform test.sql('update public.commission_pendencies set status = ''open'', resolved_at = null, resolved_by = null where code = ''TESTE_CRITICA''');
  perform test.has(test.errmsg(format($q$select public.cm_close_period(%L, %L)$q$, org, test.t('perMar'))), '%inconsistências críticas%', 'pendência crítica bloqueia o fechamento');
  perform test.sql('update public.commission_pendencies set status = ''resolved'', resolved_at = now(), resolved_by = ''ffffffff-0000-4000-8000-0000000000b0'' where code = ''TESTE_CRITICA''');
  perform test.sql('select set_config(''cm.flag_update'', ''off'', true)');
  perform public.cm_close_period(org, test.t('perMar'));
  assert (select status from public.commission_periods where id = test.t('perMar')) = 'closed', 'março fechado por quem não preparou';
  -- reabrir fevereiro com março (posterior) fechado
  perform test.has(test.errmsg(format($q$select public.cm_reopen_period(%L, %L, 'tentativa de reabrir fevereiro com março fechado')$q$, org, test.t('perFeb'))), '%reabra primeiro os períodos posteriores%', 'reabertura respeita a ordem');
end $$;
reset role;

-- ===================================================================== (7) pagamentos
:as_ob
do $$
declare org uuid := test.t('org'); a uuid;
begin
  -- abril: venda, lançamento aprovado e fechamento ainda em rascunho
  a := test.draft(org, 'G-APR', test.t('s1'), date '2026-04-10');
  perform public.cm_confirm_sale(org, a);
  perform set_config('t.saleApr', a::text, true);
end $$;
reset role;
:as_fb2
do $$ begin perform test.post(test.t('org'), test.t('saleApr'), test.t('s1'), 5000, '[]', date '2026-04-10'); end $$;
reset role;
:as_ob
do $$
declare org uuid := test.t('org');
begin
  perform public.cm_review_entries(org, array[(select id from public.commission_entries where sale_id = test.t('saleApr'))], 'approve', null);
  perform set_config('t.perApr', public.cm_open_period(org, date '2026-04-01', date '2026-04-30')::text, true);
end $$;
reset role;
:as_fb2
do $$
declare org uuid := test.t('org'); cl1 uuid; clapr uuid;
begin
  perform public.cm_prepare_closings(org, test.t('perApr'));
  select id into clapr from public.commission_closings where period_id = test.t('perApr') and seller_id = test.t('s1');
  select id into cl1 from public.commission_closings where period_id = test.t('perMar') and seller_id = test.t('s1');
  perform set_config('t.clApr', clapr::text, true); perform set_config('t.cl1', cl1::text, true);
  perform test.has(test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-05', 'pix', 'P-RASC', null, %L)$q$, org, test.t('s1'),
    jsonb_build_array(jsonb_build_object('closing_id', clapr, 'amount_cents', 1000)))), '%só fechamentos concluídos recebem pagamento%', 'pagamento só em fechamento concluído');
  perform test.has(test.errmsg(format($q$select public.cm_record_payout(%L, %L, current_date + 5, 'pix', 'P-FUT', null, %L)$q$, org, test.t('s1'),
    jsonb_build_array(jsonb_build_object('closing_id', cl1, 'amount_cents', 1000)))), '%data de pagamento no futuro%', 'pagamento com data futura');
  perform test.has(test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-05', 'pix', 'P-DUP', null, %L)$q$, org, test.t('s1'),
    jsonb_build_array(jsonb_build_object('closing_id', cl1, 'amount_cents', 1000), jsonb_build_object('closing_id', cl1, 'amount_cents', 1000)))), '%fechamento repetido nas alocações%', 'mesmo fechamento duas vezes na alocação');
end $$;
reset role;
:as_ob
do $$ begin
  -- quem aprovou (fechou) o fechamento não registra o pagamento
  perform test.has(test.errmsg(format($q$select public.cm_record_payout(%L, %L, date '2026-04-05', 'pix', 'P-SEG', null, %L)$q$, test.t('org'), test.t('s1'),
    jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 1000)))), '%quem aprovou o fechamento não registra o pagamento%', 'segregação no pagamento');
end $$;
reset role;
:as_fb2
do $$
declare org uuid := test.t('org'); p uuid;
begin
  p := public.cm_record_payout(org, test.t('s1'), date '2026-04-05', 'pix', 'P-OK', null, jsonb_build_array(jsonb_build_object('closing_id', test.t('cl1'), 'amount_cents', 5000)));
  perform public.cm_reverse_payout(org, p, 'pagamento registrado por engano no teste');
  perform test.has(test.errmsg(format($q$select public.cm_reverse_payout(%L, %L, 'segundo estorno do mesmo pagamento')$q$, org, p)), '%pagamento já estornado%', 'pagamento só se estorna uma vez');
  raise notice 'PASS: pagamentos: rascunho, data futura, alocação repetida, segregação e estorno único (8)';
end $$;
reset role;

rollback;
