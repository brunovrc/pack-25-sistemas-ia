# MEMORY — CRM COMPLETO
Atualizado em: 2026-10-12 | Versão: 0.2.0 | Estado: VALIDADO (CI verde em 2026-10-12)

## Missão do sistema
CRM B2B: do lead ao negócio fechado, com funil, metas, ranking e indicadores calculados do banco.

## Stack e caminhos-chave
Next.js 16 (App Router, proxy.ts, CSP com nonce) + TypeScript strict + Tailwind 4 + Supabase (Auth, RLS). Core em `app/(app)/{members,privacy,audit,settings}`, `lib/auth`, `supabase/migrations/2026*` (sincronizado do Core, não editar). CRM em `app/(app)/{dashboard,pipeline,leads,opportunities,companies,contacts,activities,goals,reports,crm-settings}`, `components/crm`, `lib/crm`, `supabase/migrations/20270101000000_crm_schema.sql`.
Comandos: `pnpm lint | typecheck | test | build | test:db | test:e2e`.

## Implementado e verificado
Todas as funcionalidades de `docs/FEATURES.md` (24 testes da seção 13, exceto o 24). Evidências: unitários 114 ok; testes de banco (RLS, regras, indicadores) ok; E2E 33 ok, inclusive rodando a partir da cópia exportada (local, 2026-10-12); lint e typecheck ok; revisão visual desktop/mobile/escuro feita.

## Pendências e riscos
- Instalação isolada: `export-system.mjs` → install, lint, typecheck, 114 unit, build, `test:db` e 33 E2E ok (2026-10-12). No Windows, use caminho curto: o caminho longo quebra o Vitest/Vite.
- CI do CRM (web + e2e) verde no GitHub em 2026-10-12.
- Risco LGPD: médio.

## Decisões relevantes
- Dinheiro somado em centavos; indicadores em funções SQL `security invoker` (fonte única).
- Vendedor só vê o que é dele (RLS); gerente vê tudo e define metas; configurações só owner/admin com MFA.
- Gráficos só no cliente (CSP estrita); tema via `/theme.css` do mesmo domínio.
- Card «Metas»: soma das individuais; sem individuais, as de equipe.

## Testes e deploy
- Última verificação local: 2026-10-12, tudo verde (ver acima). Deploy: não configurado (responsabilidade de quem implanta).

## Próxima tarefa recomendada
1. Publicar o repositório `crm-completo` (publish-mirrors) versão/tag v0.2.0.

## Referências
- docs/PLANO_IMPLEMENTACAO.md; docs/FEATURES.md; docs/METRICS.md; docs/DATA_MODEL.md; docs/DEPLOYMENT.md
