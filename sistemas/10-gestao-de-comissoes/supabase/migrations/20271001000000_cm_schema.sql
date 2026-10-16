-- Gestão de Comissões — ESQUEMA: perfis, cadastros, vendas, recebimentos, planos, metas, cálculo, lançamentos, fechamentos, pagamentos.
-- Regras do sistema:
--  · TODA escrita passa por função SECURITY DEFINER (cm_*) que valida sessão, MFA, perfil e entrada. Nenhum INSERT/UPDATE/DELETE é concedido ao usuário.
--  · Dinheiro = centavos inteiros (bigint). Taxas = numeric exato. Sem ponto flutuante.
--  · Toda tabela de negócio tem organization_id; vínculos usam FK COMPOSTA (id, organization_id) — impossível referenciar outra empresa.
--  · Registros financeiros são imutáveis (lançamentos, fechamentos, pagamentos); correção = novo lançamento compensatório.
-- Regra do Core: tabela que referencia organization_members NÃO referencia organizations (PGRST201): user ids são uuid sem FK.

begin;
set local check_function_bodies = off;
create extension if not exists btree_gist;

-- ======================================================================= perfis
-- Papéis do Core → perfis de comissão: owner/admin = Administrador · manager = Gestor comercial ·
-- member = Financeiro ou Vendedor (conforme commission_access / vínculo com vendedor) · viewer = Consulta.
create table public.commission_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  profile text not null check (profile in ('finance', 'seller')),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ======================================================================= configurações
create table public.commission_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  date_format text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY', 'YYYY-MM-DD')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  negative_balance_policy text not null default 'carry_forward' check (negative_balance_policy in ('carry_forward', 'manual_review')),
  adjustment_approval_required boolean not null default true,
  segregation_of_duties boolean not null default false,
  allow_payout_over_balance boolean not null default false,
  allow_receipt_over_sale boolean not null default false,
  statement_template text not null default 'standard' check (statement_template in ('standard', 'compact')),
  statement_footer text check (char_length(statement_footer) <= 300),
  updated_at timestamptz not null default now()
);

-- ======================================================================= equipes e vendedores
create table public.sales_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (char_length(description) <= 300),
  manager_user_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index sales_teams_name_uniq on public.sales_teams (organization_id, lower(trim(name)));

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid,
  team_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  seller_code text not null check (seller_code ~ '^[A-Za-z0-9._-]{1,30}$'),
  seller_type text not null default 'internal' check (seller_type in ('internal', 'external', 'partner')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  starts_at date not null,
  ends_at date,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, seller_code),
  foreign key (team_id, organization_id) references public.sales_teams (id, organization_id),
  check (ends_at is null or ends_at >= starts_at)
);
create unique index sellers_user_uniq on public.sellers (organization_id, user_id) where user_id is not null and status <> 'archived';
create index sellers_team_idx on public.sellers (organization_id, team_id);

create table public.seller_team_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  team_id uuid,
  valid_from date not null,
  valid_until date,
  created_at timestamptz not null default now(),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (team_id, organization_id) references public.sales_teams (id, organization_id),
  check (valid_until is null or valid_until >= valid_from),
  exclude using gist (seller_id with =, daterange(valid_from, valid_until, '[]') with &&)
);

-- ======================================================================= clientes e catálogo mínimo
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  legal_name text check (char_length(legal_name) <= 200),
  document_number text check (document_number ~ '^[0-9./-]{0,20}$'),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id)
);
create unique index customers_doc_uniq on public.customers (organization_id, document_number) where document_number is not null and document_number <> '' and archived_at is null;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (char_length(description) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index product_categories_name_uniq on public.product_categories (organization_id, lower(trim(name)));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid,
  sku text not null check (sku ~ '^[A-Za-z0-9._-]{1,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (char_length(description) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, sku),
  foreign key (category_id, organization_id) references public.product_categories (id, organization_id)
);

-- ======================================================================= planos de comissão (versionados)
create table public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text check (char_length(description) <= 500),
  calculation_basis text not null check (calculation_basis in ('net_value', 'received_value', 'gross_margin', 'fixed_per_sale', 'fixed_per_unit')),
  eligibility_event text not null default 'sale_confirmation' check (eligibility_event in ('sale_confirmation', 'full_receipt', 'proportional_receipt')),
  plan_type text not null default 'individual' check (plan_type in ('individual', 'team', 'campaign')),
  returns_policy text not null default 'proportional' check (returns_policy in ('proportional', 'manual')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (calculation_basis <> 'received_value' or eligibility_event = 'proportional_receipt')
);
create unique index commission_plans_name_uniq on public.commission_plans (organization_id, lower(trim(name))) where status = 'active';

create table public.commission_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null,
  version_number integer not null check (version_number >= 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  precedence_json jsonb not null default '[["product","seller"],["category","seller"],["channel","product"],["product"],["category"],["seller"],["channel"],["team"],[]]'::jsonb
    check (jsonb_typeof(precedence_json) = 'array' and pg_column_size(precedence_json) <= 4096),
  configuration_snapshot_json jsonb,
  valid_from date,
  valid_until date,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (plan_id, version_number),
  foreign key (plan_id, organization_id) references public.commission_plans (id, organization_id),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check ((status = 'published') = (published_at is not null and valid_from is not null and configuration_snapshot_json is not null))
);
create unique index plan_versions_one_draft on public.commission_plan_versions (plan_id) where status = 'draft';
create index plan_versions_lookup on public.commission_plan_versions (organization_id, plan_id, valid_from) where status = 'published';

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_version_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 100),
  rule_type text not null check (rule_type in ('percentage', 'fixed', 'tiered')),
  scope_type text not null default 'organization' check (scope_type in ('organization', 'team', 'seller', 'category', 'product', 'channel')),
  scope_reference text check (char_length(scope_reference) <= 80),
  conditions_json jsonb check (conditions_json is null or (jsonb_typeof(conditions_json) = 'object' and pg_column_size(conditions_json) <= 4096)),
  rate_decimal numeric(12, 8) check (rate_decimal between 0 and 1),
  fixed_amount_cents bigint check (fixed_amount_cents >= 0),
  tier_mode text check (tier_mode in ('marginal', 'reached')),
  tier_period text check (tier_period in ('month', 'quarter', 'year')),
  tier_scope text check (tier_scope in ('individual', 'team')),
  priority integer not null default 0 check (priority between -1000 and 1000),
  stack_behavior text not null default 'exclusive' check (stack_behavior in ('exclusive', 'stack')),
  entry_kind text not null default 'commission' check (entry_kind in ('commission', 'bonus')),
  enabled boolean not null default true,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (plan_version_id, organization_id) references public.commission_plan_versions (id, organization_id),
  check (rule_type <> 'percentage' or (rate_decimal is not null and fixed_amount_cents is null and tier_mode is null)),
  check (rule_type <> 'fixed' or (fixed_amount_cents is not null and rate_decimal is null and tier_mode is null)),
  check (rule_type <> 'tiered' or (tier_mode is not null and tier_period is not null and tier_scope is not null and rate_decimal is null and fixed_amount_cents is null)),
  check (scope_type = 'organization' or scope_reference is not null),
  check (entry_kind = 'commission' or rule_type = 'fixed'),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create index commission_rules_version_idx on public.commission_rules (organization_id, plan_version_id);

create table public.commission_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_version_id uuid not null,
  rule_id uuid not null,
  tier_order integer not null check (tier_order between 1 and 50),
  threshold_from_cents bigint not null check (threshold_from_cents >= 0),
  threshold_to_cents bigint,
  rate_decimal numeric(12, 8) not null check (rate_decimal between 0 and 1),
  calculation_mode text not null check (calculation_mode in ('marginal', 'reached')),
  created_at timestamptz not null default now(),
  unique (rule_id, tier_order),
  foreign key (rule_id, organization_id) references public.commission_rules (id, organization_id),
  foreign key (plan_version_id, organization_id) references public.commission_plan_versions (id, organization_id),
  check (threshold_to_cents is null or threshold_to_cents > threshold_from_cents)
);

create table public.seller_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  plan_id uuid not null,
  valid_from date not null,
  valid_until date,
  assigned_by uuid,
  created_at timestamptz not null default now(),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (plan_id, organization_id) references public.commission_plans (id, organization_id),
  check (valid_until is null or valid_until >= valid_from),
  -- precedência explícita: UMA atribuição por vendedor em cada data (a troca encerra a anterior no dia anterior)
  exclude using gist (seller_id with =, daterange(valid_from, valid_until, '[]') with &&)
);
create index seller_plan_assignments_idx on public.seller_plan_assignments (organization_id, seller_id, valid_from);

-- ======================================================================= vendas
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid,
  sale_number text not null check (char_length(trim(sale_number)) between 1 and 40),
  external_reference text check (char_length(external_reference) between 1 and 80),
  source text not null default 'manual' check (source in ('manual', 'import')),
  sale_date date not null,
  channel text check (char_length(channel) <= 40),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'partially_returned', 'cancelled', 'totally_returned')),
  split_model text not null default 'pool' check (split_model in ('pool', 'independent')),
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  discount_amount_cents bigint not null default 0 check (discount_amount_cents >= 0),
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  commissionable_amount_cents bigint not null check (commissionable_amount_cents >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  import_job_id uuid,
  confirmed_at timestamptz,
  confirmed_on date,
  cancelled_at timestamptz,
  cancelled_on date,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  new_customer boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, sale_number),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  check (net_amount_cents = gross_amount_cents - discount_amount_cents),
  check (commissionable_amount_cents <= net_amount_cents),
  check (status = 'draft' or (confirmed_at is not null and confirmed_on is not null))
);
create unique index sales_external_ref_uniq on public.sales (organization_id, external_reference) where external_reference is not null;
create index sales_date_idx on public.sales (organization_id, sale_date, status);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  position integer not null default 1 check (position between 1 and 500),
  product_id uuid,
  description text check (char_length(description) <= 200),
  quantity_decimal numeric(14, 4) not null check (quantity_decimal > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  commissionable_amount_cents bigint not null check (commissionable_amount_cents >= 0),
  cost_cents bigint check (cost_cents >= 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (sale_id, position),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (product_id, organization_id) references public.products (id, organization_id),
  check (commissionable_amount_cents <= net_amount_cents)
);

create table public.sale_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  seller_id uuid not null,
  participation_type text not null default 'primary' check (participation_type in ('primary', 'secondary')),
  allocation_percentage numeric(9, 6) not null check (allocation_percentage > 0 and allocation_percentage <= 100),
  allocated_amount_cents bigint not null default 0 check (allocated_amount_cents >= 0),
  plan_version_id uuid,
  created_at timestamptz not null default now(),
  unique (sale_id, seller_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (plan_version_id, organization_id) references public.commission_plan_versions (id, organization_id)
);
create unique index sale_participants_one_primary on public.sale_participants (sale_id) where participation_type = 'primary';
create index sale_participants_seller_idx on public.sale_participants (organization_id, seller_id);

create table public.sale_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  event_type text not null check (event_type in ('confirmed', 'cancelled', 'partially_returned', 'totally_returned', 'corrected')),
  event_amount_cents bigint not null default 0 check (event_amount_cents >= 0),
  external_event_id text check (char_length(external_event_id) between 1 and 80),
  effective_at date not null,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object' and pg_column_size(metadata_json) <= 8192),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id)
);
create unique index sale_events_external_uniq on public.sale_events (organization_id, sale_id, external_event_id) where external_event_id is not null;
create unique index sale_events_one_confirmed on public.sale_events (sale_id) where event_type = 'confirmed';
create index sale_events_sale_idx on public.sale_events (organization_id, sale_id, effective_at);

create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  external_reference text check (char_length(external_reference) between 1 and 80),
  amount_cents bigint not null check (amount_cents > 0),
  received_at date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'reversed')),
  notes text check (char_length(notes) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text check (char_length(reversal_reason) <= 300),
  unique (id, organization_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  check ((status = 'reversed') = (reversed_at is not null))
);
create unique index customer_receipts_ref_uniq on public.customer_receipts (organization_id, sale_id, external_reference) where external_reference is not null and status = 'confirmed';
create index customer_receipts_sale_idx on public.customer_receipts (organization_id, sale_id);

-- ======================================================================= metas e bônus
create table public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  goal_type text not null check (goal_type in ('sold_value', 'received_value', 'sales_count', 'new_customers', 'product_value', 'product_units')),
  target_value_decimal numeric(20, 4) not null check (target_value_decimal > 0),
  period_start date not null,
  period_end date not null,
  scope_type text not null check (scope_type in ('seller', 'team', 'organization')),
  scope_reference_id uuid,
  product_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (product_id, organization_id) references public.products (id, organization_id),
  check (period_end >= period_start),
  check ((scope_type = 'organization') = (scope_reference_id is null)),
  check ((goal_type in ('product_value', 'product_units')) = (product_id is not null))
);

create table public.goal_bonus_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_version_id uuid not null,
  goal_id uuid not null,
  threshold_decimal numeric(9, 4) not null check (threshold_decimal > 0 and threshold_decimal <= 1000),
  bonus_type text not null check (bonus_type in ('fixed', 'rate')),
  bonus_rate_decimal numeric(12, 8) check (bonus_rate_decimal between 0 and 1),
  bonus_amount_cents bigint check (bonus_amount_cents >= 0),
  award_timing text not null default 'period_end' check (award_timing in ('on_attainment', 'period_end')),
  distribution text not null default 'each' check (distribution in ('each', 'proportional')),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (goal_id, organization_id) references public.sales_goals (id, organization_id),
  foreign key (plan_version_id, organization_id) references public.commission_plan_versions (id, organization_id),
  check ((bonus_type = 'fixed') = (bonus_amount_cents is not null and bonus_rate_decimal is null))
);

commit;
