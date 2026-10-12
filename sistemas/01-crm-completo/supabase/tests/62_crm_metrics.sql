-- CRM: indicadores com fixtures determinísticas (docs/METRICS.md). Valores esperados calculados à mão.
-- Fuso: America/Sao_Paulo (UTC-3, sem horário de verão em 2026). Período P = 2026-09-01 .. 2026-09-30.
-- Vendedores R1 e R2; equipe T = {R1}.
--
--  # dono  status valor     fechamento (UTC)             observação
--  1 R1    ganha  1000.10   2026-09-02 12:00             origem Site
--  2 R1    ganha  2000.20   2026-09-10 12:00             origem Site
--  3 R2    ganha   500.05   2026-09-15 12:00             origem Indicação
--  4 R2    perdida 300.00   2026-09-20 12:00             motivo Preço
--  5 R1    perdida 700.00   2026-09-25 12:00
--  6 R1    aberta 1500.00   —                            etapa Proposta
--  7 R2    aberta  250.50   —                            etapa Prospecção
--  8 R2    aberta    0.00   —                            etapa Prospecção (valor zero)
--  9 R1    ganha   100.00   2026-10-01 02:59:59          = 30/09 23:59:59 em Brasília (DENTRO de P)
-- 10 R1    ganha   999.99   2026-10-01 03:00:00          = 01/10 00:00:00 em Brasília (FORA de P)
-- 11 R2    ganha    50.00   2026-09-01 03:00:00          = 01/09 00:00:00 em Brasília (DENTRO de P)
-- 12 R2    ganha    77.77   2026-09-01 02:59:59          = 31/08 23:59:59 em Brasília (FORA de P)

\set as_o 'select set_config(''request.jwt.claims'', ''{"sub":"f2f2f2f2-0000-4000-8000-00000000000a","aal":"aal2"}'', true); set local role authenticated;'
\set as_r1 'select set_config(''request.jwt.claims'', ''{"sub":"f2f2f2f2-0000-4000-8000-000000000001","aal":"aal1"}'', true); set local role authenticated;'
\set as_r2 'select set_config(''request.jwt.claims'', ''{"sub":"f2f2f2f2-0000-4000-8000-000000000002","aal":"aal1"}'', true); set local role authenticated;'
\set as_v 'select set_config(''request.jwt.claims'', ''{"sub":"f2f2f2f2-0000-4000-8000-000000000003","aal":"aal1"}'', true); set local role authenticated;'

begin;

insert into auth.users (id, email) values
  ('f2f2f2f2-0000-4000-8000-00000000000a', 'o@metricas.invalid'),
  ('f2f2f2f2-0000-4000-8000-000000000001', 'r1@metricas.invalid'),
  ('f2f2f2f2-0000-4000-8000-000000000002', 'r2@metricas.invalid'),
  ('f2f2f2f2-0000-4000-8000-000000000003', 'v@metricas.invalid');

:as_o
do $$ begin perform public.create_organization('Métricas', 'metricas'); end $$;
reset role;
insert into test.org select 'f', id from public.organizations where slug = 'metricas';

-- ===== fixtures (como administrador do banco; datas explícitas) =====
do $$
declare
  f uuid := (select id from test.org where name = 'f');
  r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; r2 uuid := 'f2f2f2f2-0000-4000-8000-000000000002';
  ganho uuid; perdido uuid; prosp uuid; propo uuid; site uuid; indic uuid; preco uuid; team uuid;
begin
  insert into public.organization_members (organization_id, user_id, role) values
    (f, r1, 'member'), (f, r2, 'member'), (f, 'f2f2f2f2-0000-4000-8000-000000000003', 'viewer');
  select id into ganho from public.crm_pipeline_stages where organization_id = f and name = 'Ganho';
  select id into perdido from public.crm_pipeline_stages where organization_id = f and name = 'Perdido';
  select id into prosp from public.crm_pipeline_stages where organization_id = f and name = 'Prospecção';
  select id into propo from public.crm_pipeline_stages where organization_id = f and name = 'Proposta';
  select id into site from public.crm_lead_sources where organization_id = f and name = 'Site';
  select id into indic from public.crm_lead_sources where organization_id = f and name = 'Indicação';
  select id into preco from public.crm_loss_reasons where organization_id = f and name = 'Preço';

  insert into public.crm_teams (organization_id, name) values (f, 'Time Alfa') returning id into team;
  insert into public.crm_team_members (team_id, organization_id, user_id) values (team, f, r1);

  insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id, source_id, closed_at, loss_reason_id) values
    (f, 'Opp 01', 1000.10, ganho,   r1, site,  '2026-09-02 12:00:00+00', null),
    (f, 'Opp 02', 2000.20, ganho,   r1, site,  '2026-09-10 12:00:00+00', null),
    (f, 'Opp 03',  500.05, ganho,   r2, indic, '2026-09-15 12:00:00+00', null),
    (f, 'Opp 04',  300.00, perdido, r2, null,  '2026-09-20 12:00:00+00', preco),
    (f, 'Opp 05',  700.00, perdido, r1, null,  '2026-09-25 12:00:00+00', preco),
    (f, 'Opp 06', 1500.00, propo,   r1, null,  null, null),
    (f, 'Opp 07',  250.50, prosp,   r2, null,  null, null),
    (f, 'Opp 08',    0.00, prosp,   r2, null,  null, null),
    (f, 'Opp 09',  100.00, ganho,   r1, null,  '2026-10-01 02:59:59+00', null),
    (f, 'Opp 10',  999.99, ganho,   r1, null,  '2026-10-01 03:00:00+00', null),
    (f, 'Opp 11',   50.00, ganho,   r2, null,  '2026-09-01 03:00:00+00', null),
    (f, 'Opp 12',   77.77, ganho,   r2, null,  '2026-09-01 02:59:59+00', null);

  insert into public.crm_leads (organization_id, name, status, source_id, owner_id, created_at, archived_at, converted_at) values
    (f, 'Lead 1', 'new',         site,  r1, '2026-09-03 12:00:00+00', null, null),
    (f, 'Lead 2', 'contacted',   site,  r1, '2026-09-12 12:00:00+00', null, null),
    (f, 'Lead 3', 'qualified',   indic, r2, '2026-09-14 12:00:00+00', null, null),
    (f, 'Lead 4', 'unqualified', null,  r2, '2026-09-15 12:00:00+00', null, null),
    (f, 'Lead 5', 'new',         site,  r2, '2026-10-01 03:00:00+00', '2026-10-02 12:00:00+00', null),
    (f, 'Lead 6', 'converted',   site,  r2, '2026-09-16 12:00:00+00', null, '2026-09-17 12:00:00+00');

  insert into public.crm_goals (organization_id, scope, user_id, team_id, period_start, period_end, target_amount) values
    (f, 'user', r1, null, '2026-09-01', '2026-09-30', 5000.00),
    (f, 'team', null, team, '2026-09-01', '2026-09-30', 3100.30),
    (f, 'user', r2, null, '2026-09-01', '2026-09-30', 500.00);
end $$;

-- ================= indicadores do período P =================
:as_o
do $$
declare f uuid := (select id from test.org where name = 'f'); k record;
begin
  select * into k from public.crm_kpis(f, '2026-09-01', '2026-09-30');
  assert k.pipeline_value = 1750.50, 'pipeline ativo = 1500.00 + 250.50 + 0.00';
  assert k.pipeline_count = 3, 'oportunidades abertas';
  assert k.won_value = 3650.35, 'vendas ganhas (inclui 30/09 23:59:59 e 01/09 00:00:00; exclui 31/08 e 01/10)';
  assert k.won_count = 5, 'negócios ganhos';
  assert k.lost_count = 2, 'negócios perdidos';
  assert k.conversion_rate = 71.43, 'conversão = 5 / (5 + 2)';
  assert k.avg_ticket = 730.07, 'ticket médio = 3650.35 / 5';
  assert k.active_leads = 3, 'leads ativos (novo, contatado, qualificado; sem arquivado, convertido, desqualificado)';
  raise notice 'PASS: indicadores do período (centavos, fronteiras de fuso, conversão, ticket médio)';
end $$;

do $$
declare f uuid := (select id from test.org where name = 'f'); r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; k record;
  team uuid := (select id from public.crm_teams where organization_id = (select id from test.org where name = 'f') limit 1);
  site uuid := (select id from public.crm_lead_sources where organization_id = (select id from test.org where name = 'f') and name = 'Site');
begin
  select * into k from public.crm_kpis(f, '2026-09-01', '2026-09-30', r1);
  assert k.pipeline_value = 1500.00 and k.pipeline_count = 1, 'filtro por vendedor: pipeline';
  assert k.won_value = 3100.30 and k.won_count = 3 and k.lost_count = 1, 'filtro por vendedor: ganhos e perdas';
  assert k.conversion_rate = 75.00, 'conversão do vendedor = 3 / 4';
  assert k.avg_ticket = 1033.43, 'ticket médio do vendedor = 3100.30 / 3';
  assert k.active_leads = 2, 'leads ativos do vendedor';

  select * into k from public.crm_kpis(f, '2026-09-01', '2026-09-30', null, team);
  assert k.won_value = 3100.30 and k.won_count = 3 and k.pipeline_value = 1500.00, 'filtro por equipe = vendedores da equipe';

  select * into k from public.crm_kpis(f, '2026-09-01', '2026-09-30', null, null, site);
  assert k.won_value = 3000.30 and k.won_count = 2 and k.lost_count = 0, 'filtro por origem Site';
  assert k.conversion_rate = 100.00, 'conversão por origem = 2 / 2';
  assert k.pipeline_count = 0 and k.pipeline_value = 0, 'sem oportunidades abertas na origem Site';
  assert k.avg_ticket = 1500.15, 'ticket médio por origem';
  assert k.active_leads = 2, 'leads ativos por origem (arquivado e convertido não contam)';
  raise notice 'PASS: filtros de vendedor, equipe e origem';
end $$;

do $$
declare f uuid := (select id from test.org where name = 'f'); k record;
begin
  select * into k from public.crm_kpis(f, '2025-01-01', '2025-01-31');
  assert k.won_value = 0 and k.won_count = 0 and k.lost_count = 0, 'período vazio: zeros reais';
  assert k.conversion_rate is null, 'sem negócios encerrados: conversão é nula, não zero';
  assert k.avg_ticket is null, 'sem ganhos: ticket médio é nulo (sem divisão por zero)';
  assert k.pipeline_value = 1750.50 and k.pipeline_count = 3, 'pipeline é instantâneo: não depende do período';
  assert k.active_leads = 3, 'leads ativos também é instantâneo';

  assert (select won_value from public.crm_kpis(f, '2026-09-30', '2026-09-30')) = 100.00, 'dia 30/09 inclui 23:59:59';
  assert (select won_value from public.crm_kpis(f, '2026-10-01', '2026-10-01')) = 999.99, 'dia 01/10 começa à meia-noite de Brasília';
  assert (select won_value from public.crm_kpis(f, '2026-08-31', '2026-08-31')) = 77.77, 'dia 31/08 inclui 23:59:59';
  assert (select won_value from public.crm_kpis(f, '2026-09-01', '2026-09-01')) = 50.00, 'dia 01/09 começa à meia-noite de Brasília';
  assert (select won_value from public.crm_kpis(f, '2026-09-02', '2026-09-02')) = 1000.10, 'um único dia';

  assert (select count(*) from public.crm_kpis(gen_random_uuid(), '2026-09-01', '2026-09-30')) = 1, 'organização desconhecida: ainda uma linha';
  assert (select won_value from public.crm_kpis(gen_random_uuid(), '2026-09-01', '2026-09-30')) = 0, 'organização desconhecida: sem dados vazados';
  assert test.throws(format($q$select * from public.crm_kpis(%L, '2026-09-30', '2026-09-01')$q$, f)), 'período invertido é recusado';
  assert test.throws($q$select * from public.crm_kpis(null, '2026-09-01', '2026-09-30')$q$), 'organização obrigatória';
  assert test.throws(format($q$select * from public.crm_kpis(%L, null, '2026-09-30')$q$, f)), 'datas obrigatórias';
  raise notice 'PASS: período vazio, divisão por zero, datas-limite e entradas inválidas';
end $$;

-- ================= série de vendas =================
do $$
declare f uuid := (select id from test.org where name = 'f'); n int;
begin
  assert (select count(*) from public.crm_sales_series(f, '2026-09-01', '2026-09-30')) = 5, 'cinco semanas (segunda a domingo)';
  assert (select won_value from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-08-31') = 1050.10, 'semana de 31/08 (opp 01 + opp 11)';
  assert (select won_count from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-08-31') = 2, 'ganhos da semana de 31/08';
  assert (select won_value from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-09-07') = 2000.20, 'semana de 07/09';
  assert (select won_value from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-09-14') = 500.05, 'semana de 14/09';
  assert (select lost_count from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-09-14') = 1, 'perda de 20/09 cai na semana de 14/09';
  assert (select won_value from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-09-21') = 0, 'semana sem ganhos aparece com zero';
  assert (select lost_count from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-09-21') = 1, 'perda de 25/09 cai na semana de 21/09';
  assert (select won_value from public.crm_sales_series(f, '2026-09-01', '2026-09-30') where bucket = '2026-09-28') = 100.00, 'semana de 28/09 (opp 09 às 23:59:59)';
  assert (select sum(won_value) from public.crm_sales_series(f, '2026-09-01', '2026-09-30')) = (select won_value from public.crm_kpis(f, '2026-09-01', '2026-09-30')), 'soma da série = vendas ganhas do período';
  assert (select sum(won_count + lost_count) from public.crm_sales_series(f, '2026-09-01', '2026-09-30')) = 7, 'total de encerrados na série';

  assert (select count(*) from public.crm_sales_series(f, '2026-06-01', '2026-10-31')) = 5, 'período > 90 dias agrupa por mês (jun a out)';
  assert (select won_value from public.crm_sales_series(f, '2026-06-01', '2026-10-31') where bucket = '2026-08-01') = 77.77, 'agosto';
  assert (select won_value from public.crm_sales_series(f, '2026-06-01', '2026-10-31') where bucket = '2026-09-01') = 3650.35, 'setembro';
  assert (select won_value from public.crm_sales_series(f, '2026-06-01', '2026-10-31') where bucket = '2026-10-01') = 999.99, 'outubro';
  assert (select won_value from public.crm_sales_series(f, '2026-06-01', '2026-10-31') where bucket = '2026-06-01') = 0, 'mês vazio aparece com zero';
  assert (select count(*) from public.crm_sales_series(f, '2026-09-01', '2026-09-01')) = 1, 'um único dia gera um bucket';
  raise notice 'PASS: série de vendas por semana e por mês, com zeros e fronteiras';
end $$;

-- ================= funil e origem dos leads =================
do $$
declare f uuid := (select id from test.org where name = 'f'); r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; r2 uuid := 'f2f2f2f2-0000-4000-8000-000000000002';
begin
  assert (select count(*) from public.crm_funnel(f)) = 4, 'funil mostra as quatro etapas abertas';
  assert (select opp_count from public.crm_funnel(f) where stage_name = 'Prospecção') = 2, 'Prospecção: 2';
  assert (select opp_value from public.crm_funnel(f) where stage_name = 'Prospecção') = 250.50, 'Prospecção: valor';
  assert (select opp_count from public.crm_funnel(f) where stage_name = 'Proposta') = 1, 'Proposta: 1';
  assert (select opp_value from public.crm_funnel(f) where stage_name = 'Proposta') = 1500.00, 'Proposta: valor';
  assert (select opp_count from public.crm_funnel(f) where stage_name = 'Negociação') = 0, 'etapa vazia aparece com zero';
  assert (select array_agg(stage_name order by stage_position) from public.crm_funnel(f)) = array['Prospecção', 'Qualificação', 'Proposta', 'Negociação'], 'ordem das etapas';
  assert (select opp_count from public.crm_funnel(f, r1) where stage_name = 'Prospecção') = 0, 'funil do vendedor R1';
  assert (select opp_value from public.crm_funnel(f, r2) where stage_name = 'Prospecção') = 250.50, 'funil do vendedor R2';

  assert (select lead_count from public.crm_lead_sources_chart(f, '2026-09-01', '2026-09-30') where source_name = 'Site') = 3, 'origem Site: leads 1, 2 e 6';
  assert (select lead_count from public.crm_lead_sources_chart(f, '2026-09-01', '2026-09-30') where source_name = 'Indicação') = 1, 'origem Indicação';
  assert (select lead_count from public.crm_lead_sources_chart(f, '2026-09-01', '2026-09-30') where source_name = 'Sem origem') = 1, 'lead sem origem';
  assert (select sum(lead_count) from public.crm_lead_sources_chart(f, '2026-09-01', '2026-09-30')) = 5, 'lead 5 (criado em 01/10 BRT) fica de fora';
  assert (select array_agg(source_name order by lead_count desc, source_name) from public.crm_lead_sources_chart(f, '2026-09-01', '2026-09-30')) = array['Site', 'Indicação', 'Sem origem'], 'ordenação por contagem';
  assert (select count(*) from public.crm_lead_sources_chart(f, '2025-01-01', '2025-01-31')) = 0, 'sem leads: sem linhas';
  raise notice 'PASS: funil e origem dos leads';
end $$;

-- ================= metas e ranking =================
do $$
declare f uuid := (select id from test.org where name = 'f'); r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; r2 uuid := 'f2f2f2f2-0000-4000-8000-000000000002';
  team uuid := (select id from public.crm_teams where organization_id = (select id from test.org where name = 'f') limit 1);
begin
  assert (select count(*) from public.crm_goals_progress(f, '2026-09-01', '2026-09-30')) = 3, 'três metas no período';
  assert (select realized from public.crm_goals_progress(f, '2026-09-01', '2026-09-30') where scope = 'user' and user_id = r1) = 3100.30, 'realizado do R1 dentro do período da meta';
  assert (select pct from public.crm_goals_progress(f, '2026-09-01', '2026-09-30') where scope = 'user' and user_id = r1) = 62.01, '62,006% arredondado';
  assert (select pct from public.crm_goals_progress(f, '2026-09-01', '2026-09-30') where scope = 'team') = 100.00, 'meta da equipe atingida';
  assert (select realized from public.crm_goals_progress(f, '2026-09-01', '2026-09-30') where scope = 'user' and user_id = r2) = 550.05, 'realizado do R2 (opps 03 e 11)';
  assert (select pct from public.crm_goals_progress(f, '2026-09-01', '2026-09-30') where scope = 'user' and user_id = r2) = 110.01, 'meta superada passa de 100%';
  assert (select elapsed_pct from public.crm_goals_progress(f, '2026-09-01', '2026-09-30') where scope = 'user' and user_id = r1) = 100.00, 'período passado: 100% decorrido';
  assert (select count(*) from public.crm_goals_progress(f, '2026-11-01', '2026-11-30')) = 0, 'sem metas fora do período';
  assert (select count(*) from public.crm_goals_progress(f, '2026-09-30', '2026-09-30')) = 3, 'meta que termina no dia consultado conta';
  assert (select count(*) from public.crm_goals_progress(f, '2026-09-01', '2026-09-30', r1)) = 2, 'filtro vendedor: meta dele + meta da equipe dele';
  assert (select count(*) from public.crm_goals_progress(f, '2026-09-01', '2026-09-30', null, team)) = 2, 'filtro equipe: meta da equipe + meta de quem é da equipe';

  assert (select user_id from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') limit 1) = r1, 'R1 lidera por valor ganho';
  assert (select won_value from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r1) = 3100.30, 'valor ganho do R1';
  assert (select won_count from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r1) = 3, 'ganhos do R1';
  assert (select conversion_rate from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r1) = 75.00, 'conversão do R1';
  assert (select goals_met from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r1) = 0, 'R1 não bateu a meta individual (62%)';
  assert (select won_value from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r2) = 550.05, 'valor ganho do R2';
  assert (select conversion_rate from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r2) = 66.67, 'conversão do R2 = 2 / 3';
  assert (select goals_met from public.crm_rep_performance(f, '2026-09-01', '2026-09-30') where user_id = r2) = 1, 'R2 bateu a meta individual';
  assert (select count(*) from public.crm_rep_performance(f, '2026-09-01', '2026-09-30', r2)) = 1, 'filtro por vendedor no ranking';
  assert (select count(*) from public.crm_rep_performance(f, '2025-01-01', '2025-01-31')) = 2, 'sem encerrados: vendedores com zeros';
  assert (select conversion_rate from public.crm_rep_performance(f, '2025-01-01', '2025-01-31') where user_id = r1) is null, 'conversão nula sem encerrados';
  raise notice 'PASS: metas (realizado no período da própria meta) e ranking';
end $$;
reset role;

-- ================= alertas (datas relativas a hoje) =================
do $$
declare
  f uuid := (select id from test.org where name = 'f');
  r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; r2 uuid := 'f2f2f2f2-0000-4000-8000-000000000002';
  prosp uuid := (select id from public.crm_pipeline_stages where organization_id = (select id from test.org where name = 'f') and name = 'Prospecção');
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  team uuid := (select id from public.crm_teams where organization_id = (select id from test.org where name = 'f') limit 1);
  s1 uuid; s3 uuid;
begin
  -- atividades
  insert into public.crm_activities (organization_id, kind, title, due_at, completed_at, owner_id) values
    (f, 'follow_up', 'Atrasada A1', now() - interval '5 days 1 hour', null, r1),
    (f, 'task', 'Atrasada mas concluída', now() - interval '5 days', now() - interval '4 days', r1),
    (f, 'task', 'Futura', now() + interval '2 days', null, r1),
    (f, 'note', 'Nota sem prazo', null, null, r1);
  -- oportunidade parada há 20 dias (R1) e outra com atividade recente (não parada)
  insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (f, 'Parada S1', 800.00, prosp, r1) returning id into s1;
  insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (f, 'Com atividade S3', 900.00, prosp, r1) returning id into s3;
  update public.crm_opportunities set created_at = now() - interval '30 days' where id in (s1, s3);
  update public.crm_stage_history set changed_at = now() - interval '20 days 1 hour' where opportunity_id = s1;
  update public.crm_stage_history set changed_at = now() - interval '30 days' where opportunity_id = s3;
  insert into public.crm_activities (organization_id, kind, title, completed_at, owner_id, opportunity_id) values (f, 'call', 'Ligação recente', now() - interval '2 days', r1, s3);
  -- fechamento próximo
  insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id, expected_close_date) values
    (f, 'Fecha em 3 dias', 100, prosp, r1, today + 3),
    (f, 'Fecha hoje', 200, prosp, r2, today),
    (f, 'Fecha em 8 dias', 300, prosp, r1, today + 8),
    (f, 'Já passou', 400, prosp, r1, today - 1);
  -- metas: uma abaixo do ritmo (R2) e uma sem tempo decorrido suficiente (equipe)
  insert into public.crm_goals (organization_id, scope, user_id, team_id, period_start, period_end, target_amount) values
    (f, 'user', r2, null, today - 10, today + 10, 100.00),
    (f, 'team', null, team, today - 3, today + 27, 1000.00);
end $$;

:as_o
do $$
declare f uuid := (select id from test.org where name = 'f'); r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; r2 uuid := 'f2f2f2f2-0000-4000-8000-000000000002';
begin
  assert (select count(*) from public.crm_alerts(f) where kind = 'overdue_activity') = 1, 'só a atividade atrasada e não concluída';
  assert (select days from public.crm_alerts(f) where kind = 'overdue_activity') = 5, 'dias de atraso (5 dias e 1 hora = 5)';
  assert (select title from public.crm_alerts(f) where kind = 'stale_opportunity') = 'Parada S1', 'oportunidade parada';
  assert (select count(*) from public.crm_alerts(f) where kind = 'stale_opportunity') = 1, 'atividade recente tira a oportunidade da lista de paradas';
  assert (select days from public.crm_alerts(f) where kind = 'stale_opportunity') = 20, 'dias parada';
  assert (select count(*) from public.crm_alerts(f) where kind = 'closing_soon') = 2, 'fecham em até 7 dias: hoje e em 3 dias';
  assert (select min(days) from public.crm_alerts(f) where kind = 'closing_soon') = 0, 'fecha hoje';
  assert (select max(days) from public.crm_alerts(f) where kind = 'closing_soon') = 3, 'fecha em 3 dias';
  assert (select count(*) from public.crm_alerts(f) where kind = 'goal_pace') = 1, 'meta abaixo do ritmo (R2); a da equipe ainda tem < 25% decorrido';
  assert (select detail from public.crm_alerts(f) where kind = 'goal_pace') = 0.00, 'percentual atingido da meta em alerta';
  assert (select count(*) from public.crm_alerts(f, r1)) = 3, 'filtro R1: atrasada, parada e fechamento em 3 dias';
  assert (select count(*) from public.crm_alerts(f, r2)) = 2, 'filtro R2: fecha hoje e meta abaixo do ritmo';

  update public.crm_settings set stale_days = 30, closing_soon_days = 1 where organization_id = f;
  assert (select count(*) from public.crm_alerts(f) where kind = 'stale_opportunity') = 0, 'limite de parada configurável (30 dias)';
  assert (select count(*) from public.crm_alerts(f) where kind = 'closing_soon') = 1, 'limite de fechamento configurável (1 dia)';
  raise notice 'PASS: alertas (atraso, parada, fechamento próximo, ritmo de meta) e limites configuráveis';
end $$;
reset role;

-- ================= permissões nos indicadores (RLS vale dentro das funções) =================
:as_r1
do $$
declare f uuid := (select id from test.org where name = 'f'); r1 uuid := 'f2f2f2f2-0000-4000-8000-000000000001'; k record;
begin
  select * into k from public.crm_kpis(f, '2026-09-01', '2026-09-30');
  assert k.won_value = 3100.30 and k.won_count = 3, 'vendedor sem filtro vê apenas o próprio resultado';
  assert (select count(*) from public.crm_rep_performance(f, '2026-09-01', '2026-09-30')) = 1, 'ranking do vendedor contém só ele';
  assert (select user_id from public.crm_rep_performance(f, '2026-09-01', '2026-09-30')) = r1, 'e é ele mesmo';
  assert (select count(*) from public.crm_goals_progress(f, '2026-09-01', '2026-09-30')) = 2, 'metas: a individual e a da equipe dele';
  assert (select sum(opp_count) from public.crm_funnel(f)) = 6, 'funil só com as 6 oportunidades abertas dele (06, parada, com atividade, 3 de fechamento); as 3 do R2 ficam de fora';
  raise notice 'PASS: vendedor só enxerga os próprios números';
end $$;
reset role;
:as_r2
do $$
declare f uuid := (select id from test.org where name = 'f'); k record;
begin
  select * into k from public.crm_kpis(f, '2026-09-01', '2026-09-30');
  assert k.won_value = 550.05 and k.won_count = 2, 'outro vendedor vê só o dele';
  assert k.pipeline_value = 450.50, 'pipeline do R2 = 250.50 (opp 07) + 0.00 (opp 08) + 200.00 (fecha hoje)';
  raise notice 'PASS: indicadores isolados entre vendedores';
end $$;
reset role;
:as_v
do $$
declare f uuid := (select id from test.org where name = 'f');
begin
  assert (select won_value from public.crm_kpis(f, '2026-09-01', '2026-09-30')) = 3650.35, 'leitor vê o total da organização';
  assert (select count(*) from public.crm_rep_performance(f, '2026-09-01', '2026-09-30')) = 2, 'leitor vê o ranking completo';
  assert (select sum(opp_count) from public.crm_funnel(f)) = 9, 'leitor vê as 9 oportunidades abertas da empresa (6 do R1 + 3 do R2)';
  raise notice 'PASS: leitor vê os totais';
end $$;
reset role;

rollback;
