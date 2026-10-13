---
name: multi-tenant-security
description: Use ao criar tabela, política, função, rota ou consulta que cruze empresas ou prestadoras.
---

# Isolamento multiempresa

- Toda tabela: `organization_id` + `client_account_id` quando for dado da empresa; RLS ligada; `revoke all` e `grant select` mínimo; escrita por função.
- Referências com chave composta `(id, organization_id, client_account_id)`: o banco recusa um comentário/anexo/entrega apontando para outra empresa.
- Visibilidade do cliente = `private.pt_client_role(conta)`: membro ATIVO de conta ATIVA e não arquivada. Equipe: `pt_staff_sees_client` (colaborador só por vínculo).
- Em política de `storage.objects`, use `objects.name` (dentro de subconsulta, `name` vira o da outra tabela).
- Toda página/ação/rota revalida sessão, MFA, conta ativa e papel (`requireContext`, `requirePortalContext`, `apiActor`). O cookie de conta ativa nunca é confiado.
- Resposta uniforme para «não existe» e «não é seu» (404, mensagem igual).
- Prove com teste: RLS A/B em `supabase/tests/61`, E2E de ataque via API (`tests/e2e/pt-security.spec.ts`) e mutação (`pnpm test:mutation`).
