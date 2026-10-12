# MEMORY — PACK 25 SISTEMAS IA (raiz)
Atualizado em: 2026-10-12 | Versão: 0.1.0 | Estado: EM_DESENVOLVIMENTO (fundação)

## Missão
Produto de R$ 47 com 25 sistemas MVP independentes. Hub `pack-25-sistemas-ia` + um repositório espelho por sistema (`pack25-NN-slug`).

## Stack e caminhos-chave
Next 16.4.0 + React 19.3.0 + TypeScript 6.0.3 + Tailwind 4 + Supabase (ADR-009). Existe: `catalogo/`, `core/supabase/` (3 migrações + testes), `core/web/` (app), `scripts/`, `docs/`, `sistemas/` (25 pastas planejadas). Detalhes em `docs/CORE_WEB.md`.

## Implementado e verificado
- Catálogo de 25 sistemas, todos `PLANEJADO` — `node scripts/validate-catalog.mjs`: OK.
- 25 pastas geradas com AGENTS/CLAUDE/MEMORY/README/.env.example/docs — `node scripts/generate-systems.mjs`.
- Core de banco (orgs, membros, papéis, RLS, auditoria imutável, solicitações LGPD) — `node scripts/test-core-db.mjs`: todos os testes passaram em Postgres 17 (Docker). Teste de mutação: política quebrada propositalmente foi reprovada pela suíte.
- Auditoria de referências/licenças — `docs/REFERENCE_AUDIT.md`.
- Exportador por sistema (`export-system.mjs`): recusou sistema PLANEJADO (exit 3); reprovou pacote contaminado com `workspace:`, referência fora da pasta e JWT (exit 1); exportou pasta limpa com manifesto e checksums. Gerador idempotente (2ª execução: 0 criados).
- Repositório público `brunovrc/pack-25-sistemas-ia` com secret scanning, push protection e proteção do `main` (sem force-push; checks do CI obrigatórios). CI: ver histórico de execuções. `publish-mirrors.yml` **NÃO EXECUTADO** (sem sistema VALIDADO).

## Em implementação
- Nada em andamento.

## Pendências e riscos
- ALTA: convite de membros por e-mail (token hasheado, expirável) ainda não existe; hoje só dá para gerenciar quem já é membro.
- ALTA: decisões do titular — `LICENSE.md` (rascunho), e-mail de segurança, repositórios espelho e token (modelo de venda definido: plataforma de cursos + links por e-mail, ver `docs/DISTRIBUTION.md`; falta decidir por sistema público x ZIP) (ver `docs/DISTRIBUTION.md`).
- ALTA: **produção exige configuração do Supabase** diferente do padrão (TOTP, senha 12, confirmação de e-mail) — ver `docs/CORE_WEB.md`.
- MÉDIA: `sync-core` (ADR-004) ainda não implementado; limitador de taxa do app é por instância; sem upload de logo (Storage).
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
1. Convite de membros por e-mail (tabela de convites com token hasheado e expiração, aceite autenticado, testes RLS e E2E). Depois: `sync-core` e o CRM piloto (Etapa C).

## Referências
- `docs/ARCHITECTURE.md`; `docs/DECISIONS.md`; `docs/SECURITY_STANDARD.md`; `docs/LGPD_GUIDE.md`; `docs/DISTRIBUTION.md`
