---
name: supabase-security
description: Use ao criar tabela, função, política, privilégio ou rota deste sistema.
---

# Segurança do banco

- Toda tabela: `organization_id`, RLS, chaves compostas, `revoke all` e `grant` mínimo por coluna. Escrita sensível só por função `security definer` com `set search_path = ''`, papel e MFA checados dentro. Nenhuma função do sistema é executável pelo `anon`.
- Funções de métricas são `security invoker`. Helpers ficam em `private` (fora da API).
- Históricos (comentários, situação, trilha de acessos, auditoria) são imutáveis por gatilho.
- O app não usa `service_role`. O script de seed de arquivos só roda contra o Supabase local.
- Teste cada regra nova com RLS A/B e mutação (`pnpm test:mutation`).
- Armadilhas: (1) `String.replace` do JS com `$$`, `$'` ou `$&` na substituição corrompe SQL — use Edit/sed ou função de substituição; (2) `name` em política de `storage.objects` dentro de subconsulta resolve para a outra tabela — use `objects.name`.
