# FEATURES — CRM Completo

Estados usados: VERIFIED (com evidência), PENDENTE ou NÃO EXECUTADO.
Os testes E2E ficam em `tests/e2e/`, os unitários em `tests/unit/` e os de banco em `supabase/tests/`.

## Funcionalidades

| Fluxo | Status | Evidência |
|---|---|---|
| Leads (criar, editar, arquivar, restaurar, duplicidade, classificação, origem, responsável) | VERIFIED | `crm-flows.spec.ts` «lead: criar, editar, persistir, bloquear duplicado…»; `61_crm_rules.sql` |
| Converter lead em oportunidade | VERIFIED | `crm-flows.spec.ts` «empresa, contato e conversão…»; `61_crm_rules.sql` |
| Empresas e contatos | VERIFIED | `crm-flows.spec.ts` «empresa, contato e conversão…» |
| Oportunidades e pipeline Kanban (mouse, teclado e seletor) | VERIFIED | `crm-flows.spec.ts` «pipeline: mover por seletor e por arrastar…» |
| Ganho e perdido (motivo obrigatório, histórico de etapas) | VERIFIED | `crm-flows.spec.ts` «pipeline…»; `61_crm_rules.sql` |
| Atividades, follow-ups e alertas de atraso | VERIFIED | `crm-flows.spec.ts` «atividades: atrasada gera alerta…» |
| Metas individuais e por equipe, ranking | VERIFIED | `crm-flows.spec.ts` «metas…»; `crm-dashboard.spec.ts` «dados de demonstração…»; `62_crm_metrics.sql` |
| Dashboard: 6 indicadores, 6 gráficos, filtros | VERIFIED | `crm-dashboard.spec.ts`; `62_crm_metrics.sql`; `crm-chart-data.test.ts` |
| Relatórios e exportação CSV | VERIFIED | `crm-dashboard.spec.ts` «relatórios…»; `crm-flows.spec.ts` «exportação CSV…» |
| Importação CSV com modo «apenas validar» | VERIFIED | `crm-flows.spec.ts` «importação CSV…»; `crm-validation-csv.test.ts` |
| Configurações (etapas, origens, motivos, equipes, marca) | VERIFIED | `crm-flows.spec.ts` «configuração do CRM…» |
| Tema/identidade visual sem recarregar | VERIFIED | `core-flow.spec.ts`, `security.spec.ts` (tema sem reload, CSP) |
| Instalação isolada (export + install + testes) | VERIFIED | `export-system.mjs` → cópia em pasta separada: install, lint, typecheck, 114 unit, build, `test:db`, 33 E2E (2026-10-12) |

## Os 24 testes obrigatórios (seção 13 do prompt)

| # | Teste | Status | Evidência |
|---|---|---|---|
| 1 | Criar leads | VERIFIED | `crm-flows` «lead: criar, editar…» |
| 2 | Editar e arquivar leads | VERIFIED | idem |
| 3 | Converter leads em oportunidades | VERIFIED | `crm-flows` «empresa, contato e conversão…» |
| 4 | Criar oportunidades | VERIFIED | `crm-flows` «empresa, contato e conversão…» |
| 5 | Movimentar no Kanban | VERIFIED | `crm-flows` «pipeline: mover por seletor e por arrastar…» |
| 6 | Persistir após recarregar | VERIFIED | `crm-flows` «lead…» e «pipeline…» (recarrega e confere) |
| 7 | Fechar como ganho | VERIFIED | `crm-flows` «pipeline…»; `61_crm_rules.sql` |
| 8 | Registrar perdidos | VERIFIED | `crm-flows` «pipeline… perdida exige motivo» |
| 9 | Conversão | VERIFIED | `crm-dashboard` «os seis indicadores…» (75,00% à mão); `62_crm_metrics.sql` |
| 10 | Ticket médio | VERIFIED | idem (1.166,78) |
| 11 | Soma de ganhos | VERIFIED | idem (3.500,35, com centavos) |
| 12 | Filtrar por período | VERIFIED | `crm-dashboard` «período sem dados…», «filtros inválidos…» |
| 13 | Filtrar por vendedor | VERIFIED | `crm-dashboard` «dados de demonstração…» |
| 14 | Validar rankings | VERIFIED | `crm-dashboard` «dados de demonstração…», «relatórios…» |
| 15 | Criar e concluir tarefas | VERIFIED | `crm-flows` «atividades…» |
| 16 | Alertas de follow-up | VERIFIED | `crm-flows` «atividades: atrasada gera alerta…» |
| 17 | Importar CSV | VERIFIED | `crm-flows` «importação CSV…» |
| 18 | Exportar relatórios | VERIFIED | `crm-dashboard` «relatórios…»; `crm-flows` «exportação CSV…» |
| 19 | Isolamento entre organizações | VERIFIED | `crm-flows` «outra organização…»; `60_crm_rls.sql` |
| 20 | Permissões | VERIFIED | `crm-flows` «vendedor só vê…»; `60_crm_rls.sql` |
| 21 | Navegação mobile | VERIFIED | `crm-flows` «CSP sem violações… sem rolagem horizontal no celular»; capturas `screens.spec.ts` |
| 22 | Estados de erro e carregamento | VERIFIED | `crm-flows` «estados de erro…»; `loading.tsx` do painel e de membros |
| 23 | Build de produção | VERIFIED | `pnpm build` (CI e local) |
| 24 | Instalar e executar isoladamente | VERIFIED | execução acima; no Windows use caminho curto |

Também cobertos: datas-limite, centavos, divisão por zero, filtros inválidos e ausência de dados
(`crm-format-filters.test.ts`, `crm-chart-data.test.ts`, `62_crm_metrics.sql`). Nenhum indicador usa valor fixo: tudo vem de SQL sobre os dados.
