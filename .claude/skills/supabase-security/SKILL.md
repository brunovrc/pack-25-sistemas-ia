---
name: supabase-security
description: Cria e revisa migrações Supabase/Postgres, políticas RLS, grants e testes de isolamento multiempresa. Use em qualquer mudança de schema, política, função SQL ou Storage.
---

# supabase-security

Regras para toda migração:
- Tabela de negócio: `organization_id not null`, RLS ligada, índices em chaves de política, `updated_at` por trigger.
- Políticas por operação (SELECT/INSERT/UPDATE/DELETE) via `private.is_member` / `private.has_role`; nunca `using (true)`.
- `SECURITY DEFINER` sempre com `set search_path = ''`; views com `security_invoker = true`.
- Grants por coluna no UPDATE; `anon` sem privilégio salvo rota pública deliberada e documentada.
- Histórico financeiro/estoque: imutável (estorno em vez de edição), transação e idempotência.
- Storage: bucket privado, política por organização, URL assinada.
- Auditoria: triggers de `private.audit_trigger` (metadados, nunca valores).

Teste obrigatório (modelo: `core/supabase/tests/10_rls_isolation.sql`): usuários de orgs A e B; SELECT/INSERT/UPDATE/DELETE cruzados negados; papéis; anon; higiene estrutural. Rodar `node scripts/test-core-db.mjs` e reportar o resultado real.
Sempre incluir um teste de mutação mental: "se esta política fosse `true`, algum teste falharia?"
