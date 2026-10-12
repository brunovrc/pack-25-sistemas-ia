-- CRM: isolamento entre organizações e matriz de papéis (RLS).
-- Org A: A (owner), M (manager), S1 e S2 (member/vendedores), V (viewer). Org B: B (owner).

\set as_a 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-00000000000a","aal":"aal2"}'', true); set local role authenticated;'
\set as_b 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-00000000000b","aal":"aal2"}'', true); set local role authenticated;'
\set as_m 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-00000000000c","aal":"aal1"}'', true); set local role authenticated;'
\set as_s1 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-000000000001","aal":"aal1"}'', true); set local role authenticated;'
\set as_s2 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-000000000002","aal":"aal1"}'', true); set local role authenticated;'
\set as_v 'select set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-4000-8000-000000000003","aal":"aal1"}'', true); set local role authenticated;'
\set as_anon 'select set_config(''request.jwt.claims'', ''{}'', true); set local role anon;'

begin;

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-00000000000a', 'a@crm.invalid'),
  ('ffffffff-0000-4000-8000-00000000000b', 'b@crm.invalid'),
  ('ffffffff-0000-4000-8000-00000000000c', 'm@crm.invalid'),
  ('ffffffff-0000-4000-8000-000000000001', 's1@crm.invalid'),
  ('ffffffff-0000-4000-8000-000000000002', 's2@crm.invalid'),
  ('ffffffff-0000-4000-8000-000000000003', 'v@crm.invalid');

:as_a
do $$ begin perform public.create_organization('CRM A', 'crm-a'); end $$;
reset role;
:as_b
do $$ begin perform public.create_organization('CRM B', 'crm-b'); end $$;
reset role;
insert into test.org select 'xa', id from public.organizations where slug = 'crm-a';
insert into test.org select 'xb', id from public.organizations where slug = 'crm-b';
insert into test.org select 'xa_prosp', id from public.crm_pipeline_stages where name = 'Prospecção' and organization_id = (select id from test.org where name = 'xa');
insert into test.org select 'xa_ganho', id from public.crm_pipeline_stages where name = 'Ganho' and organization_id = (select id from test.org where name = 'xa');
insert into test.org select 'xa_site', id from public.crm_lead_sources where name = 'Site' and organization_id = (select id from test.org where name = 'xa');
insert into test.org select 'xb_prosp', id from public.crm_pipeline_stages where name = 'Prospecção' and organization_id = (select id from test.org where name = 'xb');

:as_a
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  insert into public.organization_members (organization_id, user_id, role) values
    (a, 'ffffffff-0000-4000-8000-00000000000c', 'manager'),
    (a, 'ffffffff-0000-4000-8000-000000000001', 'member'),
    (a, 'ffffffff-0000-4000-8000-000000000002', 'member'),
    (a, 'ffffffff-0000-4000-8000-000000000003', 'viewer');
end $$;
reset role;

-- ================= padrões criados com a organização =================
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert (select count(*) from public.crm_pipeline_stages where organization_id = a) = 6, 'seis etapas padrão';
  assert (select count(*) from public.crm_pipeline_stages where organization_id = a and kind = 'won') = 1, 'uma etapa de ganho';
  assert (select count(*) from public.crm_pipeline_stages where organization_id = a and kind = 'lost') = 1, 'uma etapa de perda';
  assert (select count(*) from public.crm_lead_sources where organization_id = a) = 6, 'seis origens padrão';
  assert (select count(*) from public.crm_loss_reasons where organization_id = a) = 6, 'seis motivos de perda padrão';
  assert (select stale_days from public.crm_settings where organization_id = a) = 14, 'alerta de parada padrão = 14 dias';
  assert (select closing_soon_days from public.crm_settings where organization_id = a) = 7, 'alerta de fechamento padrão = 7 dias';
  raise notice 'PASS: padrões do CRM criados junto com a organização';
end $$;

-- ================= vendedor: só o que é dele =================
:as_s1
do $$
declare a uuid := (select id from test.org where name = 'xa'); src uuid := (select id from test.org where name = 'xa_site');
begin
  assert not test.throws(format($q$insert into public.crm_leads (organization_id, name, email, source_id, owner_id) values (%L, 'Lead do S1', 's1lead@x.invalid', %L, 'ffffffff-0000-4000-8000-000000000001')$q$, a, src)), 'vendedor cria lead próprio';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Para o S2', 'ffffffff-0000-4000-8000-000000000002')$q$, a)), 'vendedor não cria lead para outro';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name) values (%L, 'Sem dono')$q$, a)), 'vendedor não cria lead sem responsável';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, status, owner_id) values (%L, 'Já convertido', 'converted', 'ffffffff-0000-4000-8000-000000000001')$q$, a)), 'cliente não cria lead "convertido"';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id, converted_at) values (%L, 'Forja conversão', 'ffffffff-0000-4000-8000-000000000001', now())$q$, a)), 'cliente não grava converted_at (sem privilégio)';
  assert not test.throws(format($q$insert into public.crm_companies (organization_id, name, owner_id) values (%L, 'Empresa do S1', 'ffffffff-0000-4000-8000-000000000001')$q$, a)), 'vendedor cria empresa';
  raise notice 'PASS: vendedor cria só registros próprios';
end $$;
reset role;

:as_s2
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert not test.throws(format($q$insert into public.crm_leads (organization_id, name, email, owner_id) values (%L, 'Lead do S2', 's2lead@x.invalid', 'ffffffff-0000-4000-8000-000000000002')$q$, a)), 'S2 cria o próprio lead';
  assert (select count(*) from public.crm_leads) = 1, 'S2 enxerga só o próprio lead';
  assert test.affected($q$update public.crm_leads set notes = 'invasão' where name = 'Lead do S1'$q$) = 0, 'S2 não altera lead do S1';
  assert test.affected($q$delete from public.crm_leads where name = 'Lead do S1'$q$) = 0, 'S2 não apaga lead do S1';
  assert test.affected($q$update public.crm_leads set notes = 'meu' where name = 'Lead do S2'$q$) = 1, 'S2 altera o próprio';
  assert test.throws($q$update public.crm_leads set owner_id = 'ffffffff-0000-4000-8000-000000000001' where name = 'Lead do S2'$q$), 'vendedor não repassa lead a outro';
  assert test.affected($q$delete from public.crm_leads where name = 'Lead do S2'$q$) = 0, 'vendedor não apaga (só gestão)';
  assert (select count(*) from public.crm_companies) = 1, 'diretório de empresas é compartilhado (S2 vê a do S1)';
  raise notice 'PASS: vendedor não enxerga nem altera o que é de outro';
end $$;
reset role;

-- ================= gerente, leitor e administrador =================
:as_m
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert (select count(*) from public.crm_leads) = 2, 'gerente enxerga todos os leads';
  assert test.affected($q$update public.crm_leads set temperature = 'hot' where name = 'Lead do S1'$q$) = 1, 'gerente altera qualquer lead';
  assert not test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Lead descartável', 'ffffffff-0000-4000-8000-000000000001')$q$, a)), 'gerente cria lead para vendedor';
  assert test.affected($q$delete from public.crm_leads where name = 'Lead descartável'$q$) = 1, 'gerente apaga lead';
  assert test.throws(format($q$insert into public.crm_pipeline_stages (organization_id, name, kind) values (%L, 'Etapa do gerente', 'open')$q$, a)), 'gerente não configura etapas';
  assert test.throws(format($q$insert into public.crm_lead_sources (organization_id, name) values (%L, 'Origem do gerente')$q$, a)), 'gerente não configura origens';
  assert not test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'ffffffff-0000-4000-8000-000000000001', '2026-01-01', '2026-01-31', 1000)$q$, a)), 'gerente define meta';
  raise notice 'PASS: gerente opera tudo, exceto configuração';
end $$;
reset role;

:as_v
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert (select count(*) from public.crm_leads) = 2, 'leitor enxerga todos os leads';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Do leitor', 'ffffffff-0000-4000-8000-000000000003')$q$, a)), 'leitor não cria lead';
  assert test.affected($q$update public.crm_leads set notes = 'x'$q$) = 0, 'leitor não altera';
  assert test.throws(format($q$insert into public.crm_companies (organization_id, name) values (%L, 'Empresa do leitor')$q$, a)), 'leitor não cria empresa';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'ffffffff-0000-4000-8000-000000000003', '2026-02-01', '2026-02-28', 1)$q$, a)), 'leitor não define meta';
  assert (select count(*) from public.crm_goals) = 1, 'leitor lê metas';
  raise notice 'PASS: leitor só lê';
end $$;
reset role;

:as_a
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert not test.throws(format($q$insert into public.crm_pipeline_stages (organization_id, name, position, kind) values (%L, 'Revisão', 25, 'open')$q$, a)), 'admin/owner cria etapa';
  assert test.throws($q$update public.crm_pipeline_stages set kind = 'won' where name = 'Revisão'$q$), 'tipo da etapa é imutável (sem privilégio)';
  assert test.affected($q$update public.crm_pipeline_stages set is_active = false where name = 'Revisão'$q$) = 1, 'owner desativa etapa';
  assert test.throws($q$update public.crm_pipeline_stages set is_active = false where kind = 'won'$q$), 'não permite ficar sem etapa de ganho ativa';
  assert test.throws($q$update public.crm_pipeline_stages set is_active = false where kind = 'lost'$q$), 'não permite ficar sem etapa de perda ativa';
  assert test.affected($q$update public.crm_settings set stale_days = 21$q$) = 1, 'owner ajusta alerta';
  assert test.throws($q$update public.crm_settings set stale_days = 0$q$), 'alerta fora do limite é recusado';
  raise notice 'PASS: configuração só para owner/admin, com travas do funil';
end $$;
reset role;

-- ================= metas por papel =================
:as_s1
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert (select count(*) from public.crm_goals) = 1, 'vendedor lê a própria meta';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'ffffffff-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31', 5)$q$, a)), 'vendedor não define meta';
  assert test.affected($q$update public.crm_goals set target_amount = 1$q$) = 0, 'vendedor não altera meta';
  raise notice 'PASS: vendedor lê só a própria meta';
end $$;
reset role;
:as_s2
do $$ begin assert (select count(*) from public.crm_goals) = 0, 'S2 não vê a meta do S1'; raise notice 'PASS: meta de outro vendedor invisível'; end $$;
reset role;

-- ================= histórico segue a visibilidade da oportunidade =================
:as_s1
do $$
declare a uuid := (select id from test.org where name = 'xa'); st uuid := (select id from test.org where name = 'xa_prosp');
begin
  assert not test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (%L, 'Oportunidade do S1', 1000, %L, 'ffffffff-0000-4000-8000-000000000001')$q$, a, st)), 'vendedor cria oportunidade própria';
  assert (select count(*) from public.crm_stage_history) = 1, 'S1 vê o histórico da própria oportunidade';
  assert test.throws(format($q$insert into public.crm_stage_history (organization_id, opportunity_id, to_stage_id) values (%L, (select id from public.crm_opportunities limit 1), %L)$q$, a, st)), 'histórico não é gravável pelo cliente';
  raise notice 'PASS: histórico gravado pelo banco';
end $$;
reset role;
:as_s2
do $$ begin
  assert (select count(*) from public.crm_stage_history) = 0, 'S2 não vê histórico de oportunidade alheia';
  assert (select count(*) from public.crm_opportunities) = 0, 'S2 não vê oportunidade do S1';
  raise notice 'PASS: histórico e oportunidades isolados por responsável';
end $$;
reset role;
:as_m
do $$ begin assert (select count(*) from public.crm_stage_history) = 1, 'gerente vê o histórico'; raise notice 'PASS: gerente vê o histórico'; end $$;
reset role;

-- ================= outra organização =================
:as_b
do $$
declare a uuid := (select id from test.org where name = 'xa'); b uuid := (select id from test.org where name = 'xb');
  stb uuid := (select id from test.org where name = 'xb_prosp'); comp_a uuid;
begin
  assert (select count(*) from public.crm_leads) = 0, 'B não vê leads de A';
  assert (select count(*) from public.crm_companies) = 0, 'B não vê empresas de A';
  assert (select count(*) from public.crm_opportunities) = 0, 'B não vê oportunidades de A';
  assert (select count(*) from public.crm_goals) = 0, 'B não vê metas de A';
  assert (select count(*) from public.crm_pipeline_stages) = 6, 'B vê só as próprias etapas';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Invasor', 'ffffffff-0000-4000-8000-00000000000b')$q$, a)), 'B não cria lead na org A';
  assert test.affected(format($q$update public.crm_pipeline_stages set name = 'Hack' where organization_id = %L$q$, a)) = 0, 'B não altera etapas de A';
  assert test.affected(format($q$update public.crm_settings set stale_days = 99 where organization_id = %L$q$, a)) = 0, 'B não altera configurações de A';
  comp_a := (select id from public.crm_companies limit 1);
  assert comp_a is null, 'B não enxerga nenhuma empresa de A';
  assert test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (%L, 'Etapa de A em B', 1, %L, 'ffffffff-0000-4000-8000-00000000000b')$q$, b, (select id from test.org where name = 'xa_prosp'))), 'B não usa etapa de A (FK composta)';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, source_id, owner_id) values (%L, 'Origem de A em B', %L, 'ffffffff-0000-4000-8000-00000000000b')$q$, b, (select id from test.org where name = 'xa_site'))), 'B não usa origem de A (FK composta)';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Dono de outra org', 'ffffffff-0000-4000-8000-000000000001')$q$, b)), 'responsável precisa ser membro da própria organização';
  raise notice 'PASS: isolamento entre organizações, inclusive referências cruzadas';
end $$;
reset role;

-- referência cruzada a uma empresa real de A (criada por S1 em org A)
do $$
declare comp_a uuid := (select id from public.crm_companies where name = 'Empresa do S1');
begin
  perform set_config('test.comp_a', comp_a::text, false);
end $$;
:as_b
do $$
declare b uuid := (select id from test.org where name = 'xb'); stb uuid := (select id from test.org where name = 'xb_prosp');
begin
  assert test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, company_id, owner_id) values (%L, 'Empresa de A em B', 1, %L, %L, 'ffffffff-0000-4000-8000-00000000000b')$q$, b, stb, current_setting('test.comp_a'))), 'B não referencia empresa de A (FK composta)';
  raise notice 'PASS: oportunidade não aceita empresa de outra organização';
end $$;
reset role;

-- ================= remover membro não apaga nem trava os registros =================
:as_a
do $$
begin
  assert test.affected($q$delete from public.organization_members where user_id = 'ffffffff-0000-4000-8000-000000000002'$q$) = 1, 'owner remove o vendedor S2';
  raise notice 'PASS: remoção de membro com registros próprios';
end $$;
reset role;
do $$
begin
  assert (select owner_id from public.crm_leads where name = 'Lead do S2') is null, 'lead do membro removido fica sem responsável';
  assert (select count(*) from public.crm_leads where name = 'Lead do S2') = 1, 'o lead não foi apagado';
end $$;
:as_m
do $$ begin assert (select count(*) from public.crm_leads where name = 'Lead do S2') = 1, 'gerente enxerga lead sem responsável'; raise notice 'PASS: lead sem responsável visível à gestão'; end $$;
reset role;
:as_s1
do $$ begin assert (select count(*) from public.crm_leads where name = 'Lead do S2') = 0, 'vendedor não enxerga lead sem responsável'; raise notice 'PASS: vendedor não enxerga lead sem responsável'; end $$;
reset role;

-- ================= nomes exibidos e anon =================
:as_s1
do $$
declare a uuid := (select id from test.org where name = 'xa'); b uuid := (select id from test.org where name = 'xb');
begin
  assert (select count(*) from public.crm_user_labels(a)) >= 4, 'vendedor obtém nomes da própria equipe';
  assert (select count(*) from public.crm_user_labels(b)) = 0, 'vendedor não obtém nomes de outra organização';
  assert not exists (select 1 from public.crm_user_labels(a) where label like '%@%'), 'rótulo não expõe e-mail completo';
  raise notice 'PASS: rótulos de usuário só da própria organização e sem e-mail completo';
end $$;
reset role;
:as_anon
do $$
declare a uuid := (select id from test.org where name = 'xa');
begin
  assert test.throws('select * from public.crm_leads'), 'anon não lê leads';
  assert test.throws(format('select * from public.crm_kpis(%L, current_date, current_date)', a)), 'anon não executa indicadores';
  assert test.throws(format('select public.crm_user_labels(%L)', a)), 'anon não executa rótulos';
  assert test.throws($q$select public.crm_convert_lead(gen_random_uuid(), 'x', 1, gen_random_uuid())$q$), 'anon não converte lead';
  raise notice 'PASS: anon sem acesso ao CRM';
end $$;
reset role;

rollback;
