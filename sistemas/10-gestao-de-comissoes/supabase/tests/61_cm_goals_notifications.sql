-- Gestão de Comissões — metas e bônus (cadastro, escopo por perfil, validações, arquivamento, isolamento entre empresas) e notificações internas.
-- O cálculo do bônus é do motor (tests/unit/engine-ledger.test.ts); aqui o banco prova quem pode criar meta, com que dados, e que o bônus nasce preso à versão vigente do plano.

\set as_oc 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c0","aal":"aal2","email":"oc@t.invalid"}'', true); set local role authenticated;'
\set as_mc 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c1","aal":"aal1","email":"mc@t.invalid"}'', true); set local role authenticated;'
\set as_vc 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000c2","aal":"aal1","email":"vc@t.invalid"}'', true); set local role authenticated;'
\set as_od 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-0000000000d0","aal":"aal2","email":"od@t.invalid"}'', true); set local role authenticated;'

begin;

create function test.errmsg(q text) returns text language plpgsql as $$ begin execute q; return null; exception when others then return sqlerrm; end $$;
create function test.has(msg text, pat text, label text) returns void language plpgsql as $$ begin if msg is null or msg not like pat then raise exception 'FALHOU: % — esperado %, veio %', label, pat, coalesce(msg, '(sem erro)'); end if; end $$;
create function test.t(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid $$;
create function test.sql(q text) returns void language plpgsql security definer set search_path = '' as $$ begin execute q; end $$;
create function test.cnt(q text) returns bigint language plpgsql security definer set search_path = '' as $$ declare n bigint; begin execute q into n; return n; end $$;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-0000000000c0', 'oc@t.invalid'), ('ffffffff-0000-4000-8000-0000000000c1', 'mc@t.invalid'),
  ('ffffffff-0000-4000-8000-0000000000c2', 'vc@t.invalid'), ('ffffffff-0000-4000-8000-0000000000d0', 'od@t.invalid');

-- ===================================================================== (1) cenário
:as_oc
do $$
declare org uuid; t1 uuid; t2 uuid; r jsonb; v uuid;
begin
  org := public.create_organization('Metas Teste', 'cm-metas');
  perform set_config('t.org', org::text, true);
  insert into public.organization_members (organization_id, user_id, role) values
    (org, 'ffffffff-0000-4000-8000-0000000000c1', 'manager'), (org, 'ffffffff-0000-4000-8000-0000000000c2', 'member');
  t1 := public.cm_save_team(org, null, 'Equipe Um', null, 'ffffffff-0000-4000-8000-0000000000c1', true);
  t2 := public.cm_save_team(org, null, 'Equipe Dois', null, null, true);
  perform set_config('t.t1', t1::text, true); perform set_config('t.t2', t2::text, true);
  perform set_config('t.s1', public.cm_save_seller(org, null, 'Vendedor Um', 'M001', 'internal', t1, 'ffffffff-0000-4000-8000-0000000000c2', date '2026-01-01', null, null, 'active', null)::text, true);
  perform set_config('t.s2', public.cm_save_seller(org, null, 'Vendedor Dois', 'M002', 'internal', t2, null, date '2026-01-01', null, null, 'active', null)::text, true);
  r := public.cm_create_plan(org, 'Plano 5%', null, 'net_value', 'sale_confirmation', 'individual', 'proportional');
  v := (r ->> 'version_id')::uuid;
  perform public.cm_save_plan_draft(org, v, '{"rules":[{"name":"Global 5%","rule_type":"percentage","rate":"0.05"}]}'::jsonb);
  perform public.cm_publish_plan_version(org, v, date '2026-01-01');
  perform set_config('t.planA', r ->> 'plan_id', true); perform set_config('t.verA', v::text, true);
  raise notice 'PASS: cenário de metas (1)';
end $$;
reset role;

-- ===================================================================== (2) administrador cria metas com bônus
:as_oc
do $$
declare org uuid := test.t('org'); g uuid; goal jsonb;
begin
  goal := jsonb_build_object('name', 'Meta de setembro', 'goal_type', 'sold_value', 'target_value', '10000000', 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'scope_type', 'seller', 'scope_reference_id', test.t('s1'));
  g := public.cm_save_goal(org, null, goal, jsonb_build_array(
    jsonb_build_object('plan_id', test.t('planA'), 'threshold_pct', '100', 'bonus_type', 'fixed', 'bonus_amount_cents', 50000, 'award_timing', 'period_end', 'distribution', 'each'),
    jsonb_build_object('plan_id', test.t('planA'), 'threshold_pct', '120', 'bonus_type', 'rate', 'bonus_rate', '0.01', 'award_timing', 'on_attainment')));
  perform set_config('t.goal1', g::text, true);
  assert (select count(*) from public.goal_bonus_rules where goal_id = g) = 2, 'duas regras de bônus gravadas';
  assert (select count(*) from public.goal_bonus_rules where goal_id = g and plan_version_id = test.t('verA')) = 2, 'bônus preso à versão VIGENTE do plano';
  assert (select target_value_decimal from public.sales_goals where id = g) = 10000000, 'alvo gravado';
  -- plano inexistente na regra de bônus não grava nada
  perform test.has(test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, %L)$q$, org, goal, jsonb_build_array(jsonb_build_object('plan_id', '00000000-0000-4000-8000-000000000001', 'threshold_pct', '100', 'bonus_type', 'fixed', 'bonus_amount_cents', 100)))), '%', 'plano inexistente é recusado');
  assert (select count(*) from public.sales_goals) = 1, 'a meta recusada não deixou resíduo';
  raise notice 'PASS: administrador cria meta com bônus preso à versão do plano (2)';
end $$;
reset role;

-- ===================================================================== (3) validações de dados
:as_oc
do $$
declare org uuid := test.t('org'); base jsonb;
begin
  base := jsonb_build_object('name', 'Meta X', 'goal_type', 'sold_value', 'target_value', '1000', 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'scope_type', 'organization');
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"goal_type":"inventado"}')) is not null, 'tipo de meta inválido';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"target_value":"0"}')) is not null, 'alvo zero recusado';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"target_value":"-5"}')) is not null, 'alvo negativo recusado';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"period_start":"2026-10-01"}')) is not null, 'período invertido recusado';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"name":"X"}')) is not null, 'nome curto demais recusado';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"scope_type":"seller","scope_reference_id":"00000000-0000-4000-8000-000000000009"}')) like '%vendedor não encontrado%', 'meta de vendedor inexistente';
  assert test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, base || '{"scope_type":"team","scope_reference_id":"00000000-0000-4000-8000-000000000009"}')) like '%equipe não encontrada%', 'meta de equipe inexistente';
  assert (select count(*) from public.sales_goals) = 1, 'nenhuma meta inválida foi gravada';
  raise notice 'PASS: metas inválidas são recusadas sem deixar resíduo (3)';
end $$;
reset role;

-- ===================================================================== (4) escopo por perfil
:as_mc
do $$
declare org uuid := test.t('org'); g jsonb;
begin
  g := jsonb_build_object('name', 'Meta da equipe', 'goal_type', 'sales_count', 'target_value', '10', 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'scope_type', 'team', 'scope_reference_id', test.t('t1'));
  perform public.cm_save_goal(org, null, g, '[]');
  perform test.has(test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, g || jsonb_build_object('scope_reference_id', test.t('t2')))), '%sem permissão sobre esta equipe%', 'gestor não cria meta para outra equipe');
  perform test.has(test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, g || jsonb_build_object('scope_type', 'seller', 'scope_reference_id', test.t('s2')))), '%sem permissão sobre este vendedor%', 'gestor não cria meta para vendedor de outra equipe');
  perform test.has(test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, g || jsonb_build_object('scope_type', 'organization', 'scope_reference_id', null))), '%meta da empresa é do administrador/financeiro%', 'meta da empresa não é do gestor');
  raise notice 'PASS: o gestor só cria metas para a própria equipe (4)';
end $$;
reset role;

:as_oc
do $$
declare org uuid := test.t('org'); g uuid;
begin
  g := public.cm_save_goal(org, null, jsonb_build_object('name', 'Meta do outro vendedor', 'goal_type', 'sold_value', 'target_value', '500000', 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'scope_type', 'seller', 'scope_reference_id', test.t('s2')), '[]');
  perform set_config('t.goal2', g::text, true);
end $$;
reset role;

:as_vc
do $$
declare org uuid := test.t('org');
begin
  perform test.has(test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, jsonb_build_object('name', 'Auto meta', 'goal_type', 'sold_value', 'target_value', '1', 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'scope_type', 'seller', 'scope_reference_id', test.t('s1')))), '%sem permissão%', 'vendedor não cria meta');
  assert (select count(*) from public.sales_goals where id = test.t('goal1')) = 1, 'vendedor enxerga a própria meta';
  assert (select count(*) from public.sales_goals where id = test.t('goal2')) = 0, 'vendedor não enxerga a meta de outro vendedor';
  perform test.has(test.errmsg(format($q$select public.cm_archive_goal(%L, %L, true)$q$, org, test.t('goal1'))), '%sem permissão%', 'vendedor não arquiva meta');
  raise notice 'PASS: o vendedor só enxerga a própria meta e não cria nem arquiva (5)';
end $$;
reset role;

-- ===================================================================== (6) arquivamento e isolamento entre empresas
:as_oc
do $$
declare org uuid := test.t('org');
begin
  perform public.cm_archive_goal(org, test.t('goal2'), true);
  assert (select status from public.sales_goals where id = test.t('goal2')) = 'archived', 'meta arquivada (não apagada)';
  perform public.cm_archive_goal(org, test.t('goal2'), false);
  assert (select status from public.sales_goals where id = test.t('goal2')) = 'active', 'meta restaurada';
  assert test.errmsg(format($q$select test.sql('delete from public.sales_goals where id = ''%s''')$q$, test.t('goal1'))) is not null, 'meta com bônus não é apagada direto';
  raise notice 'PASS: metas são arquivadas, não apagadas (6)';
end $$;
reset role;

:as_od
do $$
declare org2 uuid; org uuid := test.t('org');
begin
  org2 := public.create_organization('Outra Empresa', 'cm-metas-b');
  assert (select count(*) from public.sales_goals) = 0, 'outra empresa não enxerga metas';
  assert (select count(*) from public.goal_bonus_rules) = 0, 'outra empresa não enxerga regras de bônus';
  perform test.has(test.errmsg(format($q$select public.cm_save_goal(%L, null, %L, '[]')$q$, org, jsonb_build_object('name', 'Invasão', 'goal_type', 'sold_value', 'target_value', '1', 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'scope_type', 'organization'))), '%sem permissão%', 'outra empresa não cria meta aqui');
  perform test.has(test.errmsg(format($q$select public.cm_archive_goal(%L, %L, true)$q$, org, test.t('goal1'))), '%sem permissão%', 'outra empresa não arquiva meta daqui');
  raise notice 'PASS: metas isoladas entre empresas (7)';
end $$;
reset role;

-- ===================================================================== (8) notificações internas: cada pessoa lê e marca só as suas
do $$
declare org uuid := test.t('org');
begin
  perform test.sql(format($q$insert into public.commission_notifications (organization_id, user_id, type, title) values
    (%L, 'ffffffff-0000-4000-8000-0000000000c2', 'teste', 'Para o vendedor'), (%L, 'ffffffff-0000-4000-8000-0000000000c1', 'teste', 'Para o gestor')$q$, org, org));
end $$;
:as_vc
do $$
declare org uuid := test.t('org'); n int;
begin
  assert (select count(*) from public.commission_notifications) = 1, 'vendedor lê só as próprias notificações';
  n := public.cm_mark_notifications_read(org, array(select id from public.commission_notifications));
  assert n = 1, 'marcou a própria como lida';
  -- tentar marcar a do gestor não afeta nada
  n := public.cm_mark_notifications_read(org, array(select id from public.commission_notifications where false) || array[(select id from public.commission_notifications limit 1)]);
  perform public.cm_set_notification_pref(org, 'commission_contested', false);
  assert (select count(*) from public.commission_notification_prefs) = 1, 'preferência gravada para o próprio usuário';
end $$;
reset role;
do $$
begin
  assert test.cnt(format($q$select count(*) from public.commission_notifications where organization_id = %L and user_id = 'ffffffff-0000-4000-8000-0000000000c1' and read_at is null$q$, test.t('org'))) = 1, 'a notificação do gestor continua não lida';
  assert test.cnt(format($q$select count(*) from public.commission_notifications where organization_id = %L and user_id = 'ffffffff-0000-4000-8000-0000000000c2' and read_at is not null$q$, test.t('org'))) = 1, 'a do vendedor ficou lida';
  raise notice 'PASS: notificações são pessoais (8)';
end $$;

rollback;
