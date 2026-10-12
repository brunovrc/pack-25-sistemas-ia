# PLANO DE IMPLEMENTAÇÃO — CRM Completo

Prompt mestre v1.2, seções 11 a 14. Este plano é a referência de escopo do sistema 01; mudanças de escopo entram aqui antes do código.

## 1. Objetivo e público-alvo
Funil comercial completo para equipes de venda de pequenas e médias empresas B2B: captar leads, qualificar, converter em oportunidades, conduzir no pipeline, acompanhar metas e medir resultado. Quem implanta: o aluno, para uma empresa cliente.

## 2. Problemas resolvidos
Leads dispersos, sem dono nem origem · follow-ups esquecidos · negócios parados sem alerta · ausência de funil e taxa de conversão · metas sem acompanhamento · relatórios feitos à mão.

## 3. Referências (ver `docs/REFERENCE_AUDIT.md` do repositório-fonte)
Atomic CRM (MIT, `a8f521f20e`): entidades companies/contacts/deals/tasks/notes e importação CSV, **estudar**. Studio Admin e Kiranism (MIT): layout de dashboard, **estudar**. Recharts, dnd-kit, React Hook Form, TanStack Table v8, PapaParse (todas MIT): **usar** como dependências. Krayin, Frappe CRM, Corteza: só fluxos.

## 4. Funcionalidades obrigatórias
Leads (CRUD, arquivar, classificar, origem, responsável, importar CSV, duplicidade, converter) · Empresas e contatos · Pipeline Kanban com etapas configuráveis e histórico · Oportunidades (valor, etapa, previsão, ganho/perdido com motivo) · Atividades (follow-ups, prazos, prioridade, atraso) · Metas e ranking · Dashboard com 6 indicadores, 6 gráficos, filtros e alertas · Relatórios com CSV · Configurações (etapas, origens, motivos de perda, equipes, marca).

## 5. Páginas e navegação
`/dashboard` (home do CRM) · `/leads` · `/companies` · `/contacts` · `/pipeline` · `/opportunities` · `/activities` · `/goals` · `/reports` · `/crm-settings` · do Core: `/members`, `/privacy`, `/audit`, `/settings`.

## 6. Componentes de frontend
`DataTable` (TanStack Table v8, busca, ordenação, paginação por URL) · `KanbanBoard` (dnd-kit, acessível por teclado) · gráficos Recharts com tabela alternativa · `FilterBar` global (período, vendedor, equipe, origem) · formulários com React Hook Form + Zod · `StatCard` · `EmptyState`/skeletons do Core · diálogo de motivo de perda.

## 7. Entidades e relacionamentos
`crm_teams` 1—N `crm_team_members` · `crm_pipeline_stages` (kind open/won/lost) · `crm_lead_sources` · `crm_loss_reasons` · `crm_settings` (1 por organização) · `crm_companies` 1—N `crm_contacts` · `crm_leads` (origem, responsável, convertido→oportunidade) · `crm_opportunities` (empresa, contato, etapa, responsável, origem) 1—N `crm_stage_history` · `crm_activities` (liga a lead, contato, empresa ou oportunidade) · `crm_goals` (por usuário ou equipe, período, valor). Toda tabela tem `organization_id`, `created_at`, `updated_at` e coluna `custom jsonb` para campos extensíveis (seção 15 do prompt).

## 8. Banco de dados
Migrações em `supabase/migrations/2027…_crm_*.sql`, depois das do Core. Dinheiro em `numeric(14,2)` (BRL), datas em `timestamptz`, datas de previsão em `date`. Índices em chaves de política e de filtro. Funções de indicadores em SQL (`security invoker`), testadas com fixtures. Fuso padrão `America/Sao_Paulo` para agrupar períodos.

## 9. Políticas de segurança (RLS)
Matriz de papéis (decisão deste plano):

| Papel | Leads, oportunidades, atividades | Empresas e contatos | Configurações e metas | Dashboards |
|---|---|---|---|---|
| owner, admin | tudo | tudo | tudo | todos |
| manager | tudo da organização | tudo | metas e equipes | todos |
| member (vendedor) | só os que são dele (`owner_id`) | lê todas; cria e edita | não | só os dele |
| viewer (leitor) | lê tudo, não altera | lê | não | todos, somente leitura |

Escritas exigem MFA de owner/admin (restrictive, do Core). Funções de indicador são `security invoker`: o RLS já limita o que cada papel enxerga. Testes A/B (SELECT/INSERT/UPDATE/DELETE) por tabela.

## 10. Regras de negócio
- Etapa define o status: stage `won` → oportunidade ganha; `lost` → perdida (exige motivo). Reabrir limpa `closed_at` e o motivo.
- Toda mudança de etapa grava `crm_stage_history` (por trigger, não pelo app).
- Converter lead cria oportunidade (e empresa/contato quando informados), marca o lead como convertido e liga os dois, numa transação.
- Duplicidade de lead: índice único parcial por e-mail normalizado entre leads ativos; telefone gera aviso na importação.
- Valores ≥ 0; probabilidade 0–100; previsão de fechamento é data (sem hora).
- Etapas: ao menos uma `won` e uma `lost`; etapa em uso não é apagada, só desativada.
- Padrões criados com a organização: etapas Prospecção 10%, Qualificação 25%, Proposta 50%, Negociação 75%, Ganho, Perdido; origens e motivos de perda comuns; alertas: parado há 14 dias, fechamento em 7 dias.

## 11. Indicadores e fórmulas
Definição formal de cada um em `docs/METRICS.md` (período, filtros, nulos, unidade).

## 12. Gráficos e relatórios
Evolução de vendas · funil · desempenho por vendedor · origem dos leads · ganhos × perdidos · metas × realizado. Todos com a mesma `FilterBar`, tooltips, legenda, valores em BRL e tabela alternativa. Relatórios: vendas por vendedor, funil, leads por origem, perdas por motivo, com exportação CSV.

## 13. Filtros
Últimos 7/30/90 dias, período personalizado, vendedor, equipe, origem. Parâmetros na URL (compartilháveis), validados com Zod; período inválido cai no padrão de 30 dias sem erro.

## 14. Importações e exportações
Importação CSV de leads: até 1 MB e 2.000 linhas, UTF-8, cabeçalhos em português ou inglês, modo "apenas validar" (relatório sem gravar), relatório de criados/duplicados/erros por linha. Exportação CSV (UTF-8 com BOM) de leads, oportunidades e relatórios, neutralizando injeção de fórmula (`= + - @ tab`). **PDF fora do MVP do CRM** (aplicável ao sistema 02, Propostas).

## 15. Testes de aceitação
Os 24 itens da seção 13 do prompt, mapeados em `docs/FEATURES.md` a um teste (pg-test, unitário ou E2E) cada.

## 16. Critérios de conclusão
Seção 16 do prompt + `docs/FEATURES.md` sem TODO + instalação isolada validada com `scripts/export-system.mjs`.

## 17. Exclusões do MVP
WhatsApp e e-mail automatizados · disparo em massa · integração fiscal/contábil · assinatura de proposta · PDF · entrevista de personalização · SSO · app nativo.

## 18. Etapas
1. Base: `sync-core` + pasta do CRM com o Core, fontes, marca e ponto de extensão. 2. Banco do CRM + testes pg. 3. Configurações do CRM. 4. Empresas e contatos. 5. Leads (CRUD, conversão, importação). 6. Oportunidades e pipeline. 7. Atividades e alertas. 8. Metas, ranking, dashboard e gráficos. 9. Relatórios e CSV. 10. Dados de demonstração, E2E, mobile e capturas. 11. Instalação isolada, documentação, memória e CI.
