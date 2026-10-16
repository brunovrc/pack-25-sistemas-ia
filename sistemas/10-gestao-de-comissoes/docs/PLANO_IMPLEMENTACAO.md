# PLANO_IMPLEMENTACAO — Gestão de Comissões

Ordem seguida (cada marco só fecha com teste executado):

1. **Auditoria de referências** (`OPEN_SOURCE_AUDIT.md`) e decisões iniciais (`DECISIONS.md`).
2. **Motor puro** (`lib/commissions/engine`): dinheiro, rateio, faixas, condições, regras, orquestrador alvo × livro, metas. Casos de referência do prompt (§42), regras e propriedades.
3. **Banco**: schema de cadastro/planos/vendas/livro/fechamento, RLS somente leitura, guardas de imutabilidade, RPCs `cm_*`, métricas, contexto, storage, importação, privilégios. Testes SQL de domínio (30 blocos) e segurança (9 blocos).
4. **Camada de aplicação** (`lib/commissions`): fatos, execução do motor, ações de servidor, PDF, CSV, relatórios, simulador, importador.
5. **Telas** em português (21 rotas + 3 rotas de arquivo) sobre o layout do Core.
6. **Seed NovaSales** gerado pelo próprio motor, com prova de consistência (recalcular = zero lançamentos novos).
7. **E2E** (Playwright): perfis e isolamento, fluxo completo de venda → cálculo → aprovação → fechamento → pagamento → demonstrativo, importação e segurança.
8. **Robustez**: concorrência real (`scripts/test-concurrency.mjs`) e mutação (`scripts/mutation-check.mjs`), com testes novos para cada mutante sobrevivente.
9. **Documentação, skills internas, MEMORY**, integração ao hub (catálogo, CI), exportação isolada e repositório público.

## Definição de pronto
Migrações em banco limpo · seed reproduzível · RLS A/B negando acesso cruzado · fluxos críticos em E2E · mutação sem sobreviventes (ou mutante equivalente justificado) · concorrência sem duplicidade · instalação isolada validada · licenças e segredos verificados · `FEATURES.md` sem pendências · `MEMORY.md` com evidências.
