---
name: release-standalone
description: Verifica que um sistema do Pack instala e roda isolado, fora do repositório-fonte, e prepara o pacote/espelho. Use antes de marcar VALIDADO e antes de publicar.
---

# release-standalone

1. `node scripts/validate-catalog.mjs` e `node scripts/check-no-secrets.mjs`.
2. `node scripts/export-system.mjs <slug> --out <dir temporário>`; corrigir qualquer reprovação (dependência cruzada, segredo, arquivo ausente).
3. No diretório exportado, em um clone limpo: `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build`; migrações num Supabase novo; seed; fluxos críticos no Playwright.
4. Conferir `LICENSE.md`, `THIRD_PARTY_NOTICES.md`, `.env.example` sem valores, `README`, `MEMORY.md`.
5. Só então atualizar `status` no catálogo. Sem credenciais/deploy: `BLOQUEADO: dependência externa`.
6. Publicar o espelho pelo workflow `publish-mirrors` (aprovação do titular).
Registrar comando e resultado reais em `MEMORY.md`.
