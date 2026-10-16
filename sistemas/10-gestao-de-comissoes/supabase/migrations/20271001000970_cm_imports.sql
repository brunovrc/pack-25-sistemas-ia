-- Gestão de Comissões — REGISTRO DE IMPORTAÇÕES (histórico e erros por linha). As linhas em si entram pelas MESMAS funções dos cadastros
-- (cm_save_customer, cm_save_seller, cm_save_sale_draft, cm_register_receipt, cm_save_goal): importar não contorna nenhuma regra.

begin;
set local check_function_bodies = off;

create function public.cm_import_begin(p_org uuid, p_file_name text, p_hash text, p_type text, p_total integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; prev int;
begin
  perform private.cm_guard(p_org, 'manager');
  if p_type not in ('sales', 'customers', 'sellers', 'receipts', 'goals') then raise exception 'tipo de importação inválido' using errcode = '22023'; end if;
  select count(*) into prev from public.import_jobs where organization_id = p_org and file_hash = p_hash and import_type = p_type and status = 'completed';
  insert into public.import_jobs (organization_id, file_name, file_hash, import_type, total_rows, created_by)
  values (p_org, left(private.cm_req_text(p_file_name, 1, 200, 'Arquivo'), 200), p_hash, p_type, greatest(coalesce(p_total, 0), 0), (select auth.uid())) returning id into v_id;
  return jsonb_build_object('job_id', v_id, 'same_file_before', prev);
end $$;

create function public.cm_import_errors(p_org uuid, p_job uuid, p_errors jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e jsonb; n int := 0;
begin
  perform private.cm_guard(p_org, 'manager');
  if not exists (select 1 from public.import_jobs where id = p_job and organization_id = p_org and status = 'processing') then raise exception 'importação não encontrada' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_errors) <> 'array' or jsonb_array_length(p_errors) > 1000 then raise exception 'lote de erros inválido' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_errors) loop
    insert into public.import_row_errors (organization_id, import_job_id, row_number, error_code, error_message)
    values (p_org, p_job, greatest((e ->> 'row')::int, 1), left(coalesce(e ->> 'code', 'ERRO'), 40), left(coalesce(e ->> 'message', ''), 300));
    n := n + 1;
  end loop;
end $$;

create function public.cm_import_finish(p_org uuid, p_job uuid, p_accepted integer, p_rejected integer, p_failed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.cm_guard(p_org, 'manager');
  perform set_config('cm.flag_update', 'on', true);
  update public.import_jobs set status = case when p_failed then 'failed' else 'completed' end, accepted_rows = greatest(p_accepted, 0), rejected_rows = greatest(p_rejected, 0), completed_at = now()
  where id = p_job and organization_id = p_org and status = 'processing';
  get diagnostics n = row_count;
  perform set_config('cm.flag_update', 'off', true);
  if n = 0 then raise exception 'importação não encontrada' using errcode = 'P0002'; end if;
  if p_rejected > 0 or p_failed then perform private.cm_notify_finance(p_org, 'import_failed', 'Importação com rejeições', p_rejected || ' linha(s) rejeitada(s); veja o relatório de erros.', 'import', p_job, 'imp:' || p_job); end if;
end $$;

commit;
