-- CRM Completo — SCHEMA, REGRAS E SEGURANÇA
-- Depende das migrações do Core (organizações, papéis, auditoria, MFA). Arquivo do sistema: pode ser editado.
-- Princípios: toda tabela com organization_id + RLS; regras de negócio em gatilhos (não só no app);
-- vendedor (member) só enxerga e altera o que é dele; privilégios por coluna; nada executável por anon.

begin;

-- ======================================================================= tipos
create type public.crm_stage_kind as enum ('open', 'won', 'lost');
create type public.crm_lead_status as enum ('new', 'contacted', 'qualified', 'unqualified', 'converted');
create type public.crm_temperature as enum ('cold', 'warm', 'hot');
create type public.crm_opp_status as enum ('open', 'won', 'lost');
create type public.crm_activity_kind as enum ('task', 'call', 'meeting', 'email', 'note', 'follow_up');
create type public.crm_priority as enum ('low', 'medium', 'high');
create type public.crm_goal_scope as enum ('user', 'team');

-- ======================================================================= funções de autorização
create function private.crm_role(org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  where m.organization_id = org and m.user_id = (select auth.uid());
$$;

-- Leitura de registros com responsável: gestão e leitor veem tudo; vendedor só os próprios.
create function private.crm_can_read_owned(org uuid, owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case private.crm_role(org)
      when 'owner' then true when 'admin' then true when 'manager' then true when 'viewer' then true
      when 'member' then owner is not distinct from (select auth.uid())
      else false end, false);
$$;

-- Escrita: gestão em tudo; vendedor apenas em registros dele (e não pode repassá-los a outra pessoa).
create function private.crm_can_write_owned(org uuid, owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case private.crm_role(org)
      when 'owner' then true when 'admin' then true when 'manager' then true
      when 'member' then owner is not distinct from (select auth.uid())
      else false end, false);
$$;

revoke all on function private.crm_role(uuid) from public;
revoke all on function private.crm_can_read_owned(uuid, uuid) from public;
revoke all on function private.crm_can_write_owned(uuid, uuid) from public;
grant execute on function private.crm_role(uuid) to authenticated;
grant execute on function private.crm_can_read_owned(uuid, uuid) to authenticated;
grant execute on function private.crm_can_write_owned(uuid, uuid) to authenticated;

-- ======================================================================= tabelas de configuração
create table public.crm_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stale_days integer not null default 14 check (stale_days between 1 and 365),
  closing_soon_days integer not null default 7 check (closing_soon_days between 1 and 365),
  updated_at timestamptz not null default now()
);

create table public.crm_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index crm_teams_name_uniq on public.crm_teams (organization_id, lower(name));

create table public.crm_team_members (
  team_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (team_id, organization_id) references public.crm_teams (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);

create table public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  position integer not null default 0 check (position between 0 and 1000),
  probability integer not null default 0 check (probability between 0 and 100),
  kind public.crm_stage_kind not null default 'open',
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index crm_stages_name_uniq on public.crm_pipeline_stages (organization_id, lower(name));

create table public.crm_lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index crm_sources_name_uniq on public.crm_lead_sources (organization_id, lower(name));

create table public.crm_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index crm_reasons_name_uniq on public.crm_loss_reasons (organization_id, lower(name));

-- ======================================================================= entidades comerciais
create table public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  document text check (document is null or char_length(document) <= 20),
  website text check (website is null or char_length(website) <= 200),
  segment text check (segment is null or char_length(segment) <= 80),
  phone text check (phone is null or char_length(phone) <= 30),
  notes text check (notes is null or char_length(notes) <= 4000),
  owner_id uuid,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id, owner_id) references public.organization_members (organization_id, user_id) on delete set null (owner_id)
);
create index crm_companies_org_idx on public.crm_companies (organization_id, archived_at, name);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  name text not null check (char_length(name) between 2 and 160),
  email text check (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+$')),
  phone text check (phone is null or char_length(phone) <= 30),
  job_title text check (job_title is null or char_length(job_title) <= 80),
  notes text check (notes is null or char_length(notes) <= 4000),
  owner_id uuid,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.crm_companies (id, organization_id),
  foreign key (organization_id, owner_id) references public.organization_members (organization_id, user_id) on delete set null (owner_id)
);
create index crm_contacts_org_idx on public.crm_contacts (organization_id, archived_at, name);
create index crm_contacts_company_idx on public.crm_contacts (company_id);

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  company_name text check (company_name is null or char_length(company_name) <= 160),
  email text check (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+$')),
  phone text check (phone is null or char_length(phone) <= 30),
  job_title text check (job_title is null or char_length(job_title) <= 80),
  source_id uuid,
  status public.crm_lead_status not null default 'new',
  temperature public.crm_temperature not null default 'warm',
  owner_id uuid,
  notes text check (notes is null or char_length(notes) <= 4000),
  archived_at timestamptz,
  converted_at timestamptz,
  converted_opportunity_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check ((status = 'converted') = (converted_at is not null)),
  foreign key (organization_id, source_id) references public.crm_lead_sources (organization_id, id),
  foreign key (organization_id, owner_id) references public.organization_members (organization_id, user_id) on delete set null (owner_id)
);
create unique index crm_leads_email_uniq on public.crm_leads (organization_id, email) where archived_at is null and email is not null;
create index crm_leads_owner_idx on public.crm_leads (organization_id, owner_id);
create index crm_leads_created_idx on public.crm_leads (organization_id, created_at);

create table public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  company_id uuid,
  contact_id uuid,
  lead_id uuid,
  source_id uuid,
  value numeric(14,2) not null default 0 check (value >= 0 and value < 1000000000000),
  stage_id uuid not null,
  status public.crm_opp_status not null default 'open',
  probability integer check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid,
  closed_at timestamptz,
  loss_reason_id uuid,
  loss_notes text check (loss_notes is null or char_length(loss_notes) <= 2000),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id, stage_id) references public.crm_pipeline_stages (organization_id, id),
  foreign key (company_id, organization_id) references public.crm_companies (id, organization_id),
  foreign key (contact_id, organization_id) references public.crm_contacts (id, organization_id),
  foreign key (lead_id, organization_id) references public.crm_leads (id, organization_id),
  foreign key (organization_id, source_id) references public.crm_lead_sources (organization_id, id),
  foreign key (organization_id, loss_reason_id) references public.crm_loss_reasons (organization_id, id),
  foreign key (organization_id, owner_id) references public.organization_members (organization_id, user_id) on delete set null (owner_id)
);
create index crm_opps_status_idx on public.crm_opportunities (organization_id, status, stage_id);
create index crm_opps_owner_idx on public.crm_opportunities (organization_id, owner_id);
create index crm_opps_closed_idx on public.crm_opportunities (organization_id, closed_at) where closed_at is not null;
create index crm_opps_close_date_idx on public.crm_opportunities (organization_id, expected_close_date) where status = 'open';

alter table public.crm_leads
  add constraint crm_leads_converted_fk foreign key (converted_opportunity_id, organization_id)
  references public.crm_opportunities (id, organization_id) on delete set null (converted_opportunity_id) deferrable initially deferred;

create table public.crm_stage_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by uuid default auth.uid() references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index crm_history_opp_idx on public.crm_stage_history (opportunity_id, changed_at);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.crm_activity_kind not null default 'task',
  title text not null check (char_length(title) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  due_at timestamptz,
  completed_at timestamptz,
  priority public.crm_priority not null default 'medium',
  owner_id uuid,
  lead_id uuid,
  contact_id uuid,
  company_id uuid,
  opportunity_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, organization_id) references public.crm_leads (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.crm_contacts (id, organization_id) on delete cascade,
  foreign key (company_id, organization_id) references public.crm_companies (id, organization_id) on delete cascade,
  foreign key (opportunity_id, organization_id) references public.crm_opportunities (id, organization_id) on delete cascade,
  foreign key (organization_id, owner_id) references public.organization_members (organization_id, user_id) on delete set null (owner_id)
);
create index crm_activities_open_idx on public.crm_activities (organization_id, owner_id, due_at) where completed_at is null;
create index crm_activities_opp_idx on public.crm_activities (opportunity_id);
create index crm_activities_lead_idx on public.crm_activities (lead_id);

create table public.crm_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope public.crm_goal_scope not null,
  user_id uuid,
  team_id uuid,
  period_start date not null,
  period_end date not null,
  target_amount numeric(14,2) not null check (target_amount > 0 and target_amount < 1000000000000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 3660),
  check ((scope = 'user' and user_id is not null and team_id is null) or (scope = 'team' and team_id is not null and user_id is null)),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade,
  foreign key (team_id, organization_id) references public.crm_teams (id, organization_id) on delete cascade
);
create unique index crm_goals_uniq on public.crm_goals (organization_id, scope, coalesce(user_id, team_id), period_start, period_end);

-- ======================================================================= gatilhos de regra de negócio
-- updated_at (função do Core)
do $$
declare t text;
begin
  foreach t in array array['crm_settings','crm_teams','crm_pipeline_stages','crm_lead_sources','crm_loss_reasons','crm_companies','crm_contacts','crm_leads','crm_opportunities','crm_activities','crm_goals']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- e-mail sempre normalizado (minúsculas, sem espaços) antes de validar duplicidade
create function private.crm_normalize_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end $$;
create trigger crm_leads_email before insert or update of email on public.crm_leads for each row execute function private.crm_normalize_email();
create trigger crm_contacts_email before insert or update of email on public.crm_contacts for each row execute function private.crm_normalize_email();

-- Etapa define o status da oportunidade (ganha/perdida/aberta) e o fechamento.
create function private.crm_opp_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st public.crm_pipeline_stages%rowtype;
begin
  select * into st from public.crm_pipeline_stages s where s.id = new.stage_id and s.organization_id = new.organization_id;
  if not found then
    raise exception 'etapa inexistente' using errcode = '23503';
  end if;
  if (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id) and not st.is_active then
    raise exception 'etapa desativada' using errcode = '23514';
  end if;

  if st.kind = 'won' then
    new.status := 'won'; new.probability := 100;
    new.closed_at := coalesce(new.closed_at, now());
    new.loss_reason_id := null; new.loss_notes := null;
  elsif st.kind = 'lost' then
    if new.loss_reason_id is null then
      raise exception 'informe o motivo da perda' using errcode = '23514';
    end if;
    new.status := 'lost'; new.probability := 0;
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.status := 'open'; new.closed_at := null; new.loss_reason_id := null; new.loss_notes := null;
    if new.probability is null or (tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id and new.probability is not distinct from old.probability) then
      new.probability := st.probability;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status <> 'open' then
    if old.status = new.status then
      -- permanecer encerrada (mesmo status) preserva a data de fechamento original
      new.closed_at := old.closed_at;
    elsif new.closed_at is not distinct from old.closed_at then
      -- mudou entre ganho e perdido: a data de fechamento é o momento da mudança
      new.closed_at := clock_timestamp();
    end if;
  end if;
  return new;
end $$;
revoke all on function private.crm_opp_before() from public;
create trigger crm_opp_before before insert or update on public.crm_opportunities
  for each row execute function private.crm_opp_before();

-- Histórico de movimentação gravado pelo banco (não depende do app).
create function private.crm_opp_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_stage_history (organization_id, opportunity_id, from_stage_id, to_stage_id)
    values (new.organization_id, new.id, null, new.stage_id);
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.crm_stage_history (organization_id, opportunity_id, from_stage_id, to_stage_id)
    values (new.organization_id, new.id, old.stage_id, new.stage_id);
  end if;
  return null;
end $$;
revoke all on function private.crm_opp_history() from public;
create trigger crm_opp_history after insert or update of stage_id on public.crm_opportunities
  for each row execute function private.crm_opp_history();

-- Lead convertido não volta atrás.
create function private.crm_lead_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'converted' and new.status <> 'converted' then
    raise exception 'lead convertido não pode mudar de status' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger crm_lead_guard before update on public.crm_leads for each row execute function private.crm_lead_guard();

-- Sempre deve existir ao menos uma etapa ativa de ganho e uma de perda.
create function private.crm_stage_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
    return null;
  end if;
  if not exists (select 1 from public.crm_pipeline_stages s where s.organization_id = old.organization_id and s.kind = 'won' and s.is_active)
     or not exists (select 1 from public.crm_pipeline_stages s where s.organization_id = old.organization_id and s.kind = 'lost' and s.is_active) then
    raise exception 'o funil precisa manter ao menos uma etapa ativa de Ganho e uma de Perdido' using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function private.crm_stage_guard() from public;
create trigger crm_stage_guard after update or delete on public.crm_pipeline_stages
  for each row execute function private.crm_stage_guard();

-- Padrões criados junto com cada organização (e para as já existentes).
create function private.crm_bootstrap_org(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_settings (organization_id) values (org) on conflict do nothing;
  insert into public.crm_pipeline_stages (organization_id, name, position, probability, kind, color) values
    (org, 'Prospecção', 10, 10, 'open', '#64748b'),
    (org, 'Qualificação', 20, 25, 'open', '#0891b2'),
    (org, 'Proposta', 30, 50, 'open', '#7c3aed'),
    (org, 'Negociação', 40, 75, 'open', '#d97706'),
    (org, 'Ganho', 90, 100, 'won', '#047857'),
    (org, 'Perdido', 100, 0, 'lost', '#b91c1c')
  on conflict do nothing;
  insert into public.crm_lead_sources (organization_id, name) values
    (org, 'Indicação'), (org, 'Site'), (org, 'Redes sociais'), (org, 'Anúncios'), (org, 'Evento'), (org, 'Outros')
  on conflict do nothing;
  insert into public.crm_loss_reasons (organization_id, name) values
    (org, 'Preço'), (org, 'Escolheu a concorrência'), (org, 'Sem orçamento'), (org, 'Sem resposta'), (org, 'Projeto adiado'), (org, 'Outro')
  on conflict do nothing;
end $$;
revoke all on function private.crm_bootstrap_org(uuid) from public;

create function private.crm_on_org_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.crm_bootstrap_org(new.id);
  return null;
end $$;
revoke all on function private.crm_on_org_created() from public;
create trigger crm_on_org_created after insert on public.organizations
  for each row execute function private.crm_on_org_created();

select private.crm_bootstrap_org(id) from public.organizations;

-- Auditoria (somente metadados) das entidades principais; configurações só em alteração/remoção.
do $$
declare t text;
begin
  foreach t in array array['crm_companies','crm_contacts','crm_leads','crm_opportunities','crm_goals']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_trigger(%L, %L)', 'audit_' || t, t, 'organization_id', 'id');
  end loop;
  foreach t in array array['crm_pipeline_stages','crm_lead_sources','crm_loss_reasons','crm_teams']
  loop
    execute format('create trigger %I after update or delete on public.%I for each row execute function private.audit_trigger(%L, %L)', 'audit_' || t, t, 'organization_id', 'id');
  end loop;
  create trigger audit_crm_settings after update on public.crm_settings for each row execute function private.audit_trigger('organization_id', 'organization_id');
end $$;

-- ======================================================================= RLS
do $$
declare t text;
begin
  foreach t in array array['crm_settings','crm_teams','crm_team_members','crm_pipeline_stages','crm_lead_sources','crm_loss_reasons','crm_companies','crm_contacts','crm_leads','crm_opportunities','crm_stage_history','crm_activities','crm_goals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Configuração: todos leem; owner/admin escrevem.
do $$
declare t text;
begin
  foreach t in array array['crm_pipeline_stages','crm_lead_sources','crm_loss_reasons','crm_teams','crm_settings']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id))', t || '_select', t);
  end loop;
  foreach t in array array['crm_pipeline_stages','crm_lead_sources','crm_loss_reasons','crm_teams']
  loop
    execute format($f$create policy %I on public.%I for insert to authenticated with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]))$f$, t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated using (private.has_role(organization_id, array['owner','admin']::public.org_role[])) with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]))$f$, t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (private.has_role(organization_id, array['owner','admin']::public.org_role[]))$f$, t || '_delete', t);
  end loop;
end $$;
create policy crm_settings_update on public.crm_settings for update to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]));

create policy crm_team_members_select on public.crm_team_members for select to authenticated using (private.is_member(organization_id));
create policy crm_team_members_insert on public.crm_team_members for insert to authenticated
  with check (private.has_role(organization_id, array['owner','admin']::public.org_role[]));
create policy crm_team_members_delete on public.crm_team_members for delete to authenticated
  using (private.has_role(organization_id, array['owner','admin']::public.org_role[]));

-- Diretório (empresas e contatos): todos leem; todos exceto leitor escrevem; gestão remove.
do $$
declare t text;
begin
  foreach t in array array['crm_companies','crm_contacts']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id))', t || '_select', t);
    execute format($f$create policy %I on public.%I for insert to authenticated with check (private.has_role(organization_id, array['owner','admin','manager','member']::public.org_role[]))$f$, t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated using (private.has_role(organization_id, array['owner','admin','manager','member']::public.org_role[])) with check (private.has_role(organization_id, array['owner','admin','manager','member']::public.org_role[]))$f$, t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (private.has_role(organization_id, array['owner','admin','manager']::public.org_role[]))$f$, t || '_delete', t);
  end loop;
end $$;

-- Registros com responsável (leads, oportunidades, atividades).
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_opportunities','crm_activities']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (private.crm_can_read_owned(organization_id, owner_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.crm_can_write_owned(organization_id, owner_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.crm_can_write_owned(organization_id, owner_id)) with check (private.crm_can_write_owned(organization_id, owner_id))', t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (private.has_role(organization_id, array['owner','admin','manager']::public.org_role[]))$f$, t || '_delete', t);
  end loop;
end $$;
-- Lead nunca nasce nem vira "convertido" pelo cliente: só pela função de conversão.
create policy crm_leads_no_client_convert on public.crm_leads as restrictive for insert to authenticated with check (status <> 'converted');
create policy crm_leads_no_client_convert_upd on public.crm_leads as restrictive for update to authenticated
  using (true) with check (status <> 'converted' or converted_at is not null);

-- Histórico: lê quem enxerga a oportunidade (o RLS dela se aplica na subconsulta).
create policy crm_stage_history_select on public.crm_stage_history for select to authenticated
  using (exists (select 1 from public.crm_opportunities o where o.id = opportunity_id));

-- Metas: gestão e leitor leem tudo; vendedor lê a própria e as das suas equipes; gestão escreve.
create policy crm_goals_select on public.crm_goals for select to authenticated
  using (
    private.has_role(organization_id, array['owner','admin','manager','viewer']::public.org_role[])
    or (private.crm_role(organization_id) = 'member' and (
      user_id = (select auth.uid())
      or team_id in (select m.team_id from public.crm_team_members m where m.user_id = (select auth.uid()))
    ))
  );
create policy crm_goals_insert on public.crm_goals for insert to authenticated
  with check (private.has_role(organization_id, array['owner','admin','manager']::public.org_role[]));
create policy crm_goals_update on public.crm_goals for update to authenticated
  using (private.has_role(organization_id, array['owner','admin','manager']::public.org_role[]))
  with check (private.has_role(organization_id, array['owner','admin','manager']::public.org_role[]));
create policy crm_goals_delete on public.crm_goals for delete to authenticated
  using (private.has_role(organization_id, array['owner','admin','manager']::public.org_role[]));

-- MFA no banco (padrão do Core): escrita de owner/admin exige AAL2.
do $$
declare t text;
begin
  foreach t in array array['crm_settings','crm_teams','crm_team_members','crm_pipeline_stages','crm_lead_sources','crm_loss_reasons','crm_companies','crm_contacts','crm_leads','crm_opportunities','crm_activities','crm_goals']
  loop
    execute format('create policy mfa_insert on public.%I as restrictive for insert to authenticated with check (private.mfa_ok())', t);
    execute format('create policy mfa_update on public.%I as restrictive for update to authenticated using (private.mfa_ok()) with check (private.mfa_ok())', t);
    execute format('create policy mfa_delete on public.%I as restrictive for delete to authenticated using (private.mfa_ok())', t);
  end loop;
end $$;

-- Privilégios por coluna (nada de created_by, closed_at, converted_*, organization_id em update).
grant insert (organization_id, name, position, probability, kind, color, is_active) on public.crm_pipeline_stages to authenticated;
grant update (name, position, probability, color, is_active) on public.crm_pipeline_stages to authenticated;
grant delete on public.crm_pipeline_stages to authenticated;
grant insert (organization_id, name, is_active) on public.crm_lead_sources to authenticated;
grant update (name, is_active) on public.crm_lead_sources to authenticated;
grant delete on public.crm_lead_sources to authenticated;
grant insert (organization_id, name, is_active) on public.crm_loss_reasons to authenticated;
grant update (name, is_active) on public.crm_loss_reasons to authenticated;
grant delete on public.crm_loss_reasons to authenticated;
grant insert (organization_id, name) on public.crm_teams to authenticated;
grant update (name) on public.crm_teams to authenticated;
grant delete on public.crm_teams to authenticated;
grant insert (team_id, organization_id, user_id) on public.crm_team_members to authenticated;
grant delete on public.crm_team_members to authenticated;
grant update (stale_days, closing_soon_days) on public.crm_settings to authenticated;

grant insert (organization_id, name, document, website, segment, phone, notes, owner_id, custom) on public.crm_companies to authenticated;
grant update (name, document, website, segment, phone, notes, owner_id, archived_at, custom) on public.crm_companies to authenticated;
grant delete on public.crm_companies to authenticated;
grant insert (organization_id, company_id, name, email, phone, job_title, notes, owner_id, custom) on public.crm_contacts to authenticated;
grant update (company_id, name, email, phone, job_title, notes, owner_id, archived_at, custom) on public.crm_contacts to authenticated;
grant delete on public.crm_contacts to authenticated;
grant insert (organization_id, name, company_name, email, phone, job_title, source_id, status, temperature, owner_id, notes, custom) on public.crm_leads to authenticated;
grant update (name, company_name, email, phone, job_title, source_id, status, temperature, owner_id, notes, archived_at, custom) on public.crm_leads to authenticated;
grant delete on public.crm_leads to authenticated;
grant insert (organization_id, title, company_id, contact_id, source_id, value, stage_id, probability, expected_close_date, owner_id, loss_reason_id, loss_notes, notes, custom) on public.crm_opportunities to authenticated;
grant update (title, company_id, contact_id, source_id, value, stage_id, probability, expected_close_date, owner_id, loss_reason_id, loss_notes, notes, custom) on public.crm_opportunities to authenticated;
grant delete on public.crm_opportunities to authenticated;
grant insert (organization_id, kind, title, description, due_at, completed_at, priority, owner_id, lead_id, contact_id, company_id, opportunity_id, custom) on public.crm_activities to authenticated;
grant update (kind, title, description, due_at, completed_at, priority, owner_id, lead_id, contact_id, company_id, opportunity_id, custom) on public.crm_activities to authenticated;
grant delete on public.crm_activities to authenticated;
grant insert (organization_id, scope, user_id, team_id, period_start, period_end, target_amount) on public.crm_goals to authenticated;
grant update (period_start, period_end, target_amount) on public.crm_goals to authenticated;
grant delete on public.crm_goals to authenticated;

-- ======================================================================= conversão de lead (transação única)
create function public.crm_convert_lead(
  p_lead_id uuid, p_title text, p_value numeric, p_stage_id uuid, p_expected_close date default null,
  p_company_id uuid default null, p_create_company boolean default false, p_create_contact boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  l public.crm_leads%rowtype;
  comp uuid := p_company_id;
  cont uuid;
  opp uuid;
begin
  if uid is null then
    raise exception 'autenticação obrigatória' using errcode = '28000';
  end if;
  select * into l from public.crm_leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead inexistente' using errcode = 'P0002';
  end if;
  if not private.crm_can_write_owned(l.organization_id, l.owner_id) then
    raise exception 'sem permissão para converter este lead' using errcode = '42501';
  end if;
  if l.archived_at is not null or l.status = 'converted' then
    raise exception 'este lead não pode ser convertido' using errcode = '23514';
  end if;
  if p_value is null or p_value < 0 then
    raise exception 'valor inválido' using errcode = '23514';
  end if;
  if not exists (select 1 from public.crm_pipeline_stages s
                 where s.id = p_stage_id and s.organization_id = l.organization_id and s.kind = 'open' and s.is_active) then
    raise exception 'etapa inválida para uma nova oportunidade' using errcode = '23514';
  end if;
  if comp is not null and not exists (select 1 from public.crm_companies c where c.id = comp and c.organization_id = l.organization_id) then
    raise exception 'empresa inválida' using errcode = '23503';
  end if;

  if comp is null and p_create_company and btrim(coalesce(l.company_name, '')) <> '' then
    insert into public.crm_companies (organization_id, name, owner_id)
    values (l.organization_id, btrim(l.company_name), l.owner_id) returning id into comp;
  end if;
  if p_create_contact then
    insert into public.crm_contacts (organization_id, company_id, name, email, phone, job_title, owner_id)
    values (l.organization_id, comp, l.name, l.email, l.phone, l.job_title, l.owner_id) returning id into cont;
  end if;

  insert into public.crm_opportunities (organization_id, title, company_id, contact_id, lead_id, source_id, value, stage_id, expected_close_date, owner_id)
  values (l.organization_id, btrim(p_title), comp, cont, l.id, l.source_id, p_value, p_stage_id, p_expected_close, coalesce(l.owner_id, uid))
  returning id into opp;

  update public.crm_leads set status = 'converted', converted_at = now(), converted_opportunity_id = opp where id = l.id;
  return opp;
end $$;

-- ======================================================================= indicadores (fonte única; ver docs/METRICS.md)
-- security invoker: o RLS já limita o que cada papel enxerga. p_org restringe à organização ativa.
create function private.crm_ts(p_date date, p_end boolean default false) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((case when p_end then p_date + 1 else p_date end)::timestamp at time zone 'America/Sao_Paulo');
$$;
grant execute on function private.crm_ts(date, boolean) to authenticated;
revoke all on function private.crm_ts(date, boolean) from public;

create function public.crm_kpis(p_org uuid, p_from date, p_to date, p_owner uuid default null, p_team uuid default null, p_source uuid default null)
returns table (pipeline_value numeric, pipeline_count bigint, won_value numeric, won_count bigint, lost_count bigint,
               conversion_rate numeric, active_leads bigint, avg_ticket numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare t0 timestamptz; t1 timestamptz;
begin
  if p_org is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'período inválido' using errcode = '22023';
  end if;
  t0 := private.crm_ts(p_from); t1 := private.crm_ts(p_to, true);
  return query
  with o as (
    select x.* from public.crm_opportunities x
    where x.organization_id = p_org
      and (p_owner is null or x.owner_id = p_owner)
      and (p_source is null or x.source_id = p_source)
      and (p_team is null or x.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  ), l as (
    select x.* from public.crm_leads x
    where x.organization_id = p_org
      and (p_owner is null or x.owner_id = p_owner)
      and (p_source is null or x.source_id = p_source)
      and (p_team is null or x.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  ), agg as (
    select
      coalesce(sum(o.value) filter (where o.status = 'open'), 0) as pv,
      count(*) filter (where o.status = 'open') as pc,
      coalesce(sum(o.value) filter (where o.status = 'won' and o.closed_at >= t0 and o.closed_at < t1), 0) as wv,
      count(*) filter (where o.status = 'won' and o.closed_at >= t0 and o.closed_at < t1) as wc,
      count(*) filter (where o.status = 'lost' and o.closed_at >= t0 and o.closed_at < t1) as lc
    from o
  )
  select agg.pv, agg.pc, agg.wv, agg.wc, agg.lc,
         case when agg.wc + agg.lc = 0 then null else round(100.0 * agg.wc / (agg.wc + agg.lc), 2) end,
         (select count(*) from l where l.archived_at is null and l.status in ('new', 'contacted', 'qualified')),
         case when agg.wc = 0 then null else round(agg.wv / agg.wc, 2) end
  from agg;
end $$;

create function public.crm_sales_series(p_org uuid, p_from date, p_to date, p_owner uuid default null, p_team uuid default null, p_source uuid default null)
returns table (bucket date, won_value numeric, won_count bigint, lost_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare t0 timestamptz; t1 timestamptz; unit text;
begin
  if p_org is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'período inválido' using errcode = '22023';
  end if;
  t0 := private.crm_ts(p_from); t1 := private.crm_ts(p_to, true);
  unit := case when p_to - p_from <= 90 then 'week' else 'month' end;
  return query
  with b as (
    select d::date as bk from generate_series(date_trunc(unit, p_from::timestamp), p_to::timestamp,
      case when unit = 'week' then interval '1 week' else interval '1 month' end) d
  ), o as (
    select date_trunc(unit, x.closed_at at time zone 'America/Sao_Paulo')::date as bk, x.status, x.value
    from public.crm_opportunities x
    where x.organization_id = p_org and x.status in ('won', 'lost') and x.closed_at >= t0 and x.closed_at < t1
      and (p_owner is null or x.owner_id = p_owner)
      and (p_source is null or x.source_id = p_source)
      and (p_team is null or x.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  )
  select b.bk, coalesce(sum(o.value) filter (where o.status = 'won'), 0), count(o.bk) filter (where o.status = 'won'), count(o.bk) filter (where o.status = 'lost')
  from b left join o on o.bk = b.bk group by b.bk order by b.bk;
end $$;

create function public.crm_funnel(p_org uuid, p_owner uuid default null, p_team uuid default null, p_source uuid default null)
returns table (stage_id uuid, stage_name text, stage_position integer, opp_count bigint, opp_value numeric)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.name, s.position, count(o.id), coalesce(sum(o.value), 0)
  from public.crm_pipeline_stages s
  left join public.crm_opportunities o on o.stage_id = s.id and o.organization_id = s.organization_id and o.status = 'open'
    and (p_owner is null or o.owner_id = p_owner)
    and (p_source is null or o.source_id = p_source)
    and (p_team is null or o.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  where s.organization_id = p_org and s.kind = 'open' and (s.is_active or exists (
    select 1 from public.crm_opportunities z where z.stage_id = s.id and z.status = 'open'))
  group by s.id, s.name, s.position
  order by s.position, s.name;
$$;

create function public.crm_lead_sources_chart(p_org uuid, p_from date, p_to date, p_owner uuid default null, p_team uuid default null, p_source uuid default null)
returns table (source_id uuid, source_name text, lead_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare t0 timestamptz; t1 timestamptz;
begin
  if p_org is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'período inválido' using errcode = '22023';
  end if;
  t0 := private.crm_ts(p_from); t1 := private.crm_ts(p_to, true);
  return query
  select l.source_id, coalesce(s.name, 'Sem origem'), count(*)
  from public.crm_leads l
  left join public.crm_lead_sources s on s.id = l.source_id and s.organization_id = l.organization_id
  where l.organization_id = p_org and l.created_at >= t0 and l.created_at < t1
    and (p_owner is null or l.owner_id = p_owner)
    and (p_source is null or l.source_id = p_source)
    and (p_team is null or l.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  group by l.source_id, coalesce(s.name, 'Sem origem')
  order by count(*) desc, 2;
end $$;

create function public.crm_goals_progress(p_org uuid, p_from date, p_to date, p_owner uuid default null, p_team uuid default null)
returns table (goal_id uuid, scope public.crm_goal_scope, user_id uuid, team_id uuid, team_name text, period_start date, period_end date,
               target_amount numeric, realized numeric, pct numeric, elapsed_pct numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_org is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'período inválido' using errcode = '22023';
  end if;
  return query
  select g.id, g.scope, g.user_id, g.team_id, t.name, g.period_start, g.period_end, g.target_amount,
         r.realized,
         round(100.0 * r.realized / g.target_amount, 2),
         round(greatest(0, least(100, 100.0 * ((least(today, g.period_end) - g.period_start) + 1) / ((g.period_end - g.period_start) + 1))), 2)
  from public.crm_goals g
  left join public.crm_teams t on t.id = g.team_id and t.organization_id = g.organization_id
  cross join lateral (
    select coalesce(sum(o.value), 0) as realized
    from public.crm_opportunities o
    where o.organization_id = g.organization_id and o.status = 'won'
      and o.closed_at >= private.crm_ts(g.period_start) and o.closed_at < private.crm_ts(g.period_end, true)
      and ((g.scope = 'user' and o.owner_id = g.user_id)
        or (g.scope = 'team' and o.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = g.team_id)))
  ) r
  where g.organization_id = p_org and g.period_start <= p_to and g.period_end >= p_from
    and (p_owner is null or (g.scope = 'user' and g.user_id = p_owner)
         or (g.scope = 'team' and g.team_id in (select m.team_id from public.crm_team_members m where m.user_id = p_owner)))
    and (p_team is null or (g.scope = 'team' and g.team_id = p_team)
         or (g.scope = 'user' and g.user_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team)))
  order by g.period_start, g.scope, g.id;
end $$;

create function public.crm_rep_performance(p_org uuid, p_from date, p_to date, p_owner uuid default null, p_team uuid default null, p_source uuid default null)
returns table (user_id uuid, won_count bigint, won_value numeric, lost_count bigint, conversion_rate numeric, goals_met bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare t0 timestamptz; t1 timestamptz;
begin
  if p_org is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'período inválido' using errcode = '22023';
  end if;
  t0 := private.crm_ts(p_from); t1 := private.crm_ts(p_to, true);
  return query
  with o as (
    select x.* from public.crm_opportunities x
    where x.organization_id = p_org and x.owner_id is not null
      and (p_owner is null or x.owner_id = p_owner)
      and (p_source is null or x.source_id = p_source)
      and (p_team is null or x.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  ), reps as (
    select o.owner_id as uid,
      count(*) filter (where o.status = 'won' and o.closed_at >= t0 and o.closed_at < t1) as wc,
      coalesce(sum(o.value) filter (where o.status = 'won' and o.closed_at >= t0 and o.closed_at < t1), 0) as wv,
      count(*) filter (where o.status = 'lost' and o.closed_at >= t0 and o.closed_at < t1) as lc
    from o group by o.owner_id
  )
  select r.uid, r.wc, r.wv, r.lc,
         case when r.wc + r.lc = 0 then null else round(100.0 * r.wc / (r.wc + r.lc), 2) end,
         (select count(*) from public.crm_goals_progress(p_org, p_from, p_to) gp where gp.scope = 'user' and gp.user_id = r.uid and gp.realized >= gp.target_amount)
  from reps r
  order by r.wv desc, r.wc desc, r.uid;
end $$;

create function public.crm_alerts(p_org uuid, p_owner uuid default null, p_team uuid default null)
returns table (kind text, ref_id uuid, title text, due timestamptz, days integer, owner_id uuid, detail numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  stale integer; soon integer;
begin
  if p_org is null then
    raise exception 'organização obrigatória' using errcode = '22023';
  end if;
  select s.stale_days, s.closing_soon_days into stale, soon from public.crm_settings s where s.organization_id = p_org;
  stale := coalesce(stale, 14); soon := coalesce(soon, 7);
  return query
  select 'overdue_activity', a.id, a.title, a.due_at,
         floor(extract(epoch from (now() - a.due_at)) / 86400)::integer, a.owner_id, null::numeric
  from public.crm_activities a
  where a.organization_id = p_org and a.completed_at is null and a.due_at is not null and a.due_at < now()
    and (p_owner is null or a.owner_id = p_owner)
    and (p_team is null or a.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  union all
  select 'stale_opportunity', o.id, o.title, lt.last_touch,
         floor(extract(epoch from (now() - lt.last_touch)) / 86400)::integer, o.owner_id, o.value
  from public.crm_opportunities o
  cross join lateral (
    select greatest(
      o.created_at,
      coalesce((select max(h.changed_at) from public.crm_stage_history h where h.opportunity_id = o.id), o.created_at),
      coalesce((select max(coalesce(a.completed_at, a.created_at)) from public.crm_activities a where a.opportunity_id = o.id), o.created_at)
    ) as last_touch
  ) lt
  where o.organization_id = p_org and o.status = 'open' and lt.last_touch < now() - (stale * interval '1 day')
    and (p_owner is null or o.owner_id = p_owner)
    and (p_team is null or o.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  union all
  select 'closing_soon', o.id, o.title, (o.expected_close_date::timestamp at time zone 'America/Sao_Paulo'),
         (o.expected_close_date - today), o.owner_id, o.value
  from public.crm_opportunities o
  where o.organization_id = p_org and o.status = 'open' and o.expected_close_date is not null
    and o.expected_close_date between today and today + soon
    and (p_owner is null or o.owner_id = p_owner)
    and (p_team is null or o.owner_id in (select m.user_id from public.crm_team_members m where m.team_id = p_team))
  union all
  select 'goal_pace', gp.goal_id, coalesce(gp.team_name, 'Meta individual'), private.crm_ts(gp.period_end, true),
         (gp.period_end - today), gp.user_id, gp.pct
  from public.crm_goals_progress(p_org, today, today, p_owner, p_team) gp
  where gp.elapsed_pct >= 25 and gp.pct < gp.elapsed_pct - 15;
end $$;

-- Nomes exibidos no ranking e nos responsáveis. Expõe apenas nome ou parte local do e-mail,
-- e somente a membros da própria organização (finalidade: operar o CRM).
create function public.crm_user_labels(p_org uuid) returns table (user_id uuid, label text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(nullif(p.full_name, ''), nullif(split_part(p.email, '@', 1), ''), 'Usuário')
  from public.organization_members m
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_org and private.is_member(p_org);
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.crm_convert_lead(uuid, text, numeric, uuid, date, uuid, boolean, boolean)',
    'public.crm_kpis(uuid, date, date, uuid, uuid, uuid)',
    'public.crm_sales_series(uuid, date, date, uuid, uuid, uuid)',
    'public.crm_funnel(uuid, uuid, uuid, uuid)',
    'public.crm_lead_sources_chart(uuid, date, date, uuid, uuid, uuid)',
    'public.crm_goals_progress(uuid, date, date, uuid, uuid)',
    'public.crm_rep_performance(uuid, date, date, uuid, uuid, uuid)',
    'public.crm_alerts(uuid, uuid, uuid)',
    'public.crm_user_labels(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
