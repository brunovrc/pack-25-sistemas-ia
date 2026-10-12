-- CRM: regras de negócio (ciclo da oportunidade, leads, conversão atômica, restrições).
-- Org R: O (owner), S (member/vendedor), M (manager), V (viewer). Org Q: P (owner).

\set as_o 'select set_config(''request.jwt.claims'', ''{"sub":"f1f1f1f1-0000-4000-8000-00000000000a","aal":"aal2"}'', true); set local role authenticated;'
\set as_s 'select set_config(''request.jwt.claims'', ''{"sub":"f1f1f1f1-0000-4000-8000-000000000001","aal":"aal1"}'', true); set local role authenticated;'
\set as_m 'select set_config(''request.jwt.claims'', ''{"sub":"f1f1f1f1-0000-4000-8000-00000000000c","aal":"aal1"}'', true); set local role authenticated;'
\set as_v 'select set_config(''request.jwt.claims'', ''{"sub":"f1f1f1f1-0000-4000-8000-000000000003","aal":"aal1"}'', true); set local role authenticated;'
\set as_p 'select set_config(''request.jwt.claims'', ''{"sub":"f1f1f1f1-0000-4000-8000-00000000000b","aal":"aal2"}'', true); set local role authenticated;'

begin;

insert into auth.users (id, email) values
  ('f1f1f1f1-0000-4000-8000-00000000000a', 'o@regras.invalid'),
  ('f1f1f1f1-0000-4000-8000-00000000000b', 'p@regras.invalid'),
  ('f1f1f1f1-0000-4000-8000-00000000000c', 'm@regras.invalid'),
  ('f1f1f1f1-0000-4000-8000-000000000001', 's@regras.invalid'),
  ('f1f1f1f1-0000-4000-8000-000000000003', 'v@regras.invalid');

:as_o
do $$ begin perform public.create_organization('Regras R', 'regras-r'); end $$;
reset role;
:as_p
do $$ begin perform public.create_organization('Regras Q', 'regras-q'); end $$;
reset role;
insert into test.org select 'r', id from public.organizations where slug = 'regras-r';
insert into test.org select 'q', id from public.organizations where slug = 'regras-q';
insert into test.org select 'r_' || translate(lower(name), 'çãáàâéêíóôõú', 'caaaaeeiooou'), id from public.crm_pipeline_stages where organization_id = (select id from test.org where name = 'r');
insert into test.org select 'r_src_' || lower(name), id from public.crm_lead_sources where organization_id = (select id from test.org where name = 'r') and name = 'Site';
insert into test.org select 'r_reason', id from public.crm_loss_reasons where organization_id = (select id from test.org where name = 'r') and name = 'Preço';
insert into test.org select 'q_prosp', id from public.crm_pipeline_stages where organization_id = (select id from test.org where name = 'q') and name = 'Prospecção';

:as_o
do $$
declare r uuid := (select id from test.org where name = 'r');
begin
  insert into public.organization_members (organization_id, user_id, role) values
    (r, 'f1f1f1f1-0000-4000-8000-00000000000c', 'manager'),
    (r, 'f1f1f1f1-0000-4000-8000-000000000001', 'member'),
    (r, 'f1f1f1f1-0000-4000-8000-000000000003', 'viewer');
end $$;
reset role;

-- ================= ciclo da oportunidade =================
:as_o
do $$
declare
  r uuid := (select id from test.org where name = 'r');
  prosp uuid := (select id from test.org where name = 'r_prospeccao');
  qual uuid := (select id from test.org where name = 'r_qualificacao');
  negoc uuid := (select id from test.org where name = 'r_negociacao');
  ganho uuid := (select id from test.org where name = 'r_ganho');
  perdido uuid := (select id from test.org where name = 'r_perdido');
  reason uuid := (select id from test.org where name = 'r_reason');
  opp uuid; won_at timestamptz;
begin
  insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id)
  values (r, 'Contrato Alfa', 1000.50, prosp, 'f1f1f1f1-0000-4000-8000-00000000000a') returning id into opp;
  assert (select status from public.crm_opportunities where id = opp) = 'open', 'nasce aberta';
  assert (select probability from public.crm_opportunities where id = opp) = 10, 'herda a probabilidade da etapa';
  assert (select closed_at from public.crm_opportunities where id = opp) is null, 'aberta não tem fechamento';
  assert (select count(*) from public.crm_stage_history where opportunity_id = opp and from_stage_id is null and to_stage_id = prosp) = 1, 'histórico da criação';

  update public.crm_opportunities set stage_id = negoc where id = opp;
  assert (select probability from public.crm_opportunities where id = opp) = 75, 'probabilidade acompanha a nova etapa';
  assert (select count(*) from public.crm_stage_history where opportunity_id = opp) = 2, 'histórico da movimentação';

  update public.crm_opportunities set stage_id = ganho where id = opp;
  assert (select status from public.crm_opportunities where id = opp) = 'won', 'etapa Ganho encerra como ganha';
  assert (select probability from public.crm_opportunities where id = opp) = 100, 'ganha = 100%';
  won_at := (select closed_at from public.crm_opportunities where id = opp);
  assert won_at is not null, 'ganha tem data de fechamento';

  perform pg_sleep(0.05);
  update public.crm_opportunities set value = 2000.75 where id = opp;
  assert (select closed_at from public.crm_opportunities where id = opp) = won_at, 'editar valor não muda o fechamento original';

  perform pg_sleep(0.05);
  assert test.throws(format('update public.crm_opportunities set stage_id = %L where id = %L', perdido, opp)), 'perdida exige motivo';
  update public.crm_opportunities set stage_id = perdido, loss_reason_id = reason, loss_notes = 'Orçamento cortado' where id = opp;
  assert (select status from public.crm_opportunities where id = opp) = 'lost', 'etapa Perdido encerra como perdida';
  assert (select probability from public.crm_opportunities where id = opp) = 0, 'perdida = 0%';
  assert (select closed_at from public.crm_opportunities where id = opp) > won_at, 'ganho -> perdido: o fechamento é o momento da mudança';

  update public.crm_opportunities set stage_id = qual where id = opp;
  assert (select status from public.crm_opportunities where id = opp) = 'open', 'reabrir volta a aberta';
  assert (select closed_at from public.crm_opportunities where id = opp) is null, 'reaberta limpa o fechamento';
  assert (select loss_reason_id from public.crm_opportunities where id = opp) is null, 'reaberta limpa o motivo de perda';
  assert (select probability from public.crm_opportunities where id = opp) = 25, 'reaberta usa a probabilidade da etapa';
  assert (select count(*) from public.crm_stage_history where opportunity_id = opp) = 5, 'todas as movimentações registradas';
  raise notice 'PASS: ciclo da oportunidade (aberta, ganha, perdida com motivo, reaberta) e histórico';
end $$;
reset role;

:as_o
do $$
declare r uuid := (select id from test.org where name = 'r'); prosp uuid := (select id from test.org where name = 'r_prospeccao');
begin
  insert into public.crm_pipeline_stages (organization_id, name, position, kind, is_active) values (r, 'Inativa', 5, 'open', false);
  assert test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (%L, 'Em etapa inativa', 1, (select id from public.crm_pipeline_stages where name = 'Inativa' and organization_id = %L), 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r, r)), 'etapa desativada não recebe oportunidades novas';
  assert test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (%L, 'Valor negativo', -1, %L, 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r, prosp)), 'valor negativo é recusado';
  assert test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, probability, owner_id) values (%L, 'Prob 101', 1, %L, 101, 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r, prosp)), 'probabilidade fora de 0-100';
  assert test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, custom, owner_id) values (%L, 'Custom lista', 1, %L, '[]'::jsonb, 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r, prosp)), 'campos extensíveis precisam ser um objeto';
  assert not test.throws(format($q$insert into public.crm_opportunities (organization_id, title, value, stage_id, custom, expected_close_date, owner_id) values (%L, 'Com campo extra', 99.99, %L, '{"segmento_cliente":"varejo"}'::jsonb, '2026-12-31', 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r, prosp)), 'campos extensíveis e previsão de fechamento (data) funcionam';
  raise notice 'PASS: etapa inativa, valores e campos extensíveis';
end $$;
reset role;

-- ================= leads: normalização e duplicidade =================
:as_o
do $$
declare r uuid := (select id from test.org where name = 'r'); caught text;
begin
  insert into public.crm_leads (organization_id, name, email, owner_id) values (r, 'Maria Souza', '  Maria@Empresa.COM ', 'f1f1f1f1-0000-4000-8000-00000000000a');
  assert (select email from public.crm_leads where name = 'Maria Souza') = 'maria@empresa.com', 'e-mail normalizado';
  begin
    insert into public.crm_leads (organization_id, name, email, owner_id) values (r, 'Maria Duplicada', 'MARIA@empresa.com', 'f1f1f1f1-0000-4000-8000-00000000000a');
  exception when unique_violation then caught := 'unique';
  end;
  assert caught = 'unique', 'e-mail duplicado entre leads ativos é barrado (sem diferenciar maiúsculas)';
  update public.crm_leads set archived_at = now() where name = 'Maria Souza';
  assert not test.throws(format($q$insert into public.crm_leads (organization_id, name, email, owner_id) values (%L, 'Maria de novo', 'maria@empresa.com', 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r)), 'arquivar libera o e-mail';
  assert not test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Sem e-mail 1', 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r)), 'lead sem e-mail';
  assert not test.throws(format($q$insert into public.crm_leads (organization_id, name, owner_id) values (%L, 'Sem e-mail 2', 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r)), 'vários leads sem e-mail são permitidos';
  assert test.throws(format($q$insert into public.crm_leads (organization_id, name, email, owner_id) values (%L, 'E-mail ruim', 'sem-arroba', 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r)), 'e-mail inválido';
  raise notice 'PASS: leads: normalização, duplicidade e arquivamento';
end $$;
reset role;

-- ================= conversão de lead =================
:as_s
do $$
declare
  r uuid := (select id from test.org where name = 'r');
  src uuid := (select id from test.org where name = 'r_src_site');
  prosp uuid := (select id from test.org where name = 'r_prospeccao');
  ganho uuid := (select id from test.org where name = 'r_ganho');
  lead uuid; opp uuid; comp_count int; cont_count int;
begin
  insert into public.crm_leads (organization_id, name, company_name, email, phone, job_title, source_id, owner_id)
  values (r, 'Carlos Lima', 'Lima & Filhos Ltda', 'carlos@lima.invalid', '11999990000', 'Diretor', src, 'f1f1f1f1-0000-4000-8000-000000000001') returning id into lead;
  perform set_config('test.lead_s', lead::text, false);

  opp := public.crm_convert_lead(lead, 'Projeto Lima', 15000.00, prosp, '2026-12-15', null, true, true);
  assert (select status from public.crm_leads where id = lead) = 'converted', 'lead marcado como convertido';
  assert (select converted_opportunity_id from public.crm_leads where id = lead) = opp, 'lead aponta para a oportunidade';
  assert (select converted_at from public.crm_leads where id = lead) is not null, 'data da conversão';
  assert (select lead_id from public.crm_opportunities where id = opp) = lead, 'oportunidade aponta para o lead';
  assert (select source_id from public.crm_opportunities where id = opp) = src, 'oportunidade herda a origem do lead';
  assert (select owner_id from public.crm_opportunities where id = opp) = 'f1f1f1f1-0000-4000-8000-000000000001', 'responsável preservado';
  assert (select value from public.crm_opportunities where id = opp) = 15000.00, 'valor informado';
  assert (select count(*) from public.crm_companies where name = 'Lima & Filhos Ltda') = 1, 'empresa criada a partir do lead';
  assert (select count(*) from public.crm_contacts where name = 'Carlos Lima' and email = 'carlos@lima.invalid') = 1, 'contato criado a partir do lead';
  assert (select c.company_id from public.crm_contacts c where c.name = 'Carlos Lima') = (select company_id from public.crm_opportunities where id = opp), 'contato e oportunidade na mesma empresa';

  assert test.throws(format($q$select public.crm_convert_lead(%L, 'De novo', 1, %L)$q$, lead, prosp)), 'lead convertido não converte de novo';
  assert test.throws(format($q$update public.crm_leads set status = 'new' where id = %L$q$, lead)), 'convertido não volta atrás';
  raise notice 'PASS: conversão cria oportunidade, empresa e contato e liga tudo';
end $$;
reset role;

:as_s
do $$
declare
  r uuid := (select id from test.org where name = 'r');
  prosp uuid := (select id from test.org where name = 'r_prospeccao');
  ganho uuid := (select id from test.org where name = 'r_ganho');
  l2 uuid; l3 uuid; before_c int; before_k int;
begin
  insert into public.crm_leads (organization_id, name, company_name, owner_id) values (r, 'Atômico', 'Atom Co', 'f1f1f1f1-0000-4000-8000-000000000001') returning id into l2;
  before_c := (select count(*) from public.crm_companies); before_k := (select count(*) from public.crm_contacts);

  -- falha DEPOIS de criar empresa e contato (título curto demais): tudo deve ser desfeito
  assert test.throws(format($q$select public.crm_convert_lead(%L, 'x', 10, %L, null, null, true, true)$q$, l2, prosp)), 'falha no meio da conversão';
  assert (select count(*) from public.crm_companies) = before_c, 'nenhuma empresa parcial';
  assert (select count(*) from public.crm_contacts) = before_k, 'nenhum contato parcial';
  assert (select status from public.crm_leads where id = l2) = 'new', 'lead intacto após falha (transação atômica)';

  assert test.throws(format($q$select public.crm_convert_lead(%L, 'Ganho direto', 10, %L)$q$, l2, ganho)), 'não converte direto para etapa de ganho';
  assert test.throws(format($q$select public.crm_convert_lead(%L, 'Valor negativo', -5, %L)$q$, l2, prosp)), 'valor negativo';
  assert test.throws(format($q$select public.crm_convert_lead(%L, 'Etapa inexistente', 5, gen_random_uuid())$q$, l2)), 'etapa inexistente';

  update public.crm_leads set archived_at = now() where id = l2;
  assert test.throws(format($q$select public.crm_convert_lead(%L, 'Arquivado', 5, %L)$q$, l2, prosp)), 'lead arquivado não converte';
  raise notice 'PASS: conversão atômica e validações';
end $$;
reset role;

:as_o
do $$
declare r uuid := (select id from test.org where name = 'r'); prosp uuid := (select id from test.org where name = 'r_prospeccao'); l uuid;
begin
  insert into public.crm_leads (organization_id, name, owner_id) values (r, 'Lead do dono', 'f1f1f1f1-0000-4000-8000-00000000000a') returning id into l;
  perform set_config('test.lead_o', l::text, false);
end $$;
reset role;
:as_s
do $$ begin
  assert test.throws(format($q$select public.crm_convert_lead(%L, 'Alheio', 5, (select id from public.crm_pipeline_stages where name = 'Prospecção' limit 1))$q$, current_setting('test.lead_o'))), 'vendedor não converte lead de outro';
  raise notice 'PASS: vendedor não converte lead alheio';
end $$;
reset role;
:as_v
do $$ begin
  assert test.throws(format($q$select public.crm_convert_lead(%L, 'Leitor', 5, (select id from public.crm_pipeline_stages where name = 'Prospecção' limit 1))$q$, current_setting('test.lead_o'))), 'leitor não converte';
  raise notice 'PASS: leitor não converte';
end $$;
reset role;
:as_m
do $$ begin
  assert public.crm_convert_lead(current_setting('test.lead_o')::uuid, 'Pelo gerente', 7, (select id from public.crm_pipeline_stages where name = 'Prospecção' limit 1)) is not null, 'gerente converte lead de qualquer vendedor';
  raise notice 'PASS: gerente converte qualquer lead';
end $$;
reset role;

-- ================= metas, atividades e referências =================
:as_o
do $$
declare r uuid := (select id from test.org where name = 'r'); q uuid := (select id from test.org where name = 'q'); stq uuid := (select id from test.org where name = 'q_prosp'); opp_q uuid;
begin
  insert into public.crm_teams (organization_id, name) values (r, 'Equipe Norte');
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, team_id, period_start, period_end, target_amount) values (%L, 'user', 'f1f1f1f1-0000-4000-8000-000000000001', (select id from public.crm_teams limit 1), '2026-01-01', '2026-01-31', 100)$q$, r)), 'meta de usuário não pode ter equipe';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, period_start, period_end, target_amount) values (%L, 'team', '2026-01-01', '2026-01-31', 100)$q$, r)), 'meta de equipe exige equipe';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'f1f1f1f1-0000-4000-8000-000000000001', '2026-02-10', '2026-02-01', 100)$q$, r)), 'fim antes do início';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'f1f1f1f1-0000-4000-8000-000000000001', '2026-02-01', '2026-02-28', 0)$q$, r)), 'meta zero é recusada';
  assert not test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'f1f1f1f1-0000-4000-8000-000000000001', '2026-02-01', '2026-02-28', 5000)$q$, r)), 'meta válida';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'f1f1f1f1-0000-4000-8000-000000000001', '2026-02-01', '2026-02-28', 6000)$q$, r)), 'meta duplicada no mesmo período';
  assert test.throws(format($q$insert into public.crm_goals (organization_id, scope, user_id, period_start, period_end, target_amount) values (%L, 'user', 'f1f1f1f1-0000-4000-8000-00000000000b', '2026-04-01', '2026-04-30', 100)$q$, r)), 'meta só para membro da organização';
  assert not test.throws(format($q$insert into public.crm_team_members (team_id, organization_id, user_id) values ((select id from public.crm_teams limit 1), %L, 'f1f1f1f1-0000-4000-8000-000000000001')$q$, r)), 'membro entra na equipe';
  assert test.throws(format($q$insert into public.crm_team_members (team_id, organization_id, user_id) values ((select id from public.crm_teams limit 1), %L, 'f1f1f1f1-0000-4000-8000-00000000000b')$q$, r)), 'só membros da organização entram na equipe';
  raise notice 'PASS: metas e equipes com restrições';
end $$;
reset role;

:as_p
do $$
declare q uuid := (select id from test.org where name = 'q'); stq uuid := (select id from test.org where name = 'q_prosp'); opp uuid;
begin
  insert into public.crm_opportunities (organization_id, title, value, stage_id, owner_id) values (q, 'Oportunidade de Q', 10, stq, 'f1f1f1f1-0000-4000-8000-00000000000b') returning id into opp;
  perform set_config('test.opp_q', opp::text, false);
end $$;
reset role;
:as_o
do $$
declare r uuid := (select id from test.org where name = 'r');
begin
  assert test.throws(format($q$insert into public.crm_activities (organization_id, title, opportunity_id, owner_id) values (%L, 'Atividade cruzada', %L, 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r, current_setting('test.opp_q'))), 'atividade não liga a oportunidade de outra organização';
  assert not test.throws(format($q$insert into public.crm_activities (organization_id, kind, title, due_at, priority, owner_id) values (%L, 'follow_up', 'Ligar para o cliente', now() + interval '2 days', 'high', 'f1f1f1f1-0000-4000-8000-00000000000a')$q$, r)), 'atividade válida';
  raise notice 'PASS: atividades não cruzam organizações';
end $$;
reset role;

-- ================= auditoria =================
do $$
begin
  assert exists (select 1 from public.audit_log where entity = 'crm_opportunities' and action = 'insert'), 'criação de oportunidade auditada';
  assert exists (select 1 from public.audit_log where entity = 'crm_opportunities' and action = 'update' and changes -> 'columns' ? 'stage_id'), 'mudança de etapa auditada pelo nome da coluna';
  assert exists (select 1 from public.audit_log where entity = 'crm_leads' and action = 'insert'), 'lead auditado';
  assert not exists (select 1 from public.audit_log where changes::text ilike '%Contrato Alfa%' or changes::text ilike '%lima.invalid%'), 'auditoria sem valores nem PII';
  raise notice 'PASS: CRM auditado sem PII';
end $$;

-- ================= exclusão da organização não é travada pelas regras =================
do $$
declare q uuid := (select id from test.org where name = 'q');
begin
  delete from public.organizations where id = q;
  assert not exists (select 1 from public.crm_pipeline_stages where organization_id = q), 'etapas removidas em cascata sem erro';
  raise notice 'PASS: excluir organização remove os dados do CRM em cascata';
end $$;

rollback;
