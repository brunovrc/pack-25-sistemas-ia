# MEMORY — PACK 25 SISTEMAS IA (raiz)
Atualizado em: 2026-10-13 | Versão: 0.3.0 | Estado: EM_DESENVOLVIMENTO (5 de 25 VALIDADOS)

## Missão
Produto de R$ 47 com 25 sistemas MVP independentes. Hub `pack-25-sistemas-ia` + um repositório espelho por sistema (`<slug>` (ex.: `crm-completo`)).

## Stack e caminhos-chave
Next 16.4.0 + React 19.3.0 + TypeScript 6.0.3 + Tailwind 4 + Supabase (ADR-009). Existe: `catalogo/`, `core/supabase/` (3 migrações + testes), `core/web/` (app), `scripts/`, `docs/`, `sistemas/` (25 pastas planejadas). Detalhes em `docs/CORE_WEB.md`.

## Implementado e verificado
- Catálogo de 25 sistemas: 01 `crm-completo`, 02 `propostas-comerciais`, 03 `qualificador-leads`, 04 `pos-venda`, 05 `portal-b2b` e 06 `financeiro-completo` VALIDADOS, 19 `PLANEJADO` — `node scripts/validate-catalog.mjs`: OK.
- **Gestão Financeira Empresarial (06)**: título/parcela → baixa → movimento imutável (saldo = saldo inicial + movimentos), centavos em bigint com rateio por maior resto espelhado SQL↔TS, baixa idempotente e estorno compensatório, transferências de duas pernas, recorrência idempotente, fluxo realizado/projetado (3 cenários), importação CSV + conciliação manual, anexos privados, exportação auditada, MFA no banco, 10 KPIs/10 gráficos/15 relatórios; 139 unit, DB 60–67 + concorrência real, 59 mutações reprovadas (a de trava de parcela depende de execução sem carga paralela), 49 E2E (também na cópia exportada, rodados por arquivo); lição: FK dupla para organization_members e organizations gera PGRST201 no Core; ajustes do Core em .core-overrides.
- **Portal de Clientes B2B (05)**: prestadora × empresa cliente (usuário de cliente nunca em `organization_members`), regras no banco (RLS, funções `pt_*`, chaves compostas, históricos imutáveis), SLA em horas úteis, convites com hash, documentos em bucket privado com tipo real pelos bytes, URL assinada de 60 s e trilha imutável, painel único para equipe e cliente (10 KPIs, 8 gráficos), 72 unit, DB 60–64 com 33 mutações reprovadas, 49 E2E (14 cenários de ameaça); instalação isolada validada; jobs `portal-*` do CI verdes.
- **Pós-Venda e Reativação (04)**: RFM determinístico em SQL com espelho TS (fixtures à mão, percentil em inteiros), sinais de risco com explicação, oportunidades com prioridade, segmentos sem SQL livre, campanhas manuais (ausência de permissão ≠ consentimento; recusa vira supressão; resultado «observado», nunca causal), importação CSV por assistente (prévia = gravação), painel (10 KPIs, 9 gráficos), 12 relatórios com CSV auditado, seed de 206 clientes; 137 unit, DB com 78 mutações reprovadas, 35 E2E (também na cópia exportada), CI verde nos jobs do 04 em 2026-10-13. Lição: comparações de compra (guarda só o DIA) com eventos são por data local; `cpSync` com filtro derrubou o Node no Windows (export-system agora copia manualmente).
- **Qualificador de Leads (03)**: validação e pontuação no banco com espelho TS (mesmas fixtures de score e de formulário), versões imutáveis de formulário e modelo, captação pública (honeypot, limite de taxa no banco, duplicidade, UTM), distribuição com trava, Kanban, painel (10 KPIs, 9 gráficos), IA opcional separada do score, seed de 150 leads; 163 unit, DB com 31 mutações reprovadas, 31 E2E (também na cópia exportada), CI verde.
- **Gestão de Propostas Comerciais (02)**: cálculo no banco com espelho TS (mesmas fixtures), snapshot imutável, PDF react-pdf, link público por hash, painel (8 KPIs, 7 gráficos), 115 unit, DB com 14 mutações detectadas, 37 E2E (também na cópia exportada), CI verde. Core ganhou `PUBLIC_ENDPOINT` e `public-prefixes`.
- **CRM Completo (Fase C)**: 24 testes obrigatórios com evidência em `sistemas/01-crm-completo/docs/FEATURES.md`; 114 unitários, testes de banco (RLS, regras, indicadores), 33 E2E, build; instalação isolada (export → install → testes) ok; CI do GitHub (web + e2e do Core e do CRM) verde em 2026-10-12. `sync-core` implementado (`--check` no CI).
- 25 pastas geradas com AGENTS/CLAUDE/MEMORY/README/.env.example/docs — `node scripts/generate-systems.mjs`.
- Core de banco (orgs, membros, papéis, RLS, auditoria imutável, solicitações LGPD) — `node scripts/test-core-db.mjs`: todos os testes passaram em Postgres 17 (Docker). Teste de mutação: política quebrada propositalmente foi reprovada pela suíte.
- Auditoria de referências/licenças — `docs/REFERENCE_AUDIT.md`.
- Exportador por sistema (`export-system.mjs`): recusou sistema PLANEJADO (exit 3); reprovou pacote contaminado com `workspace:`, referência fora da pasta e JWT (exit 1); exportou pasta limpa com manifesto e checksums. Gerador idempotente (2ª execução: 0 criados).
- Repositório público `pack-25-sistemas-ia/pack-25-sistemas-ia` (organização `pack-25-sistemas-ia`, transferido em 2026-10-12) com secret scanning, push protection e proteção do `main` (sem force-push; checks do CI obrigatórios). CI: ver histórico de execuções. `publish-mirrors.yml` **NÃO EXECUTADO** (sem sistema VALIDADO).

## Em implementação
- Nada em andamento. Próximo (sistema 06, Gestão Financeira Empresarial; antes, publicar o 05): um por vez, cada um com `docs/PLANO_IMPLEMENTACAO.md` antes do código.

## Pendências e riscos
- MÉDIA: testes do sistema 02 dependem da hora do dia (contam dias inteiros a partir de meio-dia; falham no CI antes do meio-dia em Brasília: `64_prop_metrics.sql` e `prop-dashboard.spec.ts`). Corrigir no 02 (usar datas locais) e republicar o espelho.
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
2. Fase D: sistema 03 (Qualificação de Leads — usa o mecanismo de endpoint público `PUBLIC_ENDPOINT` e `public-prefixes`), começando pelo PLANO_IMPLEMENTACAO.
3. Guia de personalização: `guias/personalizacao.md`.

## Referências
- `docs/ARCHITECTURE.md`; `docs/DECISIONS.md`; `docs/SECURITY_STANDARD.md`; `docs/LGPD_GUIDE.md`; `docs/DISTRIBUTION.md`
