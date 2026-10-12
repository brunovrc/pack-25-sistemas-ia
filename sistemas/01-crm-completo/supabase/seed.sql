-- ============================================================================================
-- DADOS DE DEMONSTRAÇÃO — SOMENTE DESENVOLVIMENTO LOCAL
-- Executado automaticamente por `supabase db reset` (nunca no Supabase hospedado, a menos que você
-- rode este arquivo manualmente: NÃO faça isso em produção). Tudo aqui é FICTÍCIO e determinístico
-- (sem random()): rodar de novo gera sempre os mesmos dados. Para remover: apague a organização
-- "Empresa Demonstração" (as tabelas em cascata limpam o resto) ou rode `supabase db reset`.
--
-- Usuários de demonstração (senha local única: DemoLocal#2026):
--   dono@demo.exemplo       proprietário  (exige cadastrar verificação em duas etapas no primeiro acesso)
--   gerente@demo.exemplo    gerente       (vê todos os dados e as metas)
--   vendedor1@demo.exemplo  vendedor      (vê só os próprios leads e oportunidades)
--   vendedor2@demo.exemplo  vendedor
--   leitor@demo.exemplo     leitor        (somente leitura)
-- ============================================================================================

do $$
declare
  org uuid := 'd3d3d3d3-0000-4000-8000-000000000001';
  u_dono uuid := 'd3d3d3d3-0000-4000-8000-0000000000a1';
  u_ger uuid := 'd3d3d3d3-0000-4000-8000-0000000000a2';
  u_v1 uuid := 'd3d3d3d3-0000-4000-8000-0000000000a3';
  u_v2 uuid := 'd3d3d3d3-0000-4000-8000-0000000000a4';
  u_leitor uuid := 'd3d3d3d3-0000-4000-8000-0000000000a5';
  pw text := extensions.crypt('DemoLocal#2026', extensions.gen_salt('bf'));
  firsts text[] := array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Heitor','Isabela','João'];
  lasts text[] := array['Almeida','Barros','Castro','Duarte','Esteves','Ferraz','Gomes','Hosana','Ibrahim','Jardim'];
  comps text[] := array['Alfa Tecnologia','Beta Alimentos','Gama Logística','Delta Saúde','Épsilon Educação','Zeta Construções','Eta Moda','Teta Energia','Iota Consultoria','Kappa Agro','Lambda Seguros','Mi Varejo'];
  segs text[] := array['Tecnologia','Alimentos','Logística','Saúde','Educação','Construção','Varejo','Energia','Serviços','Agronegócio','Seguros','Varejo'];
  src_ids uuid[]; open_stages uuid[]; won_stage uuid; lost_stage uuid; reason_ids uuid[];
  comp_ids uuid[] := '{}'; comp uuid; cont uuid; opp uuid; ow uuid; i int; st uuid; closed timestamptz; team uuid;
  month_start date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
begin
  if exists (select 1 from public.organizations where id = org) then
    return; -- já semeado
  end if;

  -- ---------------------------------------------------------------- usuários (login por e-mail e senha)
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email, pw, now(),
         '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v.nome), now(), now(), '', '', '', ''
  from (values (u_dono, 'dono@demo.exemplo', 'Marina Proprietária'), (u_ger, 'gerente@demo.exemplo', 'Rafael Gerente'),
               (u_v1, 'vendedor1@demo.exemplo', 'Camila Vendas'), (u_v2, 'vendedor2@demo.exemplo', 'Diego Vendas'),
               (u_leitor, 'leitor@demo.exemplo', 'Lívia Leitora')) as v(id, email, nome);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.email, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u where u.id in (u_dono, u_ger, u_v1, u_v2, u_leitor);
  update public.profiles p set full_name = u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p.id and u.id in (u_dono, u_ger, u_v1, u_v2, u_leitor);

  -- ---------------------------------------------------------------- organização (os padrões do CRM nascem por gatilho)
  insert into public.organizations (id, name, slug) values (org, 'Empresa Demonstração (dados fictícios)', 'demo');
  insert into public.organization_settings (organization_id, display_name, theme) values (org, 'Empresa Demonstração', '{"primary":"#162a43"}'::jsonb);
  insert into public.organization_members (organization_id, user_id, role) values
    (org, u_dono, 'owner'), (org, u_ger, 'manager'), (org, u_v1, 'member'), (org, u_v2, 'member'), (org, u_leitor, 'viewer');

  select array_agg(id order by name) into src_ids from public.crm_lead_sources where organization_id = org;
  select array_agg(id order by position) into open_stages from public.crm_pipeline_stages where organization_id = org and kind = 'open';
  select id into won_stage from public.crm_pipeline_stages where organization_id = org and kind = 'won';
  select id into lost_stage from public.crm_pipeline_stages where organization_id = org and kind = 'lost';
  select array_agg(id order by name) into reason_ids from public.crm_loss_reasons where organization_id = org;

  insert into public.crm_teams (organization_id, name) values (org, 'Time Comercial') returning id into team;
  insert into public.crm_team_members (team_id, organization_id, user_id) values (team, org, u_v1), (team, org, u_v2);

  -- ---------------------------------------------------------------- empresas e contatos
  for i in 1..12 loop
    insert into public.crm_companies (organization_id, name, segment, phone, website, owner_id, created_at)
    values (org, comps[i], segs[i], format('(11) 4000-%s', lpad((1000 + i)::text, 4, '0')), format('https://www.exemplo-%s.invalid', i), case when i % 2 = 0 then u_v1 else u_v2 end, now() - (i * interval '3 days'))
    returning id into comp;
    comp_ids := comp_ids || comp;
  end loop;
  for i in 1..20 loop
    insert into public.crm_contacts (organization_id, company_id, name, email, phone, job_title, owner_id, created_at)
    values (org, comp_ids[((i - 1) % 12) + 1], firsts[(i % 10) + 1] || ' ' || lasts[((i * 3) % 10) + 1], format('contato%s@exemplo.invalid', i), format('(11) 9%s', lpad((70000000 + i * 137)::text, 8, '0')),
            (array['Diretor(a)','Gerente','Comprador(a)','Sócio(a)'])[(i % 4) + 1], case when i % 2 = 0 then u_v1 else u_v2 end, now() - (i * interval '2 days'));
  end loop;

  -- ---------------------------------------------------------------- leads (40)
  for i in 1..40 loop
    insert into public.crm_leads (organization_id, name, company_name, email, phone, job_title, source_id, status, temperature, owner_id, created_at)
    values (org, firsts[(i % 10) + 1] || ' ' || lasts[((i * 7) % 10) + 1], comps[((i + 3) % 12) + 1], format('lead%s@exemplo.invalid', i), format('(21) 9%s', lpad((60000000 + i * 211)::text, 8, '0')),
            (array['Diretor(a)','Gerente','Analista','Sócio(a)'])[(i % 4) + 1], src_ids[(i % 6) + 1],
            case when i % 7 = 0 then 'unqualified' when i % 5 = 0 then 'qualified' when i % 3 = 0 then 'contacted' else 'new' end::public.crm_lead_status,
            (array['cold','warm','hot'])[(i % 3) + 1]::public.crm_temperature, case when i % 2 = 0 then u_v1 else u_v2 end, now() - (i * interval '2 days'));
  end loop;

  -- ---------------------------------------------------------------- oportunidades (36): abertas, ganhas e perdidas
  for i in 1..36 loop
    ow := case when i % 2 = 0 then u_v1 else u_v2 end;
    closed := now() - ((i * 2) % 80 + 1) * interval '1 day';
    if i % 4 = 0 then
      insert into public.crm_opportunities (organization_id, title, company_id, value, stage_id, owner_id, source_id, closed_at, created_at)
      values (org, 'Contrato ' || comps[((i - 1) % 12) + 1], comp_ids[((i - 1) % 12) + 1], 1500 + (i * 1337) % 24000 + (i % 100) / 100.0, won_stage, ow, src_ids[(i % 6) + 1], closed, closed - interval '20 days');
    elsif i % 6 = 0 then
      insert into public.crm_opportunities (organization_id, title, company_id, value, stage_id, owner_id, source_id, closed_at, loss_reason_id, created_at)
      values (org, 'Proposta ' || comps[((i - 1) % 12) + 1], comp_ids[((i - 1) % 12) + 1], 1200 + (i * 911) % 18000 + (i % 100) / 100.0, lost_stage, ow, src_ids[(i % 6) + 1], closed, reason_ids[(i % 6) + 1], closed - interval '15 days');
    else
      st := open_stages[(i % 4) + 1];
      insert into public.crm_opportunities (organization_id, title, company_id, value, stage_id, owner_id, source_id, expected_close_date, created_at)
      values (org, 'Projeto ' || comps[((i - 1) % 12) + 1], comp_ids[((i - 1) % 12) + 1], 2000 + (i * 1733) % 30000 + (i % 100) / 100.0, st, ow, src_ids[(i % 6) + 1],
              (now() at time zone 'America/Sao_Paulo')::date + ((i * 3) % 40) - 5, now() - ((i % 25) + 1) * interval '1 day');
    end if;
  end loop;

  -- ---------------------------------------------------------------- atividades (25), algumas atrasadas
  for i in 1..25 loop
    select id into opp from public.crm_opportunities where organization_id = org and status = 'open' order by created_at, id offset (i % 12) limit 1;
    insert into public.crm_activities (organization_id, kind, title, due_at, completed_at, priority, owner_id, opportunity_id)
    values (org, (array['follow_up','call','meeting','task','email'])[(i % 5) + 1]::public.crm_activity_kind,
            (array['Retornar contato','Enviar proposta revisada','Agendar apresentação','Confirmar decisores','Cobrar resposta'])[(i % 5) + 1],
            now() + ((i % 9) - 5) * interval '1 day', case when i % 4 = 0 then now() - interval '1 day' else null end,
            (array['low','medium','high'])[(i % 3) + 1]::public.crm_priority, case when i % 2 = 0 then u_v1 else u_v2 end, opp);
  end loop;

  -- ---------------------------------------------------------------- metas do mês
  insert into public.crm_goals (organization_id, scope, user_id, team_id, period_start, period_end, target_amount) values
    (org, 'user', u_v1, null, month_start, (month_start + interval '1 month - 1 day')::date, 40000.00),
    (org, 'user', u_v2, null, month_start, (month_start + interval '1 month - 1 day')::date, 30000.00),
    (org, 'team', null, team, month_start, (month_start + interval '1 month - 1 day')::date, 70000.00);
end $$;
