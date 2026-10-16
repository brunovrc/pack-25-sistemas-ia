-- Gestão de Comissões — FECHAMENTO MENSAL, PAGAMENTOS REGISTRADOS E DEMONSTRATIVOS.
-- Fluxo: abrir período → preparar (conferência) → enviar para aprovação → fechar. Fechado = imutável; correção só por reabertura formal
-- (sem pagamentos ativos, só o último período) ou por lançamentos compensatórios em período posterior.
-- Pagamento é REGISTRO de algo feito fora do sistema: nada transfere dinheiro. Estornar um registro preserva o histórico.

begin;
set local check_function_bodies = off;

-- ======================================================================= saldos (derivados; RLS do chamador vale)
create view public.commission_closing_balances with (security_invoker = true) as
select c.id as closing_id, c.organization_id, c.seller_id, c.period_id, c.payable_amount_cents,
  coalesce((select sum(a.amount_cents) from public.payout_allocations a join public.payout_records p on p.id = a.payout_id and p.organization_id = a.organization_id
            where a.closing_id = c.id and a.organization_id = c.organization_id and p.status = 'recorded'), 0)::bigint as paid_cents
from public.commission_closings c where c.status = 'closed';
revoke all on public.commission_closing_balances from anon, authenticated;
grant select on public.commission_closing_balances to authenticated;

-- ======================================================================= verificações do período (bloqueios × avisos)
create function private.cm_period_checks(p_org uuid, p_period uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare per public.commission_periods; crit int; disputes int; pend_n int; pend_sum bigint; neg int; policy text; earlier int;
begin
  select * into per from public.commission_periods where id = p_period and organization_id = p_org;
  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;
  select count(*) into crit from public.commission_pendencies x left join public.sales s on s.id = x.sale_id and s.organization_id = x.organization_id
    where x.organization_id = p_org and x.status = 'open' and x.severity = 'critical' and (x.sale_id is null or s.sale_date <= per.period_end);
  select count(*) into disputes from public.commission_disputes d join public.commission_entries e on e.id = d.commission_entry_id and e.organization_id = d.organization_id
    where d.organization_id = p_org and d.status in ('open', 'in_review') and e.eligible_at <= per.period_end;
  select count(*), coalesce(sum(amount_cents), 0) into pend_n, pend_sum from public.commission_entries e
    where e.organization_id = p_org and e.approval_status in ('calculated', 'pending_review') and e.eligible_at <= per.period_end;
  select negative_balance_policy into policy from public.commission_settings where organization_id = p_org;
  select count(*) into neg from public.commission_closings c where c.period_id = p_period and c.status <> 'cancelled' and c.carryover_out_cents > 0 and coalesce(policy, 'carry_forward') = 'manual_review';
  select count(*) into earlier from public.commission_periods x where x.organization_id = p_org and x.period_end < per.period_start and x.status not in ('closed', 'cancelled');
  return jsonb_build_object(
    'critical_pendencies', crit, 'open_disputes', disputes, 'pending_entries', pend_n, 'pending_entries_cents', pend_sum, 'negative_balances_blocking', neg, 'earlier_open_periods', earlier,
    'period_in_future', per.period_end > private.cm_today(p_org),
    'blocked', crit > 0 or disputes > 0 or neg > 0 or earlier > 0 or per.period_end > private.cm_today(p_org));
end $$;
revoke all on function private.cm_period_checks(uuid, uuid) from public, anon, authenticated;

create function public.cm_period_checks(p_org uuid, p_period uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'finance');
  return private.cm_period_checks(p_org, p_period);
end $$;

-- ======================================================================= período
create function public.cm_open_period(p_org uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.cm_guard(p_org, 'finance');
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then raise exception 'período inválido' using errcode = '22023'; end if;
  begin
    insert into public.commission_periods (organization_id, period_start, period_end, created_by) values (p_org, p_start, p_end, (select auth.uid())) returning id into v_id;
  exception when exclusion_violation then raise exception 'o período se sobrepõe a outro período existente' using errcode = '23514';
  end;
  return v_id;
end $$;

-- Prepara (ou refaz) os fechamentos individuais com tudo que está APROVADO, elegível até o fim do período e ainda fora de outro fechamento.
create function public.cm_prepare_closings(p_org uuid, p_period uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare per public.commission_periods; s record; v_cl uuid; tc bigint; tb bigint; ta bigint; tr bigint; cin bigint; net bigint; n int := 0; policy text; prev record; chk jsonb;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into per from public.commission_periods where id = p_period and organization_id = p_org for update;
  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;
  if per.status not in ('open', 'in_review') then raise exception 'o período não está em conferência' using errcode = '23514'; end if;
  chk := private.cm_period_checks(p_org, p_period);
  if (chk ->> 'earlier_open_periods')::int > 0 then raise exception 'feche os períodos anteriores antes deste' using errcode = '23514'; end if;
  if (chk ->> 'period_in_future')::boolean then raise exception 'o período ainda não terminou' using errcode = '23514'; end if;
  perform set_config('cm.closing_update', 'on', true);
  perform set_config('cm.period_update', 'on', true);
  -- refaz: cancela rascunhos anteriores deste período e libera seus itens
  update public.commission_closing_items i set voided_at = now() from public.commission_closings c
    where c.id = i.closing_id and c.organization_id = i.organization_id and c.period_id = p_period and c.status in ('draft', 'awaiting_approval') and i.voided_at is null;
  update public.commission_closings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'refeito na conferência' where period_id = p_period and status in ('draft', 'awaiting_approval');
  select negative_balance_policy into policy from public.commission_settings where organization_id = p_org;
  for s in
    select sl.id as seller_id from public.sellers sl where sl.organization_id = p_org and (
      exists (select 1 from public.commission_entries e where e.seller_id = sl.id and e.organization_id = p_org and e.approval_status = 'approved' and e.eligible_at <= per.period_end
              and not exists (select 1 from public.commission_closing_items i where i.commission_entry_id = e.id and i.voided_at is null))
      or exists (select 1 from public.commission_closings c where c.seller_id = sl.id and c.status = 'closed' and c.carryover_out_cents > 0
                 and c.id = (select c2.id from public.commission_closings c2 join public.commission_periods p2 on p2.id = c2.period_id where c2.seller_id = sl.id and c2.status = 'closed' order by p2.period_end desc limit 1)))
    order by sl.id
  loop
    select coalesce(sum(e.amount_cents) filter (where e.entry_type = 'commission'), 0), coalesce(sum(e.amount_cents) filter (where e.entry_type = 'bonus'), 0),
           coalesce(sum(e.amount_cents) filter (where e.entry_type in ('adjustment_positive', 'adjustment_negative')), 0), coalesce(sum(e.amount_cents) filter (where e.entry_type = 'reversal'), 0)
      into tc, tb, ta, tr
    from public.commission_entries e where e.seller_id = s.seller_id and e.organization_id = p_org and e.approval_status = 'approved' and e.eligible_at <= per.period_end
      and not exists (select 1 from public.commission_closing_items i where i.commission_entry_id = e.id and i.voided_at is null);
    -- saldo devedor herdado do último fechamento CONCLUÍDO do vendedor
    select c.carryover_out_cents into cin from public.commission_closings c join public.commission_periods p2 on p2.id = c.period_id
      where c.seller_id = s.seller_id and c.status = 'closed' and p2.period_end < per.period_start order by p2.period_end desc limit 1;
    cin := coalesce(cin, 0);
    net := tc + tb + ta + tr;
    insert into public.commission_closings (organization_id, period_id, seller_id, total_commissions_cents, total_bonuses_cents, total_adjustments_cents, total_reversals_cents,
      carryover_in_cents, carryover_out_cents, payable_amount_cents)
    values (p_org, p_period, s.seller_id, tc, tb, ta, tr, cin, greatest(cin - net, 0), greatest(net - cin, 0)) returning id into v_cl;
    insert into public.commission_closing_items (organization_id, closing_id, commission_entry_id, amount_cents)
    select p_org, v_cl, e.id, e.amount_cents from public.commission_entries e where e.seller_id = s.seller_id and e.organization_id = p_org and e.approval_status = 'approved' and e.eligible_at <= per.period_end
      and not exists (select 1 from public.commission_closing_items i where i.commission_entry_id = e.id and i.voided_at is null);
    n := n + 1;
  end loop;
  update public.commission_periods set status = 'in_review', prepared_by = (select auth.uid()) where id = p_period;
  perform set_config('cm.closing_update', 'off', true);
  perform set_config('cm.period_update', 'off', true);
  return jsonb_build_object('closings', n, 'checks', private.cm_period_checks(p_org, p_period));
end $$;

create function public.cm_submit_period(p_org uuid, p_period uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare per public.commission_periods; chk jsonb;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into per from public.commission_periods where id = p_period and organization_id = p_org for update;
  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;
  if per.status <> 'in_review' then raise exception 'prepare a conferência antes de enviar para aprovação' using errcode = '23514'; end if;
  chk := private.cm_period_checks(p_org, p_period);
  if (chk ->> 'blocked')::boolean then raise exception 'há inconsistências críticas que impedem o fechamento' using errcode = '23514'; end if;
  perform set_config('cm.closing_update', 'on', true);
  perform set_config('cm.period_update', 'on', true);
  update public.commission_closings set status = 'awaiting_approval' where period_id = p_period and status = 'draft';
  update public.commission_periods set status = 'awaiting_approval' where id = p_period;
  perform set_config('cm.closing_update', 'off', true);
  perform set_config('cm.period_update', 'off', true);
  perform private.cm_notify_finance(p_org, 'closing_awaiting', 'Fechamento aguardando aprovação', 'Um período foi enviado para aprovação.', 'period', p_period, 'cl-wait:' || p_period);
end $$;

create function public.cm_close_period(p_org uuid, p_period uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare per public.commission_periods; chk jsonb; seg boolean; n int; s record;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into per from public.commission_periods where id = p_period and organization_id = p_org for update;
  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;
  if per.status <> 'awaiting_approval' then raise exception 'o período não está aguardando aprovação' using errcode = '23514'; end if;
  select segregation_of_duties into seg from public.commission_settings where organization_id = p_org;
  if coalesce(seg, false) and per.prepared_by = (select auth.uid()) then raise exception 'segregação de funções: quem preparou o fechamento não o aprova' using errcode = '42501'; end if;
  chk := private.cm_period_checks(p_org, p_period);
  if (chk ->> 'blocked')::boolean then raise exception 'há inconsistências críticas que impedem o fechamento' using errcode = '23514'; end if;
  -- os itens ainda precisam estar aprovados (nada mudou desde a preparação)
  if exists (select 1 from public.commission_closing_items i join public.commission_closings c on c.id = i.closing_id and c.organization_id = i.organization_id
             join public.commission_entries e on e.id = i.commission_entry_id and e.organization_id = i.organization_id
             where c.period_id = p_period and c.status = 'awaiting_approval' and i.voided_at is null and e.approval_status <> 'approved') then
    raise exception 'há lançamentos do fechamento que deixaram de estar aprovados: refaça a conferência' using errcode = '23514';
  end if;
  perform set_config('cm.closing_update', 'on', true);
  perform set_config('cm.period_update', 'on', true);
  update public.commission_closings set status = 'closed', approved_by = (select auth.uid()), approved_at = now() where period_id = p_period and status = 'awaiting_approval';
  get diagnostics n = row_count;
  update public.commission_periods set status = 'closed', closed_by = (select auth.uid()), closed_at = now() where id = p_period;
  perform set_config('cm.closing_update', 'off', true);
  perform set_config('cm.period_update', 'off', true);
  for s in select c.seller_id, c.id from public.commission_closings c where c.period_id = p_period and c.status = 'closed' loop
    perform private.cm_notify_seller_side(p_org, s.seller_id, 'closing_done', 'Fechamento concluído', 'Seu demonstrativo do período está disponível.', 'closing', s.id, 'cl-done:' || s.id, false);
  end loop;
  return jsonb_build_object('closed', n);
end $$;

-- Reabertura formal: só o último período fechado, sem pagamentos ativos, com justificativa e autorização do administrador.
create function public.cm_reopen_period(p_org uuid, p_period uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare per public.commission_periods;
begin
  perform private.cm_guard(p_org, 'admin');
  select * into per from public.commission_periods where id = p_period and organization_id = p_org for update;
  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;
  if per.status <> 'closed' then raise exception 'só períodos fechados são reabertos' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 20 then raise exception 'a reabertura exige justificativa (mín. 20 caracteres)' using errcode = '22023'; end if;
  if exists (select 1 from public.payout_allocations a join public.payout_records p on p.id = a.payout_id and p.organization_id = a.organization_id
             join public.commission_closings c on c.id = a.closing_id and c.organization_id = a.organization_id where c.period_id = p_period and p.status = 'recorded') then
    raise exception 'há pagamentos registrados neste período: estorne-os antes de reabrir (valores pagos não são editados retroativamente)' using errcode = '23514';
  end if;
  if exists (select 1 from public.commission_periods x where x.organization_id = p_org and x.period_start > per.period_end and x.status <> 'cancelled') then
    raise exception 'reabra primeiro os períodos posteriores' using errcode = '23514';
  end if;
  perform set_config('cm.closing_update', 'on', true);
  perform set_config('cm.period_update', 'on', true);
  update public.commission_closing_items i set voided_at = now() from public.commission_closings c where c.id = i.closing_id and c.organization_id = i.organization_id and c.period_id = p_period and i.voided_at is null;
  update public.commission_closings set status = 'cancelled', cancelled_at = now(), cancel_reason = left('reabertura: ' || btrim(p_reason), 1000) where period_id = p_period and status <> 'cancelled';
  update public.commission_periods set status = 'open', closed_at = null, closed_by = null, reopened_count = reopened_count + 1, prepared_by = null where id = p_period;
  perform set_config('cm.closing_update', 'off', true);
  perform set_config('cm.period_update', 'off', true);
  perform private.cm_audit(p_org, 'reopen', 'commission_periods', p_period, jsonb_build_object('reason_length', char_length(btrim(p_reason))));
  perform private.cm_notify_finance(p_org, 'period_reopened', 'Período reaberto', 'Um fechamento foi reaberto por procedimento formal.', 'period', p_period, 'reopen:' || p_period || ':' || (per.reopened_count + 1));
end $$;

create function public.cm_cancel_period(p_org uuid, p_period uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare per public.commission_periods;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into per from public.commission_periods where id = p_period and organization_id = p_org for update;
  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;
  if per.status not in ('open', 'in_review', 'awaiting_approval') then raise exception 'só períodos ainda não fechados são cancelados' using errcode = '23514'; end if;
  perform set_config('cm.closing_update', 'on', true);
  perform set_config('cm.period_update', 'on', true);
  update public.commission_closing_items i set voided_at = now() from public.commission_closings c where c.id = i.closing_id and c.organization_id = i.organization_id and c.period_id = p_period and i.voided_at is null;
  update public.commission_closings set status = 'cancelled', cancelled_at = now(), cancel_reason = left(private.cm_req_text(p_reason, 5, 1000, 'Motivo'), 1000) where period_id = p_period and status <> 'cancelled';
  update public.commission_periods set status = 'cancelled', cancel_reason = btrim(p_reason) where id = p_period;
  perform set_config('cm.closing_update', 'off', true);
  perform set_config('cm.period_update', 'off', true);
end $$;

-- ======================================================================= pagamentos registrados
-- p_alloc: [{"closing_id": uuid, "amount_cents": n}]. O valor do pagamento é a soma das alocações.
create function public.cm_record_payout(p_org uuid, p_seller uuid, p_date date, p_method text, p_ref text, p_notes text, p_alloc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a jsonb; c public.commission_closings; total bigint := 0; v_id uuid; bal bigint; allow boolean; seg boolean; ids uuid[] := '{}'; cid uuid; amt bigint; d date;
begin
  perform private.cm_guard(p_org, 'finance');
  if jsonb_typeof(p_alloc) <> 'array' or jsonb_array_length(p_alloc) not between 1 and 24 then raise exception 'informe de 1 a 24 fechamentos' using errcode = '22023'; end if;
  d := coalesce(p_date, private.cm_today(p_org));
  if d > private.cm_today(p_org) then raise exception 'data de pagamento no futuro' using errcode = '22023'; end if;
  if not exists (select 1 from public.sellers where id = p_seller and organization_id = p_org) then raise exception 'vendedor não encontrado' using errcode = 'P0002'; end if;
  select allow_payout_over_balance, segregation_of_duties into allow, seg from public.commission_settings where organization_id = p_org;
  -- trava os fechamentos em ordem fixa (pagamentos simultâneos do mesmo saldo se enfileiram)
  select array_agg(distinct (x ->> 'closing_id')::uuid order by (x ->> 'closing_id')::uuid) into ids from jsonb_array_elements(p_alloc) x;
  if array_length(ids, 1) <> jsonb_array_length(p_alloc) then raise exception 'fechamento repetido nas alocações' using errcode = '22023'; end if;
  foreach cid in array ids loop
    select * into c from public.commission_closings where id = cid and organization_id = p_org for update;
    if not found or c.seller_id <> p_seller then raise exception 'fechamento inválido para este vendedor' using errcode = '22023'; end if;
    if c.status <> 'closed' then raise exception 'só fechamentos concluídos recebem pagamento' using errcode = '23514'; end if;
    if coalesce(seg, false) and c.approved_by = (select auth.uid()) then raise exception 'segregação de funções: quem aprovou o fechamento não registra o pagamento' using errcode = '42501'; end if;
  end loop;
  -- 1) valida cada alocação contra o saldo (fechamentos já travados acima) e soma o valor real do pagamento
  for a in select * from jsonb_array_elements(p_alloc) loop
    cid := (a ->> 'closing_id')::uuid; amt := (a ->> 'amount_cents')::bigint;
    if amt is null or amt <= 0 then raise exception 'valor de alocação inválido' using errcode = '22023'; end if;
    select c2.payable_amount_cents - coalesce((select sum(pa.amount_cents) from public.payout_allocations pa join public.payout_records pr on pr.id = pa.payout_id and pr.organization_id = pa.organization_id
        where pa.closing_id = c2.id and pr.status = 'recorded'), 0) into bal from public.commission_closings c2 where c2.id = cid;
    if amt > bal and not coalesce(allow, false) then raise exception 'o pagamento (%) excede o saldo aprovado a pagar (%)', amt, bal using errcode = '23514'; end if;
    total := total + amt;
  end loop;
  -- 2) grava o pagamento (valor = soma das alocações) e as alocações; um trigger adiado confere a igualdade no commit
  begin
    insert into public.payout_records (organization_id, seller_id, amount_cents, payment_date, payment_method, external_reference, notes, recorded_by)
    values (p_org, p_seller, total, d, p_method, private.cm_opt_text(p_ref, 120, 'Referência'), private.cm_opt_text(p_notes, 500, 'Observações'), (select auth.uid())) returning id into v_id;
  exception when unique_violation then raise exception 'já existe pagamento registrado com esta referência para o vendedor' using errcode = '23514';
  end;
  for a in select * from jsonb_array_elements(p_alloc) loop
    insert into public.payout_allocations (organization_id, payout_id, closing_id, amount_cents) values (p_org, v_id, (a ->> 'closing_id')::uuid, (a ->> 'amount_cents')::bigint);
  end loop;
  perform private.cm_notify_seller_side(p_org, p_seller, 'payout_recorded', 'Pagamento registrado', 'Um pagamento de comissão foi registrado.', 'payout', v_id, 'pay:' || v_id, false);
  return v_id;
end $$;

create function public.cm_reverse_payout(p_org uuid, p_payout uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payout_records;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into p from public.payout_records where id = p_payout and organization_id = p_org for update;
  if not found then raise exception 'pagamento não encontrado' using errcode = 'P0002'; end if;
  if p.status <> 'recorded' then raise exception 'pagamento já estornado' using errcode = '23514'; end if;
  perform set_config('cm.payout_update', 'on', true);
  update public.payout_records set status = 'reversed', reversed_at = now(), reversed_by = (select auth.uid()), reversal_reason = private.cm_req_text(p_reason, 5, 500, 'Motivo') where id = p_payout;
  perform set_config('cm.payout_update', 'off', true);
  perform private.cm_notify_finance(p_org, 'payout_reversed', 'Pagamento estornado', 'Um registro de pagamento foi estornado.', 'payout', p_payout, 'payrev:' || p_payout);
end $$;

-- ======================================================================= demonstrativos
create function public.cm_register_statement(p_org uuid, p_closing uuid, p_path text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.commission_closings; v int; v_id uuid;
begin
  perform private.cm_guard(p_org, 'finance');
  select * into c from public.commission_closings where id = p_closing and organization_id = p_org for update;
  if not found then raise exception 'fechamento não encontrado' using errcode = 'P0002'; end if;
  if c.status <> 'closed' then raise exception 'o demonstrativo só é gerado para fechamento concluído' using errcode = '23514'; end if;
  select coalesce(max(version_number), 0) + 1 into v from public.commission_statements where closing_id = p_closing;
  if p_path is distinct from format('%s/%s/%s-v%s.pdf', p_org, c.seller_id, p_closing, v) then raise exception 'caminho do documento inválido' using errcode = '22023'; end if;
  insert into public.commission_statements (organization_id, seller_id, closing_id, document_path, document_hash, version_number, created_by)
  values (p_org, c.seller_id, p_closing, p_path, p_hash, v, (select auth.uid())) returning id into v_id;
  perform private.cm_notify_seller_side(p_org, c.seller_id, 'statement_available', 'Demonstrativo disponível', 'Seu demonstrativo está disponível para download.', 'closing', p_closing, 'stmt:' || v_id, false);
  return jsonb_build_object('id', v_id, 'version', v, 'path', p_path);
end $$;

commit;
