-- Gestão de Comissões — ARMAZENAMENTO PRIVADO DOS DEMONSTRATIVOS (PDF).
-- Caminho: <organização>/<vendedor>/<fechamento>-v<n>.pdf. Leitura: quem pode ver a remuneração daquele vendedor. Gravação: financeiro/administrador.
-- Sem política de UPDATE/DELETE: o PDF emitido não é reescrito (nova emissão = nova versão). Só cria o bucket se o Storage existir (ex.: Postgres puro de teste não tem).

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('statements', 'statements', false, 5242880, array['application/pdf']) on conflict (id) do nothing;

    execute $p$create policy cm_statements_read on storage.objects for select to authenticated using (
      bucket_id = 'statements' and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      and private.cm_can_see_seller(split_part(objects.name, '/', 1)::uuid, split_part(objects.name, '/', 2)::uuid))$p$;
    execute $p$create policy cm_statements_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'statements' and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}-v[0-9]{1,4}\.pdf$'
      and private.cm_is_finance(split_part(objects.name, '/', 1)::uuid))$p$;
  end if;
end $$;
