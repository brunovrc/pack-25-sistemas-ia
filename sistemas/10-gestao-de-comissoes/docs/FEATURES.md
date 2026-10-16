# FEATURES — Gestão de Comissões
Status: VERIFIED (com evidência: arquivo/teste) ou FORA DO MVP. Nada pendente nesta versão.

Legenda das evidências: **U** = `tests/unit/*`, **SQL** = `supabase/tests/*` (via `pnpm test:db`), **E2E** = `tests/e2e/*` (Playwright), **CONC** = `scripts/test-concurrency.mjs`, **MUT** = `scripts/mutation-check.mjs`.

| Fluxo | Status | Evidência |
|---|---|---|
| Planos de comissão versionados (rascunho, publicação, vigência, imutabilidade) | VERIFIED | SQL 50 (3)(4); E2E cm-flow 1–2 |
| Regras: percentual, valor fixo, faixas, precedência, conflito, empilhamento, condições | VERIFIED | U engine-rules, engine-boundaries; E2E cm-flow 2 (faixas sobrepostas recusadas) |
| Vendedores, equipes, clientes, produtos e categorias | VERIFIED | SQL 50 (1)(2), 60 (1); E2E cm-demo 1–2, cm-flow 2 |
| Vendas: rascunho, confirmação com plano fixado, rateio pool/independente | VERIFIED | SQL 50 (5)(6), 60 (2); U engine-reference (casos de rateio); E2E cm-flow 3 |
| Motor decimal (15 casos de referência, propriedades, arredondamento) | VERIFIED | U engine-reference, engine-properties, engine-rules, engine-ledger |
| Faixas progressivas: marginal e atingida, acúmulo por mês/trimestre/ano, por vendedor ou equipe | VERIFIED | U engine-reference (casos de faixa), engine-boundaries, engine-ledger |
| Cálculo gravado de forma idempotente, com memória de cálculo | VERIFIED | SQL 50 (7)(8); CONC (8 sessões, uma comissão); E2E cm-flow 3 |
| Recebimentos e elegibilidade (confirmação, total, proporcional) | VERIFIED | U engine-reference, engine-ledger; SQL 50 (24), 60 (3) |
| Devoluções, cancelamentos e estornos referenciados | VERIFIED | U engine-reference, engine-ledger; SQL 50 (9)(24)(25), 60 (3)(4); E2E cm-flow 5–6 |
| Aprovação, rejeição e segregação de funções | VERIFIED | SQL 50 (11)–(13), 60 (5)(6); CONC (um vencedor); E2E cm-flow 4 |
| Contestações do vendedor e ajustes manuais aprovados | VERIFIED | SQL 50 (14)–(17), 60 (5)(6) |
| Fechamento mensal, saldo devedor, reabertura formal | VERIFIED | SQL 50 (18)(19)(23), 60 (7); CONC (um fechamento); E2E cm-flow 7 |
| Pagamentos registrados (sem transferência), parciais, estornáveis | VERIFIED | SQL 50 (20)–(22), 60 (8); CONC (pagamentos simultâneos); E2E cm-flow 8 |
| Demonstrativos PDF versionados e privados | VERIFIED | E2E cm-flow 8; cm-import-security 4 (id adulterado = 404) |
| Metas e bônus (cadastro, escopo por perfil, cálculo, sem pagamento duplo) | VERIFIED | SQL 61; U engine-reference (caso 9), engine-ledger |
| Simulador (mesmo motor, cenários A/B) | VERIFIED | E2E cm-flow 9 |
| Painel e indicadores por perfil | VERIFIED | SQL 50 (26)–(30); E2E cm-demo 1 (painel × API independente) |
| Relatórios e exportação CSV/PDF com neutralização de fórmulas | VERIFIED | U engine-io; E2E cm-import-security 2 |
| Importação CSV com prévia, erros por linha e sem duplicar | VERIFIED | U engine-io; E2E cm-import-security 1 |
| Notificações internas pessoais | VERIFIED | SQL 61 (8); E2E cm-demo 1 (rota) |
| Multiempresa, RLS e cinco perfis (admin, gestor, financeiro, vendedor, consulta) | VERIFIED | SQL 70 (9 blocos), 61 (7); E2E cm-demo 2–5, cm-import-security 3, security |
| Dados de demonstração NovaSales (consistentes com o motor) | VERIFIED | U seed-consistency (recalcular = zero lançamentos); E2E cm-demo |
| Concorrência real (cálculo, aprovação, confirmação, recebimento, fechamento, pagamento) | VERIFIED | CONC |
| Regras críticas protegidas por testes (mutação) | VERIFIED | MUT (ver `MEMORY.md` para o resultado da última execução) |
| Responsividade (375/768/1440 px) e acessibilidade básica | VERIFIED | E2E cm-responsive |
