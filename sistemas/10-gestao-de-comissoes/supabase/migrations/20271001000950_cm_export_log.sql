-- Gestão de Comissões — REGISTRO DE EXPORTAÇÕES (auditoria): quem exportou o quê, sem os valores exportados.

begin;

create function public.cm_log_export(p_org uuid, p_kind text, p_rows integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'read');
  if char_length(coalesce(p_kind, '')) not between 1 and 60 then raise exception 'tipo inválido' using errcode = '22023'; end if;
  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, changes)
  values (p_org, (select auth.uid()), 'export', 'report', p_kind, jsonb_build_object('rows', greatest(0, least(coalesce(p_rows, 0), 1000000))));
end $$;

commit;
