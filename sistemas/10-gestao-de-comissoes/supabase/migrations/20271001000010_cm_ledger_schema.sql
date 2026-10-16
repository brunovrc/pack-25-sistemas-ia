-- Gestão de Comissões — ESQUEMA (parte 2): cálculo, livro de lançamentos, aprovação, contestação, ajustes, fechamento, pagamentos, importação, avisos.
-- Convenção de sinal (explícita): comissão, bônus e ajuste positivo > 0; ajuste negativo e estorno < 0. Lançamento nunca vale zero.

begin;
set local check_function_bodies = off;

-- ======================================================================= execuções de cálculo e memória de cálculo
create table public.commission_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_period_start date not null,
  reference_period_end date not null,
  run_type text not null check (run_type in ('sale', 'period', 'goals', 'reprocess')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  initiated_by uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  input_hash text check (input_hash ~ '^[0-9a-f]{64}$'),
  engine_version text not null check (char_length(engine_version) <= 20),
  error_message text check (char_length(error_message) <= 500),
  stats_json jsonb not null default '{}'::jsonb check (jsonb_typeof(stats_json) = 'object' and pg_column_size(stats_json) <= 8192),
  unique (id, organization_id),
  check (reference_period_end >= reference_period_start)
);
create index commission_runs_org_idx on public.commission_calculation_runs (organization_id, started_at desc);

create table public.commission_calculation_details (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  calculation_run_id uuid not null,
  component_key text not null check (char_length(component_key) <= 300),
  sale_id uuid,
  sale_item_id uuid,
  seller_id uuid not null,
  plan_version_id uuid not null,
  rule_id uuid,
  base_amount_cents bigint not null,
  rate_decimal numeric(12, 8),
  calculated_amount_cents bigint not null,
  eligible_amount_cents bigint not null,
  calculation_snapshot_json jsonb not null check (jsonb_typeof(calculation_snapshot_json) = 'object' and pg_column_size(calculation_snapshot_json) <= 32768),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (calculation_run_id, organization_id) references public.commission_calculation_runs (id, organization_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (sale_item_id, organization_id) references public.sale_items (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (plan_version_id, organization_id) references public.commission_plan_versions (id, organization_id),
  foreign key (rule_id, organization_id) references public.commission_rules (id, organization_id)
);
create index commission_details_component_idx on public.commission_calculation_details (organization_id, component_key, seller_id, created_at desc);
create index commission_details_sale_idx on public.commission_calculation_details (organization_id, sale_id);

create table public.commission_pendencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  calculation_run_id uuid,
  code text not null check (code ~ '^[A-Z_]{3,40}$'),
  severity text not null check (severity in ('critical', 'warning')),
  message text not null check (char_length(message) <= 300),
  sale_id uuid,
  seller_id uuid,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  foreign key (calculation_run_id, organization_id) references public.commission_calculation_runs (id, organization_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  check ((status = 'resolved') = (resolved_at is not null))
);
create unique index commission_pendencies_open_uniq on public.commission_pendencies
  (organization_id, code, coalesce(sale_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open';

-- ======================================================================= livro de lançamentos (central)
create table public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  sale_id uuid,
  sale_item_id uuid,
  plan_version_id uuid,
  rule_id uuid,
  calculation_detail_id uuid,
  component_key text not null check (char_length(component_key) <= 300),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 400),
  entry_type text not null check (entry_type in ('commission', 'bonus', 'adjustment_positive', 'adjustment_negative', 'reversal')),
  amount_cents bigint not null,
  currency text not null default 'BRL' check (currency = 'BRL'),
  eligibility_status text not null default 'eligible' check (eligibility_status = 'eligible'),
  approval_status text not null default 'calculated' check (approval_status in ('calculated', 'pending_review', 'approved', 'contested', 'rejected', 'adjusted')),
  effective_at date not null,
  eligible_at date not null,
  original_entry_id uuid,
  cause text not null check (cause in ('initial', 'receipt', 'return', 'cancellation', 'recalculation', 'goal', 'adjustment')),
  source_event_id text check (char_length(source_event_id) <= 100),
  origin text not null default 'engine' check (origin in ('engine', 'adjustment')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, idempotency_key),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (sale_item_id, organization_id) references public.sale_items (id, organization_id),
  foreign key (plan_version_id, organization_id) references public.commission_plan_versions (id, organization_id),
  foreign key (rule_id, organization_id) references public.commission_rules (id, organization_id),
  foreign key (calculation_detail_id, organization_id) references public.commission_calculation_details (id, organization_id),
  foreign key (original_entry_id, organization_id) references public.commission_entries (id, organization_id),
  check ((entry_type in ('commission', 'bonus', 'adjustment_positive') and amount_cents > 0) or (entry_type in ('adjustment_negative', 'reversal') and amount_cents < 0)),
  check (entry_type <> 'reversal' or original_entry_id is not null),
  check (origin = 'adjustment' or plan_version_id is not null),
  check (original_entry_id is null or entry_type in ('reversal', 'adjustment_negative', 'adjustment_positive'))
);
-- Estorno é referenciado e NUNCA se repete para o mesmo evento de origem (invariante 5).
create unique index commission_entries_reversal_once on public.commission_entries (organization_id, original_entry_id, source_event_id)
  where entry_type = 'reversal' and source_event_id is not null;
create index commission_entries_seller_idx on public.commission_entries (organization_id, seller_id, effective_at);
create index commission_entries_sale_idx on public.commission_entries (organization_id, sale_id);
create index commission_entries_status_idx on public.commission_entries (organization_id, approval_status, eligible_at);
create index commission_entries_component_idx on public.commission_entries (organization_id, component_key, seller_id);

create table public.commission_approval_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  commission_entry_id uuid not null,
  decision text not null check (decision in ('submitted', 'approved', 'rejected', 'contested', 'restored', 'adjusted')),
  reviewed_by uuid,
  justification text check (char_length(justification) <= 1000),
  reviewed_at timestamptz not null default now(),
  foreign key (commission_entry_id, organization_id) references public.commission_entries (id, organization_id),
  check (decision <> 'rejected' or char_length(trim(coalesce(justification, ''))) >= 10)
);
create index commission_approval_entry_idx on public.commission_approval_events (organization_id, commission_entry_id, reviewed_at);

create table public.commission_disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  commission_entry_id uuid not null,
  description text not null check (char_length(trim(description)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'rejected')),
  resolution text check (char_length(resolution) <= 2000),
  previous_approval_status text,
  adjustment_entry_id uuid,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  unique (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (commission_entry_id, organization_id) references public.commission_entries (id, organization_id),
  foreign key (adjustment_entry_id, organization_id) references public.commission_entries (id, organization_id),
  check ((status in ('resolved', 'rejected')) = (resolved_at is not null)),
  check (status not in ('resolved', 'rejected') or char_length(trim(coalesce(resolution, ''))) >= 5)
);
create unique index commission_disputes_open_uniq on public.commission_disputes (commission_entry_id) where status in ('open', 'in_review');

create table public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('positive', 'negative', 'exceptional_bonus', 'calculation_correction', 'administrative_reversal')),
  direction text not null check (direction in ('credit', 'debit')),
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  reference text check (char_length(reference) <= 120),
  related_entry_id uuid,
  effective_at date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  entry_id uuid,
  unique (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (related_entry_id, organization_id) references public.commission_entries (id, organization_id),
  foreign key (entry_id, organization_id) references public.commission_entries (id, organization_id),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'approved') = (entry_id is not null)),
  check ((adjustment_type in ('positive', 'exceptional_bonus') and direction = 'credit') or (adjustment_type in ('negative', 'administrative_reversal') and direction = 'debit') or adjustment_type = 'calculation_correction')
);

-- ======================================================================= períodos, fechamentos e pagamentos
create table public.commission_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'in_review', 'awaiting_approval', 'closed', 'cancelled')),
  prepared_by uuid,
  closed_by uuid,
  closed_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 1000),
  reopened_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check (period_end >= period_start),
  check ((status = 'closed') = (closed_at is not null)),
  exclude using gist (organization_id with =, daterange(period_start, period_end, '[]') with &&) where (status <> 'cancelled')
);

create table public.commission_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  period_id uuid not null,
  seller_id uuid not null,
  total_commissions_cents bigint not null default 0,
  total_bonuses_cents bigint not null default 0,
  total_adjustments_cents bigint not null default 0,
  total_reversals_cents bigint not null default 0,
  carryover_in_cents bigint not null default 0 check (carryover_in_cents >= 0),
  carryover_out_cents bigint not null default 0 check (carryover_out_cents >= 0),
  payable_amount_cents bigint not null default 0 check (payable_amount_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'closed', 'cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (period_id, organization_id) references public.commission_periods (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  -- aritmética do fechamento garantida pelo banco
  check (payable_amount_cents = greatest(total_commissions_cents + total_bonuses_cents + total_adjustments_cents + total_reversals_cents - carryover_in_cents, 0)),
  check (carryover_out_cents = greatest(carryover_in_cents - (total_commissions_cents + total_bonuses_cents + total_adjustments_cents + total_reversals_cents), 0)),
  check (status <> 'closed' or approved_at is not null),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index commission_closings_active_uniq on public.commission_closings (period_id, seller_id) where status <> 'cancelled';
create index commission_closings_seller_idx on public.commission_closings (organization_id, seller_id, created_at);

create table public.commission_closing_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  closing_id uuid not null,
  commission_entry_id uuid not null,
  amount_cents bigint not null check (amount_cents <> 0),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  foreign key (closing_id, organization_id) references public.commission_closings (id, organization_id),
  foreign key (commission_entry_id, organization_id) references public.commission_entries (id, organization_id)
);
-- Invariante 7: um lançamento só pode estar em UM fechamento ativo.
create unique index commission_closing_items_once on public.commission_closing_items (organization_id, commission_entry_id) where voided_at is null;
create index commission_closing_items_closing_idx on public.commission_closing_items (organization_id, closing_id);

create table public.payout_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  payment_date date not null,
  payment_method text not null check (payment_method in ('pix', 'ted', 'doc', 'boleto', 'cash', 'external_payroll', 'other')),
  external_reference text check (char_length(external_reference) between 1 and 120),
  status text not null default 'recorded' check (status in ('recorded', 'reversed')),
  notes text check (char_length(notes) <= 500),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text check (char_length(reversal_reason) <= 500),
  unique (id, organization_id),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  check ((status = 'reversed') = (reversed_at is not null))
);
create unique index payout_records_ref_uniq on public.payout_records (organization_id, seller_id, external_reference) where external_reference is not null and status = 'recorded';

create table public.payout_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payout_id uuid not null,
  closing_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (payout_id, closing_id),
  foreign key (payout_id, organization_id) references public.payout_records (id, organization_id),
  foreign key (closing_id, organization_id) references public.commission_closings (id, organization_id)
);
create index payout_allocations_closing_idx on public.payout_allocations (organization_id, closing_id);

create table public.commission_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  seller_id uuid not null,
  closing_id uuid not null,
  document_path text not null check (char_length(document_path) <= 300 and document_path !~ '(^/|\.\.|\\)'),
  document_hash text check (document_hash ~ '^[0-9a-f]{64}$'),
  version_number integer not null check (version_number >= 1),
  generated_at timestamptz not null default now(),
  created_by uuid,
  unique (closing_id, version_number),
  foreign key (seller_id, organization_id) references public.sellers (id, organization_id),
  foreign key (closing_id, organization_id) references public.commission_closings (id, organization_id)
);

-- ======================================================================= importação, avisos, simulações
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null check (char_length(file_name) <= 200),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  import_type text not null check (import_type in ('sales', 'customers', 'sellers', 'receipts', 'goals')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id)
);
create index import_jobs_org_idx on public.import_jobs (organization_id, created_at desc);

create table public.import_row_errors (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  import_job_id uuid not null,
  row_number integer not null check (row_number >= 1),
  error_code text not null check (char_length(error_code) <= 40),
  error_message text not null check (char_length(error_message) <= 300),
  foreign key (import_job_id, organization_id) references public.import_jobs (id, organization_id)
);
create index import_row_errors_job_idx on public.import_row_errors (organization_id, import_job_id, row_number);

alter table public.sales add constraint sales_import_job_fk foreign key (import_job_id, organization_id) references public.import_jobs (id, organization_id);

create table public.commission_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  type text not null check (char_length(type) <= 60),
  title text not null check (char_length(title) <= 120),
  body text check (char_length(body) <= 300),
  resource_type text check (char_length(resource_type) <= 40),
  resource_id uuid,
  dedupe_key text check (char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index commission_notifications_dedupe on public.commission_notifications (organization_id, user_id, dedupe_key) where dedupe_key is not null;
create index commission_notifications_user_idx on public.commission_notifications (organization_id, user_id, read_at, created_at desc);

create table public.commission_notification_prefs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  type text not null check (char_length(type) <= 60),
  enabled boolean not null default true,
  primary key (organization_id, user_id, type)
);

create table public.saved_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  input_json jsonb not null check (jsonb_typeof(input_json) = 'object' and pg_column_size(input_json) <= 16384),
  result_json jsonb not null check (jsonb_typeof(result_json) = 'object' and pg_column_size(result_json) <= 65536),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

commit;
