-- Gestão de Comissões — CONTEXTO DO USUÁRIO para o app: perfil, vendedor vinculado e lista de pessoas para o administrador.

begin;
set local check_function_bodies = off;

create function public.cm_my_context(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'sessão inválida' using errcode = '28000'; end if;
  return jsonb_build_object('profile', private.cm_profile(p_org), 'seller_id', private.cm_my_seller(p_org),
    'managed_team_ids', coalesce((select jsonb_agg(t.id) from public.sales_teams t where t.organization_id = p_org and t.manager_user_id = (select auth.uid())), '[]'::jsonb));
end $$;

-- Pessoas da empresa (somente administrador): para vincular login a vendedor, definir gestor de equipe e perfil de acesso.
create function public.cm_org_members(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.cm_guard(p_org, 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'email', p.email, 'name', p.full_name, 'access', a.profile,
      'seller_id', (select s.id from public.sellers s where s.organization_id = p_org and s.user_id = m.user_id and s.status <> 'archived' limit 1)) order by p.email)
    from public.organization_members m left join public.profiles p on p.id = m.user_id left join public.commission_access a on a.organization_id = m.organization_id and a.user_id = m.user_id
    where m.organization_id = p_org), '[]'::jsonb);
end $$;

commit;
