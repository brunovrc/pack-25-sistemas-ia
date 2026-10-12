# AGENTS — Pack 25 Sistemas IA (repositório-fonte)

Produto comercial: 25 MVPs independentes em `sistemas/NN-slug/`. Status real: `catalogo/sistemas.json` e cada `MEMORY.md`.

## Regras invioláveis
1. Nada de telas falsas, métricas simuladas como reais ou fluxos que não persistem. Nada "concluído" sem evidência (comando + resultado). O que não rodou fica **NÃO EXECUTADO**.
2. Sem segredos no git; `service_role` jamais no navegador; RLS nunca afrouxada para demo.
3. Licenças: não copiar AGPL/GPL/SSPL, `enterprise/`, `ee/` ou marcas de terceiros. Registrar o que for incorporado em `THIRD_PARTY_NOTICES.md`.
4. Cada pasta de sistema é autossuficiente: sem `workspace:*`, sem importar de fora, sem citar outro sistema.
5. Escopo: somente o produto principal e seus 25 sistemas. Sem promessa de renda ao comprador.
6. Um sistema por vez. Não implementar os 25 numa só execução.

## Segurança e LGPD (obrigatórios)
Seguir `docs/SECURITY_STANDARD.md` (ASVS L2) e `docs/LGPD_GUIDE.md`. Toda tabela com `organization_id` + RLS; toda mutação valida sessão, papel e entrada no servidor; logs sem PII; auditoria sem valores.

## Fluxo ao iniciar/concluir
- Iniciar: ler este arquivo, o `MEMORY.md` do alvo e só os arquivos necessários; `git status` antes de editar.
- Concluir: atualizar `MEMORY.md` com fatos comprovados, testes e próxima ação. Histórico longo vai para `docs/CHANGELOG_INTERNAL.md`.

## Comandos
`node scripts/validate-catalog.mjs` · `node scripts/generate-systems.mjs` · `node scripts/check-no-secrets.mjs` · `node scripts/test-core-db.mjs` (requer Docker) · `node scripts/export-system.mjs <slug>` · Core web (em `core/web`): `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:e2e` (ver `docs/CORE_WEB.md`)

## Skills internas (`.claude/skills/`), carregar só quando a tarefa pedir
product-scope · ui-polish · supabase-security · domain-workflow · release-standalone · memory-handoff · token-efficiency. Skills externas: só após ler integralmente e fixar commit.

## Definição de pronto (`VALIDADO`)
install/lint/typecheck/test/build e Playwright passam; migrações em banco limpo; seed reproduzível; auth completo; teste RLS A/B nega acesso cruzado; checklist de `SECURITY_STANDARD.md` §13; mobile e desktop revisados; licenças e segredos verificados; instalação isolada validada via `export-system`; docs e `MEMORY.md` atualizados. Sem credenciais/deploy: `BLOQUEADO: dependência externa`.
