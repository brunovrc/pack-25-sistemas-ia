# Primeiros passos

> Nenhum sistema está disponível ainda; este guia descreve o fluxo que cada sistema validado seguirá. Confira o status em `catalogo/sistemas.json`.

1. **Escolha um sistema** e obtenha só ele (README, "Como obter só o sistema que você quer").
2. **Crie um projeto Supabase seu**, de preferência na região do Brasil, e anote URL e chaves. Nunca compartilhe a chave `service_role`.
3. **Configure o ambiente:** `cp .env.example .env.local` e preencha. Esse arquivo nunca vai ao git.
4. **Aplique as migrações** do sistema (`supabase/migrations`) no seu projeto.
5. **Instale e rode:** `pnpm install --frozen-lockfile` e `pnpm dev`.
6. **Carregue os dados de demonstração** (fictícios, removíveis) para conhecer o sistema. Nunca use dados reais em demonstração.
7. **Personalize** com Claude Code ou Codex ([claude-code.md](claude-code.md), [codex.md](codex.md)).
8. **Antes de usar com clientes:** rode `pnpm lint typecheck test build`, revise a [LGPD](../docs/LGPD_GUIDE.md) e o [checklist de segurança](../docs/SECURITY_STANDARD.md) §13, e teste backup e restauração.
