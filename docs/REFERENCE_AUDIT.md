# REFERENCE_AUDIT — Auditoria de referências, licenças e fontes

**Data da verificação:** 2026-10-11 · **Método:** API oficial do GitHub (`gh api repos/...`) e leitura direta do arquivo `LICENSE` quando a API retornou `NOASSERTION`. Versões de pacotes via `npm view`.
**Regra:** a licença vale para o commit listado. Revalidar antes de incorporar qualquer código e registrar em `THIRD_PARTY_NOTICES.md`.

Legenda de decisão: **usar** (dependência ou cópia permitida, com aviso) · **estudar** (ler ideias/fluxos; não copiar implementação) · **rejeitar** (fora do escopo ou de risco).

## 1. Referências de produto e UI

| Projeto | Commit (HEAD em 2026-10-11) | Licença verificada | Último push | Decisão | Observações |
|---|---|---|---|---|---|
| marmelab/atomic-crm | `a8f521f20e` | MIT | 2026-10-11 | **estudar** (modelo de dados e UX do CRM) | React + shadcn/ui + Supabase. Não é multiempresa com RLS por organização; adaptar, não copiar o app. |
| Kiranism/next-shadcn-dashboard-starter | `7705dfc0d1` | MIT | 2026-09-11 | **estudar** (layout de dashboard) | Reaproveitar padrões de layout; avaliar acoplamentos (auth/billing de terceiros) antes de qualquer cópia. |
| nextjs/saas-starter | `6e33e58b1e` | MIT | 2025-12-11 | **estudar** | Menos recente que os demais; remover billing; comparar com Next atual antes de reaproveitar qualquer trecho. |
| shadcn-ui/ui | `02cad61166` | MIT | 2026-10-11 | **usar** (componentes copiados pela CLI) | Registrar atribuição em `THIRD_PARTY_NOTICES.md` quando incorporado. |
| TanStack/table | `d7f485b354` | MIT | 2026-10-11 | **usar** (dependência npm) | Apenas onde a tabela justificar. |
| krayin/laravel-crm | — | MIT | 2026-10-09 | **estudar** | Laravel/Vue: só modelagem e fluxos. Não misturar stacks. |
| cortezaproject/corteza | — | Apache-2.0 | 2026-10-09 | **estudar** | Arquitetura de workflow. |
| payloadcms/payload | — | MIT | 2026-10-10 | **rejeitar** (por ora) | CMS não faz parte do escopo dos 25 MVPs. |
| triggerdotdev/trigger.dev | — | Apache-2.0 | 2026-10-10 | **rejeitar** (por ora) | Jobs: preferir Supabase (pg_cron/Edge Functions) ou cron do host para manter o comprador autônomo e barato. Reavaliar se um sistema exigir fila durável. |

## 2. Referências com restrição (NÃO copiar para distribuição proprietária)

| Projeto | Licença verificada | Decisão | Observações |
|---|---|---|---|
| chatwoot/chatwoot | `LICENSE` da raiz: **majoritariamente AGPLv3**; arquivos marcados `@license Enterprise` e diretório `enterprise/` sob licença comercial; alguns pacotes MIT | **estudar** | **Correção ao prompt mestre:** o texto original descreve o código como "comunitário MIT". A raiz declara AGPLv3. Nunca copiar. |
| twentyhq/twenty | API: `NOASSERTION`. `LICENSE` da raiz: AGPL, com pacotes específicos MIT (CLI/SDKs, `twenty-ui`, `twenty-apps`) | **estudar** | Reaproveitar somente pacotes explicitamente MIT, após checar o `LICENSE` do pacote no commit usado. |
| frappe/crm | AGPL-3.0 | **estudar** | Apenas fluxos e modelagem. |
| espocrm/espocrm | AGPL-3.0 | **estudar** | Idem. |
| calcom/cal.com | A API do GitHub redireciona para `calcom/cal.diy` (MIT na raiz do repositório) | **estudar** | O prompt descreve Cal.com como AGPL/open-core. **Não confirmei** se existem diretórios com licença distinta (ex.: `ee/`). Sem auditoria por diretório, não copiar código. |

## 3. Fontes de skills de agentes

| Fonte | Licença verificada | Decisão | Observações |
|---|---|---|---|
| anthropics/skills | Raiz sem licença detectada (`NONE`); cada skill traz `LICENSE.txt`. `frontend-design`: Apache-2.0 (lido). `skill-creator`: `LICENSE.txt` presente, conteúdo **não lido** | **usar** `frontend-design` e `skill-creator` somente após ler o `LICENSE.txt` de cada uma e fixar commit | Preservar o aviso de licença junto à skill copiada. |
| vercel-labs/agent-skills | **Nenhuma licença detectada** | **estudar** | Sem licença, todos os direitos são reservados: **não copiar**. Apenas ler e reescrever regras próprias. |
| supabase/agent-skills | MIT | **usar** (após leitura e fixação de commit) | Útil para práticas Postgres/Supabase. |
| obra/superpowers | MIT | **usar** (já instalada localmente) | Debugging, TDD, verificação. |
| tmolavi/lean-agent-skills | MIT, 1 estrela, push 2026-09-17 | **rejeitar adoção** | Baixa confiança. Apenas ideias; reescrever skill própria (`token-efficiency`). |
| bm629/agent-skills (token-optimization) | MIT, 3 estrelas | **rejeitar adoção** | Idem. |

**Skills são código executável com os privilégios do agente.** Regra: ler `SKILL.md` e scripts por inteiro, fixar commit, preferir skills internas originais (ver `.claude/skills/`).

## 4. Versões estáveis consultadas (npm, 2026-10-11)

`next` 16.4.0 · `react` 19.3.0 · `typescript` 7.0.2 · `tailwindcss` 4.3.3 · `@supabase/supabase-js` 2.117.3 · `@supabase/ssr` 0.12.7 · `zod` 4.6.6 · `vitest` 5.0.3 · `@playwright/test` 1.64.0 · `supabase` (CLI) 2.120.0.

**Ainda não verificado:** compatibilidade mútua. O TypeScript 7 é uma major recente; a decisão entre 7.x e a última 5.x/6.x fica para o Core web, depois de testar `typescript-eslint`, Next e Vitest, e será registrada em `docs/DECISIONS.md`. Avisos de segurança do Next.js devem ser consultados no dia da fixação de versão.

## 5. Ambiente local (diagnóstico)

Node v24.15.0 · pnpm 12.6.0 · npm 11.12.1 · git 2.54.0 · gh 2.94.0 · Docker 28.0.4 (Docker Desktop precisou ser iniciado) · **Supabase CLI e ripgrep não instalados** (o CLI roda via `npx supabase`/`pnpm dlx` quando necessário). O diretório original não era repositório git.
