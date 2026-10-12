# MEMORY — PACK 25 SISTEMAS IA (raiz)
Atualizado em: 2026-10-12 | Versão: 0.2.0 | Estado: EM_DESENVOLVIMENTO (Fase C concluída; 1 de 25 VALIDADO)

## Missão
Produto de R$ 47 com 25 sistemas MVP independentes. Hub `pack-25-sistemas-ia` + um repositório espelho por sistema (`<slug>` (ex.: `crm-completo`)).

## Stack e caminhos-chave
Next 16.4.0 + React 19.3.0 + TypeScript 6.0.3 + Tailwind 4 + Supabase (ADR-009). Existe: `catalogo/`, `core/supabase/` (3 migrações + testes), `core/web/` (app), `scripts/`, `docs/`, `sistemas/` (25 pastas planejadas). Detalhes em `docs/CORE_WEB.md`.

## Implementado e verificado
- Catálogo de 25 sistemas: 01 `crm-completo` VALIDADO, 24 `PLANEJADO` — `node scripts/validate-catalog.mjs`: OK.
- **CRM Completo (Fase C)**: 24 testes obrigatórios com evidência em `sistemas/01-crm-completo/docs/FEATURES.md`; 114 unitários, testes de banco (RLS, regras, indicadores), 33 E2E, build; instalação isolada (export → install → testes) ok; CI do GitHub (web + e2e do Core e do CRM) verde em 2026-10-12. `sync-core` implementado (`--check` no CI).
- 25 pastas geradas com AGENTS/CLAUDE/MEMORY/README/.env.example/docs — `node scripts/generate-systems.mjs`.
- Core de banco (orgs, membros, papéis, RLS, auditoria imutável, solicitações LGPD) — `node scripts/test-core-db.mjs`: todos os testes passaram em Postgres 17 (Docker). Teste de mutação: política quebrada propositalmente foi reprovada pela suíte.
- Auditoria de referências/licenças — `docs/REFERENCE_AUDIT.md`.
- Exportador por sistema (`export-system.mjs`): recusou sistema PLANEJADO (exit 3); reprovou pacote contaminado com `workspace:`, referência fora da pasta e JWT (exit 1); exportou pasta limpa com manifesto e checksums. Gerador idempotente (2ª execução: 0 criados).
- Repositório público `pack-25-sistemas-ia/pack-25-sistemas-ia` (organização `pack-25-sistemas-ia`, transferido em 2026-10-12) com secret scanning, push protection e proteção do `main` (sem force-push; checks do CI obrigatórios). CI: ver histórico de execuções. `publish-mirrors.yml` **NÃO EXECUTADO** (sem sistema VALIDADO).

## Em implementação
- Nada em andamento. Próximo: sistema 02 (Fase D), um por vez, cada um com `docs/PLANO_IMPLEMENTACAO.md` antes do código.

## Pendências e riscos
- DECIDIDO: sem convite por e-mail no MVP (fora do escopo; "se previsto" no prompt). Adicionar pessoas = convite do painel Supabase + SQL documentado e testado em `docs/MEMBROS.md`.
- DECIDIDO (2026-10-12): repositórios públicos por sistema; LICENSE.md final sem dados pessoais; sem e-mail de contato nem canal de suporte nos repositórios (suporte via plataforma do curso). Falta só o `MIRROR_PUSH_TOKEN` para publicar pelo workflow (ou push manual).
- ALTA: **produção exige configuração do Supabase** diferente do padrão (TOTP, senha 12, confirmação de e-mail) — ver `docs/CORE_WEB.md`.
- MÉDIA: limitador de taxa do app é por instância; sem upload de logo (Storage).
- MÉDIA: gitleaks/`pnpm audit` no CI; SBOM; teste de restauração de backup.
- MÉDIA: acessibilidade verificada só por inspeção e teclado básico; falta auditoria automatizada (axe).

## Decisões relevantes
- 2026-10-12 — ADR-001 a ADR-012 em `docs/DECISIONS.md` (hub + espelhos, Core do zero, RLS sem FORCE, auditoria sem valores, TypeScript 6.0, MFA no banco, minimização de e-mails, CLI por checksum).

## Testes e deploy
- Core DB (Docker, Postgres 17 + harness): 25 blocos PASSARAM em 2026-10-12.
- Migrações no **Supabase real** local (CLI 2.120.0, Postgres 17.11): as 3 aplicaram sem erro (`supabase db reset`).
- Core web: `pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` 35 testes OK · `pnpm build` OK.
- Core web E2E (Playwright/Chromium contra Supabase real): 9 de 9 passaram (MFA TOTP real, isolamento, cookie adulterado, papéis, REST direto sem MFA barrado, CSP sem violações, open-redirect, sem enumeração).
- Revisão visual por capturas (celular, desktop, escuro): feita. CI do GitHub: ver histórico de execuções.
- Ambiente de deploy: não configurado

## Próxima tarefa recomendada
1. Publicar `crm-completo` (token de espelho ou push manual).
2. Fase D: sistema 02 (Gerador de Propostas), começando pelo PLANO_IMPLEMENTACAO.
3. Guia de personalização: `guias/personalizacao.md`.

## Referências
- `docs/ARCHITECTURE.md`; `docs/DECISIONS.md`; `docs/SECURITY_STANDARD.md`; `docs/LGPD_GUIDE.md`; `docs/DISTRIBUTION.md`
