---
name: supabase-security
description: Use ao criar tabela, política, RPC ou bucket.
---

# supabase-security

- `organization_id` + FK composta `(id, organization_id)`; RLS só SELECT; escrita por RPC `cm_*` SECURITY DEFINER com `search_path` fixo, MFA, papel e escopo checados.
- Nunca desligar RLS. Sem `service_role` no app. Triggers de imutabilidade com GUC `cm.*_update` ligado só dentro da função.
- Testes: `supabase/tests/10_*`, `70_cm_security.sql`; E2E de API direta.
