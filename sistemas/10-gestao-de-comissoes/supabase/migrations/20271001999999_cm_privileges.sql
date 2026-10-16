-- Gestão de Comissões — PRIVILÉGIOS DAS FUNÇÕES (última migração do sistema).
-- O Supabase concede EXECUTE a anon/public por padrão. Aqui: nada para anon/public; só usuário autenticado chama as funções cm_*
-- (cada uma ainda valida sessão, MFA e perfil por dentro).

begin;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'cm\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

commit;
