# ARCHITECTURE — Gestão de Comissões

## Camadas
```
Navegador ──► Next.js 16 (App Router, Server Components + Server Actions)
                │   lib/commissions/  (facts → engine → run → RPC)
                ▼
            Supabase (Postgres + Auth + Storage)  ← RLS em todas as tabelas, escrita só por RPCs cm_*
```
- **Core sincronizado** (`scripts/sync-core.mjs`, `.core-overrides`): autenticação, MFA, organizações, perfis, auditoria, layout base. Arquivos próprios do sistema ficam em `lib/commissions/`, `components/cm/`, `app/(app)/*`.
- **Sem estado no cliente que importe para o dinheiro**: o navegador nunca calcula comissão; só exibe e envia intenções.

## Fluxo de um cálculo
1. Ação do servidor (`lib/commissions/run.ts`) valida sessão, papel e entrada (Zod).
2. `facts.ts` lê do banco, **com a sessão do usuário** (RLS valendo), as vendas, itens, participantes, recebimentos, devoluções, planos fixados e o livro (`booked`).
3. `engine/` (puro) devolve `details`, `entries` e `pendencies`.
4. `cm_post_calculation` (SECURITY DEFINER) **revalida** vínculos e grava de forma idempotente, numa execução (`commission_calculation_runs`) com versão do motor e hash dos parâmetros.
5. Falha de cálculo ⇒ `cm_report_calculation_failure` (execução marcada como falha; nenhum lançamento parcial).

## Escrita só por RPC
Tabelas têm RLS **somente de leitura**; `INSERT/UPDATE/DELETE` diretos são negados ao `authenticated`. Toda mutação passa por função `cm_*` que: exige sessão e 2º fator (`private.mfa_ok`), confere papel e escopo (admin / gestor da equipe / financeiro / vendedor), valida entrada, trava a linha (`for update`) quando há concorrência e grava auditoria. Triggers de imutabilidade bloqueiam alteração de lançamentos, fechamentos, pagamentos e eventos fora da RPC (variáveis de sessão `cm.*_update` só ligadas dentro da função).

## Multiempresa
`organization_id` em toda tabela de negócio, **FKs compostas** `(id, organization_id)` (um registro nunca referencia outra empresa), funções `private.cm_can_see_*` nas políticas.

## Telas (rotas em português)
`/dashboard`, `/vendedores`, `/equipes`, `/clientes`, `/produtos`, `/planos`, `/regras`, `/vendas`, `/recebimentos`, `/comissoes`, `/aprovacoes`, `/contestacoes`, `/fechamentos`, `/pagamentos`, `/demonstrativos`, `/metas`, `/simulador`, `/relatorios`, `/importacoes`, `/notificacoes`, `/configuracoes`. Rotas de arquivo: `/api/exportar/relatorio`, `/api/exportar/simulacao`, `/api/demonstrativos/[id]`.

## Arquivos e PDFs
Demonstrativos em bucket privado `statements` (política por organização/vendedor); download gera URL de curta duração após checar permissão. Exportações CSV: separador `;`, BOM UTF-8, células que começam com `= + - @` neutralizadas, registro em auditoria (sem valores).

## Testes por camada
Unitário (motor), SQL (`supabase/tests/*.sql` via `scripts/test-db.mjs`), concorrência (`scripts/test-concurrency.mjs`), mutação (`scripts/mutation-check.mjs`), E2E (`tests/e2e`, Playwright).
