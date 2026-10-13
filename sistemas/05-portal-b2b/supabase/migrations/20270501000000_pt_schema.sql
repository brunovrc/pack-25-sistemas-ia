-- Portal de Clientes B2B — ESQUEMA (parte 1): tabelas, helpers de autorização, RLS e privilégios.
-- Modelo de dois níveis: a PRESTADORA é a organização do Core (organizations/organization_members); a EMPRESA CLIENTE é client_accounts,
-- e os usuários do cliente ficam em client_members (NUNCA em organization_members: isso lhes daria equipe, auditoria e configurações).
-- Toda tabela de negócio carrega organization_id e, quando pertence a um cliente, client_account_id, com chaves compostas que impedem referência cruzada.
-- Escrita sensível só por funções SECURITY DEFINER (partes 2 e 3). A autorização é checada a CADA consulta: desativar um usuário corta o acesso na hora.

begin;
set local check_function_bodies = off; -- helpers abaixo referenciam tabelas criadas mais adiante

create type public.pt_client_role as enum ('client_admin', 'client_user');
create type public.pt_request_status as enum ('open', 'in_review', 'in_progress', 'waiting_client', 'waiting_provider', 'completed', 'cancelled');
create type public.pt_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.pt_visibility as enum ('internal', 'client');
create type public.pt_comment_visibility as enum ('shared', 'internal');
create type public.pt_deliverable_status as enum ('draft', 'in_preparation', 'ready', 'published', 'acknowledged', 'cancelled');

-- ======================================================================= helpers de autorização (SECURITY DEFINER evita recursão de RLS)
create function private.pt_role(org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m where m.organization_id = org and m.user_id = (select auth.uid());
$$;
create function private.pt_is_staff(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.pt_role(org) is not null; $$;
create function private.pt_is_manager(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(private.pt_role(org) in ('owner', 'admin', 'manager'), false); $$;
create function private.pt_is_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(private.pt_role(org) in ('owner', 'admin'), false); $$;

-- Papel do usuário na conta do cliente; nulo se não for membro ATIVO de uma conta ATIVA e não arquivada.
create function private.pt_client_role(client uuid) returns public.pt_client_role
language sql stable security definer set search_path = '' as $$
  select cm.role from public.client_members cm join public.client_accounts ca on ca.id = cm.client_account_id
  where cm.client_account_id = client and cm.user_id = (select auth.uid()) and cm.status = 'active' and ca.status = 'active' and ca.archived_at is null;
$$;
-- O usuário é cliente ativo em alguma conta desta prestadora?
create function private.pt_client_in_org(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_members cm join public.client_accounts ca on ca.id = cm.client_account_id
    where cm.organization_id = org and cm.user_id = (select auth.uid()) and cm.status = 'active' and ca.status = 'active' and ca.archived_at is null);
$$;
-- Equipe: administração, gestão e leitor veem todos os clientes; colaborador só os que gerencia ou onde tem solicitação atribuída.
create function private.pt_staff_sees_client(client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_accounts ca
    where ca.id = client and (
      private.pt_role(ca.organization_id) in ('owner', 'admin', 'manager', 'viewer')
      or (private.pt_role(ca.organization_id) = 'member' and (ca.assigned_manager_id = (select auth.uid())
          or exists (select 1 from public.requests r where r.client_account_id = ca.id and r.assigned_to = (select auth.uid()))))));
$$;
-- Pode ESCREVER pela prestadora (leitor não escreve).
create function private.pt_staff_writes_client(client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.pt_staff_sees_client(client) and exists (select 1 from public.client_accounts ca where ca.id = client and private.pt_role(ca.organization_id) in ('owner', 'admin', 'manager', 'member'));
$$;
create function private.pt_sees_client(client uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.pt_staff_sees_client(client) or private.pt_client_role(client) is not null; $$;
-- Comunicado dirigido: o cliente é destinatário? (função definer: a tabela de destinatários é só da gestão)
create function private.pt_ann_for_client(ann uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.announcement_recipients r where r.announcement_id = ann and private.pt_client_role(r.client_account_id) is not null);
$$;

do $$
declare f text;
begin
  foreach f in array array['private.pt_role(uuid)', 'private.pt_is_staff(uuid)', 'private.pt_is_manager(uuid)', 'private.pt_is_admin(uuid)', 'private.pt_client_role(uuid)', 'private.pt_client_in_org(uuid)',
    'private.pt_staff_sees_client(uuid)', 'private.pt_staff_writes_client(uuid)', 'private.pt_sees_client(uuid)', 'private.pt_ann_for_client(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ======================================================================= configuração e catálogos
create table public.portal_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  portal_name text not null default 'Portal do Cliente' check (char_length(portal_name) between 2 and 80),
  welcome_message text check (welcome_message is null or char_length(welcome_message) <= 600),
  footer_text text check (footer_text is null or char_length(footer_text) <= 300),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+$')),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  primary_color text not null default '#162A43' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#22D3EE' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) between 3 and 60),
  business_days integer[] not null default '{1,2,3,4,5}' check (cardinality(business_days) between 1 and 7 and business_days <@ array[1, 2, 3, 4, 5, 6, 7]),
  business_start time not null default time '09:00',
  business_end time not null default time '18:00',
  alert_due_soon_hours integer not null default 24 check (alert_due_soon_hours between 1 and 720),
  alert_stale_days integer not null default 7 check (alert_stale_days between 1 and 90),
  reopen_window_days integer not null default 15 check (reopen_window_days between 0 and 365),
  doc_max_mb integer not null default 20 check (doc_max_mb between 1 and 50),
  updated_at timestamptz not null default now(),
  check (business_start < business_end)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

-- Meta operacional por prioridade, em HORAS ÚTEIS (indicador de gestão; não é contrato).
create table public.service_level_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  priority public.pt_priority not null,
  target_hours integer not null check (target_hours between 1 and 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index sla_one_active_per_priority on public.service_level_policies (organization_id, priority) where active;

-- ======================================================================= clientes e usuários
create table public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  document_number text check (document_number is null or document_number ~ '^[0-9]{11}$|^[0-9]{14}$'),
  email text check (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+$')),
  phone text check (phone is null or char_length(phone) <= 30),
  status text not null default 'active' check (status in ('active', 'inactive')),
  assigned_manager_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id),
  foreign key (organization_id, assigned_manager_id) references public.organization_members (organization_id, user_id) on delete set null (assigned_manager_id)
);
create unique index client_accounts_doc_uniq on public.client_accounts (organization_id, document_number) where document_number is not null and archived_at is null;
create index client_accounts_org_idx on public.client_accounts (organization_id, status, name);

-- Observações internas: tabela à parte, só a equipe lê (RLS não esconde COLUNA; por isso não ficam em client_accounts).
create table public.client_internal_notes (
  client_account_id uuid primary key,
  organization_id uuid not null,
  notes text check (notes is null or char_length(notes) <= 4000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade
);

create table public.client_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.pt_client_role not null default 'client_user',
  status text not null default 'active' check (status in ('active', 'inactive')),
  invited_at timestamptz,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_account_id, user_id),
  unique (id, organization_id, client_account_id),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade
);
create index client_members_user_idx on public.client_members (user_id) where status = 'active';

-- Convites: token de alta entropia, só o HASH é guardado, uso único e expiração. O token bruto é mostrado UMA vez a quem convida.
create table public.invitation_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_account_id uuid,
  kind text not null check (kind in ('client', 'staff')),
  invited_email text not null check (invited_email = lower(invited_email) and char_length(invited_email) <= 254 and invited_email ~ '^[^@\s]+@[^@\s]+$'),
  invited_role text not null check (invited_role in ('client_admin', 'client_user', 'admin', 'manager', 'member', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade,
  check ((kind = 'client') = (client_account_id is not null)),
  check ((kind = 'client') = (invited_role in ('client_admin', 'client_user')))
);
create index invitations_org_idx on public.invitation_tokens (organization_id, created_at desc);

-- ======================================================================= solicitações
create table public.request_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number integer not null default 0
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  number integer not null,
  category_id uuid,
  title text not null check (char_length(title) between 3 and 160),
  description text check (description is null or char_length(description) <= 8000),
  status public.pt_request_status not null default 'open',
  priority public.pt_priority not null default 'normal',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  assigned_to uuid,
  due_at timestamptz,
  due_kind text check (due_kind in ('policy', 'agreed', 'estimate')),
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  reopened_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, organization_id, client_account_id),
  unique (organization_id, number),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade,
  foreign key (category_id, organization_id) references public.service_categories (id, organization_id),
  foreign key (organization_id, assigned_to) references public.organization_members (organization_id, user_id) on delete set null (assigned_to),
  check ((due_at is null) = (due_kind is null)),
  check (completed_at is null or status = 'completed'),
  check (closed_at is null or status = 'cancelled')
);
create index requests_client_idx on public.requests (client_account_id, status, created_at desc);
create index requests_org_status_idx on public.requests (organization_id, status, due_at);
create index requests_assignee_idx on public.requests (organization_id, assigned_to) where assigned_to is not null;

create table public.request_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  request_id uuid not null,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  visibility public.pt_comment_visibility not null default 'shared',
  created_at timestamptz not null default now(),
  unique (id, organization_id, client_account_id),
  foreign key (request_id, organization_id, client_account_id) references public.requests (id, organization_id, client_account_id) on delete cascade
);
create index request_comments_req_idx on public.request_comments (request_id, created_at);

create table public.request_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  client_account_id uuid not null,
  request_id uuid not null,
  previous_status public.pt_request_status,
  new_status public.pt_request_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  changed_at timestamptz not null default now(),
  foreign key (request_id, organization_id, client_account_id) references public.requests (id, organization_id, client_account_id) on delete cascade
);
create index request_history_idx on public.request_status_history (request_id, id);

-- Histórico de PRAZO: cada alteração acrescenta um evento (o prazo vigente fica em requests.due_at).
create table public.request_deadline_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  client_account_id uuid not null,
  request_id uuid not null,
  policy_id uuid,
  due_kind text not null check (due_kind in ('policy', 'agreed', 'estimate')),
  target_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 300),
  breached_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  calculated_at timestamptz not null default now(),
  foreign key (request_id, organization_id, client_account_id) references public.requests (id, organization_id, client_account_id) on delete cascade,
  foreign key (policy_id, organization_id) references public.service_level_policies (id, organization_id)
);
create index deadline_events_idx on public.request_deadline_events (request_id, id);

-- ======================================================================= documentos
create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  parent_folder_id uuid,
  name text not null check (char_length(name) between 1 and 80 and name !~ '[/\\]'),
  visibility public.pt_visibility not null default 'client',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id, client_account_id),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade,
  foreign key (parent_folder_id, organization_id, client_account_id) references public.document_folders (id, organization_id, client_account_id)
);
create unique index folders_name_uniq on public.document_folders (client_account_id, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where archived_at is null;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  folder_id uuid,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 600),
  original_file_name text not null check (char_length(original_file_name) between 1 and 200 and original_file_name !~ '[/\\]'),
  storage_path text not null unique check (char_length(storage_path) <= 300 and storage_path !~ '(^/|\.\.|\\)'),
  mime_type text not null check (mime_type in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'text/plain')),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  visibility public.pt_visibility not null default 'client',
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id, client_account_id),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade,
  foreign key (folder_id, organization_id, client_account_id) references public.document_folders (id, organization_id, client_account_id),
  check (storage_path like organization_id::text || '/' || client_account_id::text || '/%')
);
create index documents_client_idx on public.documents (client_account_id, created_at desc);

create table public.document_access_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  client_account_id uuid not null,
  document_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('upload', 'download', 'view', 'visibility_changed', 'archived')),
  occurred_at timestamptz not null default now(),
  foreign key (document_id, organization_id, client_account_id) references public.documents (id, organization_id, client_account_id) on delete cascade
);
create index document_logs_idx on public.document_access_logs (document_id, occurred_at desc);

create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  request_id uuid not null,
  comment_id uuid,
  document_id uuid not null,
  created_at timestamptz not null default now(),
  unique (request_id, document_id),
  foreign key (request_id, organization_id, client_account_id) references public.requests (id, organization_id, client_account_id) on delete cascade,
  foreign key (document_id, organization_id, client_account_id) references public.documents (id, organization_id, client_account_id) on delete cascade,
  foreign key (comment_id, organization_id, client_account_id) references public.request_comments (id, organization_id, client_account_id) on delete cascade
);

-- ======================================================================= entregas
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  request_id uuid,
  title text not null check (char_length(title) between 3 and 160),
  description text check (description is null or char_length(description) <= 4000),
  status public.pt_deliverable_status not null default 'draft',
  delivered_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id, client_account_id),
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade,
  foreign key (request_id, organization_id, client_account_id) references public.requests (id, organization_id, client_account_id),
  check ((status in ('published', 'acknowledged')) = (delivered_at is not null) or status = 'cancelled'),
  check ((status = 'acknowledged') = (acknowledged_at is not null) or status = 'cancelled')
);
create index deliverables_client_idx on public.deliverables (client_account_id, status, created_at desc);

create table public.deliverable_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_account_id uuid not null,
  deliverable_id uuid not null,
  document_id uuid not null,
  created_at timestamptz not null default now(),
  unique (deliverable_id, document_id),
  foreign key (deliverable_id, organization_id, client_account_id) references public.deliverables (id, organization_id, client_account_id) on delete cascade,
  foreign key (document_id, organization_id, client_account_id) references public.documents (id, organization_id, client_account_id) on delete cascade
);

-- ======================================================================= comunicados
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 8000),
  audience text not null default 'all' check (audience in ('all', 'selected')),
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  notified_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (expires_at is null or published_at is null or expires_at > published_at)
);
create table public.announcement_recipients (
  announcement_id uuid not null,
  client_account_id uuid not null,
  organization_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, client_account_id),
  foreign key (announcement_id, organization_id) references public.announcements (id, organization_id) on delete cascade,
  foreign key (client_account_id, organization_id) references public.client_accounts (id, organization_id) on delete cascade
);

-- ======================================================================= notificações
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_account_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) <= 40),
  title text not null check (char_length(title) <= 160),
  body text check (body is null or char_length(body) <= 400),
  resource_type text check (resource_type is null or resource_type in ('request', 'deliverable', 'document', 'announcement', 'client')),
  resource_id uuid,
  dedup_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedup_uniq on public.notifications (user_id, dedup_key) where dedup_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  muted_types text[] not null default '{}' check (cardinality(muted_types) <= 20),
  updated_at timestamptz not null default now()
);

-- ======================================================================= gatilhos
do $$
declare t text;
begin
  foreach t in array array['portal_settings', 'client_accounts', 'requests', 'deliverables', 'announcements', 'client_internal_notes', 'notification_preferences'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- Histórico e auditoria só acrescentam.
create function private.pt_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'registro imutável: não pode ser alterado nem apagado' using errcode = '23514'; end $$;
create trigger history_append_only before update or delete on public.request_status_history for each row execute function private.pt_append_only();
create trigger deadline_append_only before delete on public.request_deadline_events for each row execute function private.pt_append_only();
create trigger doc_logs_append_only before update or delete on public.document_access_logs for each row execute function private.pt_append_only();

-- Comentário e sua solicitação nunca mudam de dono/visibilidade por UPDATE direto (não há grant), e o corpo é imutável.
create function private.pt_comment_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'comentários não podem ser alterados nem apagados (histórico preservado)' using errcode = '23514'; end $$;
create trigger comments_immutable before update or delete on public.request_comments for each row execute function private.pt_comment_immutable();

-- ======================================================================= padrões por organização
create function private.pt_bootstrap_org(org uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.portal_settings (organization_id) values (org) on conflict do nothing;
  insert into public.request_counters (organization_id) values (org) on conflict do nothing;
  insert into public.service_categories (organization_id, name, description) values
    (org, 'Suporte', 'Problemas e ajustes em serviços já entregues'), (org, 'Dúvida', 'Perguntas sobre o serviço ou o andamento'),
    (org, 'Nova demanda', 'Pedido de novo trabalho ou melhoria'), (org, 'Documentos', 'Envio, correção ou solicitação de documentos'),
    (org, 'Financeiro', 'Questões administrativas e financeiras'), (org, 'Outros', null) on conflict do nothing;
  insert into public.service_level_policies (organization_id, name, priority, target_hours) values
    (org, 'Prioridade baixa', 'low', 80), (org, 'Prioridade normal', 'normal', 40), (org, 'Prioridade alta', 'high', 16), (org, 'Urgente', 'urgent', 4) on conflict do nothing;
end $$;
revoke all on function private.pt_bootstrap_org(uuid) from public;
create function private.pt_on_org_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.pt_bootstrap_org(new.id); return null; end $$;
revoke all on function private.pt_on_org_created() from public;
create trigger pt_on_org_created after insert on public.organizations for each row execute function private.pt_on_org_created();
select private.pt_bootstrap_org(id) from public.organizations;

do $$
declare t text;
begin
  foreach t in array array['client_accounts', 'client_members', 'service_categories', 'service_level_policies', 'announcements', 'invitation_tokens', 'document_folders'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_trigger(%L, %L)', 'audit_' || t, t, 'organization_id', 'id');
  end loop;
end $$;

create trigger audit_portal_settings after update on public.portal_settings for each row execute function private.audit_trigger('organization_id', 'organization_id');

-- ======================================================================= RLS
do $$
declare t text;
begin
  foreach t in array array['portal_settings', 'service_categories', 'service_level_policies', 'client_accounts', 'client_internal_notes', 'client_members', 'invitation_tokens', 'request_counters', 'requests',
    'request_comments', 'request_status_history', 'request_deadline_events', 'document_folders', 'documents', 'document_access_logs', 'request_attachments', 'deliverables', 'deliverable_files',
    'announcements', 'announcement_recipients', 'notifications', 'notification_preferences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
revoke select on public.invitation_tokens from authenticated;
grant select (id, organization_id, client_account_id, kind, invited_email, invited_role, expires_at, accepted_at, accepted_by, revoked_at, created_by, created_at) on public.invitation_tokens to authenticated;
revoke select on public.request_counters from authenticated;

create policy settings_select on public.portal_settings for select to authenticated using (private.pt_is_staff(organization_id) or private.pt_client_in_org(organization_id));
create policy settings_update on public.portal_settings for update to authenticated using (private.pt_is_admin(organization_id)) with check (private.pt_is_admin(organization_id));
create policy categories_select on public.service_categories for select to authenticated
  using (private.pt_is_staff(organization_id) or (active and private.pt_client_in_org(organization_id)));
create policy categories_write on public.service_categories for all to authenticated using (private.pt_is_admin(organization_id)) with check (private.pt_is_admin(organization_id));
create policy sla_select on public.service_level_policies for select to authenticated using (private.pt_is_staff(organization_id));
create policy sla_write on public.service_level_policies for all to authenticated using (private.pt_is_admin(organization_id)) with check (private.pt_is_admin(organization_id));

-- o ramo direto de gestor evita consultar a própria linha (INSERT ... RETURNING não a enxerga por função)
create policy accounts_select on public.client_accounts for select to authenticated using (private.pt_is_manager(organization_id) or private.pt_staff_sees_client(id) or private.pt_client_role(id) is not null);
create policy accounts_insert on public.client_accounts for insert to authenticated with check (private.pt_is_manager(organization_id));
create policy accounts_update on public.client_accounts for update to authenticated using (private.pt_is_manager(organization_id)) with check (private.pt_is_manager(organization_id));
create policy notes_select on public.client_internal_notes for select to authenticated using (private.pt_staff_sees_client(client_account_id));
create policy notes_insert on public.client_internal_notes for insert to authenticated with check (private.pt_staff_writes_client(client_account_id));
create policy notes_update on public.client_internal_notes for update to authenticated using (private.pt_staff_writes_client(client_account_id)) with check (private.pt_staff_writes_client(client_account_id));

create policy members_select on public.client_members for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or user_id = (select auth.uid()) or private.pt_client_role(client_account_id) = 'client_admin');
create policy invitations_select on public.invitation_tokens for select to authenticated
  using (private.pt_is_manager(organization_id) or (kind = 'client' and private.pt_client_role(client_account_id) = 'client_admin'));

create policy requests_select on public.requests for select to authenticated using (private.pt_sees_client(client_account_id));
create policy comments_select on public.request_comments for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or (visibility = 'shared' and private.pt_client_role(client_account_id) is not null));
create policy history_select on public.request_status_history for select to authenticated using (private.pt_sees_client(client_account_id));
create policy deadline_select on public.request_deadline_events for select to authenticated using (private.pt_staff_sees_client(client_account_id));

create policy folders_select on public.document_folders for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or (visibility = 'client' and archived_at is null and private.pt_client_role(client_account_id) is not null));
create policy documents_select on public.documents for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or (visibility = 'client' and archived_at is null and private.pt_client_role(client_account_id) is not null));
create policy doc_logs_select on public.document_access_logs for select to authenticated using (private.pt_is_manager(organization_id) and private.pt_staff_sees_client(client_account_id));
create policy attachments_select on public.request_attachments for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or (private.pt_client_role(client_account_id) is not null
    and exists (select 1 from public.documents d where d.id = document_id and d.visibility = 'client' and d.archived_at is null)
    and (comment_id is null or exists (select 1 from public.request_comments c where c.id = comment_id and c.visibility = 'shared'))));

create policy deliverables_select on public.deliverables for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or (status in ('published', 'acknowledged') and private.pt_client_role(client_account_id) is not null));
create policy dfiles_select on public.deliverable_files for select to authenticated
  using (private.pt_staff_sees_client(client_account_id) or (private.pt_client_role(client_account_id) is not null
    and exists (select 1 from public.deliverables d where d.id = deliverable_id and d.status in ('published', 'acknowledged'))
    and exists (select 1 from public.documents x where x.id = document_id and x.visibility = 'client' and x.archived_at is null)));

create policy announcements_select on public.announcements for select to authenticated
  using (private.pt_is_manager(organization_id)
    or (private.pt_is_staff(organization_id) and published_at is not null and archived_at is null)
    or (published_at is not null and published_at <= now() and archived_at is null and (expires_at is null or expires_at > now())
        and ((audience = 'all' and private.pt_client_in_org(organization_id))
             or (audience = 'selected' and private.pt_ann_for_client(id)))));
create policy announcements_insert on public.announcements for insert to authenticated with check (private.pt_is_manager(organization_id));
create policy announcements_update on public.announcements for update to authenticated using (private.pt_is_manager(organization_id)) with check (private.pt_is_manager(organization_id));
create policy recipients_select on public.announcement_recipients for select to authenticated using (private.pt_is_manager(organization_id));

create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prefs_select on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_insert on public.notification_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy prefs_update on public.notification_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- MFA no banco (padrão do Core) para as escritas diretas.
do $$
declare t text;
begin
  foreach t in array array['portal_settings', 'service_categories', 'service_level_policies', 'client_accounts', 'client_internal_notes', 'announcements'] loop
    execute format('create policy mfa_insert on public.%I as restrictive for insert to authenticated with check (private.mfa_ok())', t);
    execute format('create policy mfa_update on public.%I as restrictive for update to authenticated using (private.mfa_ok()) with check (private.mfa_ok())', t);
    execute format('create policy mfa_delete on public.%I as restrictive for delete to authenticated using (private.mfa_ok())', t);
  end loop;
end $$;

-- Privilégios por coluna: estado, vínculos e histórico só por funções.
grant update (portal_name, welcome_message, footer_text, contact_email, contact_phone, primary_color, secondary_color, timezone, business_days, business_start, business_end,
  alert_due_soon_hours, alert_stale_days, reopen_window_days, doc_max_mb) on public.portal_settings to authenticated;
grant insert (organization_id, name, description, active), update (name, description, active), delete on public.service_categories to authenticated;
grant insert (organization_id, name, priority, target_hours, active), update (name, target_hours, active) on public.service_level_policies to authenticated;
grant insert (organization_id, name, legal_name, document_number, email, phone, status, assigned_manager_id), update (name, legal_name, document_number, email, phone, status, assigned_manager_id, archived_at) on public.client_accounts to authenticated;
grant insert (client_account_id, organization_id, notes), update (notes) on public.client_internal_notes to authenticated;
grant insert (organization_id, title, body, audience, expires_at), update (title, body, audience, expires_at, archived_at) on public.announcements to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (user_id, muted_types), update (muted_types) on public.notification_preferences to authenticated;

commit;
