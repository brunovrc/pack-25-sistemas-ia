# METRICS — Portal de Clientes B2B

Todo número do painel, do portal do cliente e dos relatórios vem de **funções SQL** (`supabase/migrations/…_pt_metrics.sql`), *security invoker*: o RLS decide o que cada papel soma. Nada é digitado à mão; as expectativas dos testes (`supabase/tests/64_pt_metrics.sql`) são calculadas à mão sobre dados mínimos.

**Período e «dia».** O período é `[de, até]` inclusive, no **fuso configurado do portal** (`portal_settings.timezone`): um dia começa e termina à meia-noite *local*. Períodos inválidos (fim antes do início, mais de 1100 dias) são recusados no banco; na URL, qualquer valor inválido cai nos «últimos 30 dias». A série usa **dia** (até 62 dias), **semana** (até 210) ou **mês**; intervalos sem movimento aparecem zerados.

**Filtros globais** (todos opcionais e combináveis): empresa, responsável, categoria, prioridade, situação. Um ID de outra empresa não vaza nada: o RLS zera o resultado.

**«Sem dados» nunca vira zero.** Percentual ou média sem base aparece como «—».

## Indicadores (`pt_kpis`)
| Indicador | Definição | Depende do período? |
|---|---|---|
| Em aberto agora | solicitações fora de «concluída» e «cancelada» | não (foto de hoje) |
| Atrasadas | em aberto com `due_at` no passado | não |
| Vencem em breve | em aberto com prazo entre agora e agora + `alert_due_soon_hours` (padrão 24 h) | não |
| Concluídas no período | `status = completed` e `completed_at` dentro do período | sim |
| Concluídas no prazo (%) | das concluídas no período **que tinham prazo**: `completed_at ≤ due_at`; sem nenhuma, «—» | sim |
| Tempo médio de resolução | média de `completed_at − created_at` das concluídas no período, em horas corridas | sim |
| Clientes ativos | empresas `active`, não arquivadas, dentro do escopo | não |
| Sem responsável | em aberto com `assigned_to` nulo | não |
| Aguardando a prestadora | situação `open` ou `waiting_provider` (a próxima ação é da equipe) | não |
| Entregas não publicadas | entregas em rascunho, em preparação ou prontas | não |
| (apoio) Criadas no período | solicitações com `created_at` no período | sim |
| (apoio) Paradas | em aberto sem atividade há mais de `alert_stale_days` (padrão 7 dias) | não |
| (apoio) Entregas publicadas | publicadas ou confirmadas, com `delivered_at` no período | sim |
| (apoio) Documentos compartilhados | `visibility = client`, não arquivados, criados no período | sim |

**Variação.** Cada indicador do painel é comparado ao período imediatamente anterior, de mesma duração, e mostrado em **texto** («▲ +12,5% vs período anterior»; pontos percentuais para taxas). Sem base de comparação, não aparece.

**Visão do cliente.** O mesmo painel, restrito à própria empresa. Troca rótulos («Aguardando você»), troca três indicadores internos por «Aguardando você», «Documentos compartilhados» e «Solicitações abertas por você», e **não** mostra os rankings por responsável e por cliente.

## Gráficos (oito, cada um com «ver dados em tabela»)
| Gráfico | Função | Observação |
|---|---|---|
| Criadas × concluídas | `pt_series` | barras agrupadas |
| Por situação | `pt_status_distribution` | todas as 7 situações, inclusive zeradas |
| Por prioridade | `pt_priority_distribution` | inclui concluídas, conforme filtros |
| No prazo × fora do prazo | `pt_series` | só concluídas que tinham prazo |
| Tempo médio de resolução | `pt_series` | sem conclusões, sem ponto |
| Entregas publicadas | `pt_series` | por intervalo |
| Carga por responsável | `pt_by_assignee` | em aberto hoje + concluídas no período; «sem responsável» é um grupo |
| Por cliente | `pt_by_client` | em aberto, atrasadas e concluídas |

## Alertas (`pt_alerts`)
Atrasadas · vencem em breve · aguardando a prestadora · sem responsável · paradas · entregas não publicadas. Cada alerta leva à lista já filtrada (`/solicitacoes?view=…`).

## Relatórios (CSV)
`solicitacoes`, `por-cliente`, `por-responsavel`, `entregas`, `acessos-documentos`. UTF-8 com BOM, `;` como separador, vírgula decimal, **fórmulas neutralizadas** (`= + - @ TAB CR` ganham apóstrofo). Só administrador e gestor baixam, e cada exportação grava na auditoria **quem, qual relatório e quantas linhas** (nunca os dados). Sem a trilha gravada, o arquivo não é entregue.

## Fronteiras que os testes cobrem
Concluída às 23h30 da véspera ou 00h30 do dia seguinte fica **fora**; 00h30 do primeiro dia e 23h30 do último ficam **dentro**; o mesmo instante cai em dias diferentes conforme o fuso configurado.
