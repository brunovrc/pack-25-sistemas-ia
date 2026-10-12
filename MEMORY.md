# MEMORY — PACK 25 SISTEMAS IA (raiz)
Atualizado em: 2026-10-11 | Versão: 0.1.0 | Estado: EM_DESENVOLVIMENTO (fundação)

## Missão
Produto de R$ 47 com 25 sistemas MVP independentes. Hub `pack-25-sistemas-ia` + um repositório espelho por sistema (`pack25-NN-slug`).

## Stack e caminhos-chave
Next.js + TS + Tailwind + shadcn/ui + Supabase (a materializar no Core web). Hoje existe: `catalogo/`, `core/supabase/` (SQL + testes), `scripts/`, `docs/`, `sistemas/` (25 pastas planejadas).

## Implementado e verificado
- Catálogo de 25 sistemas, todos `PLANEJADO` — `node scripts/validate-catalog.mjs`: OK.
- 25 pastas geradas com AGENTS/CLAUDE/MEMORY/README/.env.example/docs — `node scripts/generate-systems.mjs`.
- Core de banco (orgs, membros, papéis, RLS, auditoria imutável, solicitações LGPD) — `node scripts/test-core-db.mjs`: todos os testes passaram em Postgres 17 (Docker). Teste de mutação: política quebrada propositalmente foi reprovada pela suíte.
- Auditoria de referências/licenças — `docs/REFERENCE_AUDIT.md`.
- Exportador por sistema (`export-system.mjs`): recusou sistema PLANEJADO (exit 3); reprovou pacote contaminado com `workspace:`, referência fora da pasta e JWT (exit 1); exportou pasta limpa com manifesto e checksums. Gerador idempotente (2ª execução: 0 criados).
- CI (`ci.yml`) e `publish-mirrors.yml` escritos com ações fixadas por SHA — **NÃO EXECUTADOS** (sem remoto GitHub ainda). `git init` feito, sem commits.

## Em implementação
- Nada em andamento.

## Pendências e riscos
- ALTA: Core web (Next.js 16, Supabase SSR, MFA, UX base) ainda não existe.
- ALTA: decisões do titular — `LICENSE.md` (rascunho), e-mail de segurança, modelo de acesso do comprador, criação dos repositórios e token de espelho (ver `docs/DISTRIBUTION.md`).
- MÉDIA: `sync-core` ainda não implementado (ADR-004). TypeScript 7 vs anterior a decidir (ADR-009).
- MÉDIA: scanner de segredos dedicado (gitleaks) e `pnpm audit` entram com o Core web.
- Supabase CLI não instalado; testes de banco rodam em Postgres puro com harness que emula o Supabase. Falta validar com Supabase real.

## Decisões relevantes
- 2026-10-11 — ADR-001 a ADR-009 em `docs/DECISIONS.md` (hub + espelhos, Core do zero, RLS sem FORCE, auditoria sem valores).

## Testes e deploy
- Último lint/typecheck/unit/e2e/build: NÃO EXECUTADO (não há app Next.js ainda)
- Core DB (Docker, Postgres 17): PASSOU em 2026-10-11
- Ambiente de deploy: não configurado

## Próxima tarefa recomendada
1. Core web: criar app base em `core/`, fixar versões (Next 16.x), Supabase SSR, login/logout/recuperação, MFA para admin, shell de UX, testes e CI.

## Referências
- `docs/ARCHITECTURE.md`; `docs/DECISIONS.md`; `docs/SECURITY_STANDARD.md`; `docs/LGPD_GUIDE.md`; `docs/DISTRIBUTION.md`
