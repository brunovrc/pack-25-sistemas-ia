# METRICS — Definição dos indicadores do CRM Completo

Regras gerais
- **Fuso:** `America/Sao_Paulo`. O período `[de, até]` é por datas **inclusivas**: de 00:00:00 de `de` até 23:59:59.999 de `até`.
- **Moeda:** BRL, `numeric(14,2)`; soma e divisão em banco, sem arredondar antes do fim. Exibição com 2 casas.
- **Filtros** (vendedor, equipe, origem) valem para todos os indicadores e gráficos, salvo o que está dito abaixo. Quem tem papel `member` enxerga apenas os próprios dados (RLS), com ou sem filtro.
- **Sem dados:** divisão por zero e conjuntos vazios devolvem `null` e a interface mostra "sem dados", nunca 0 fingindo ser resultado.
- **Fonte única:** funções SQL `security invoker` (`crm_kpis`, `crm_sales_series`, …) testadas com fixtures; a interface só formata.

## Indicadores

| # | Indicador | Fórmula | Período | Observações |
|---|---|---|---|---|
| 1 | **Pipeline ativo** | Σ `value` das oportunidades com `status = 'open'` | **Instantâneo atual** (não depende do período) | Respeita vendedor, equipe e origem |
| 2 | **Vendas ganhas** | Σ `value` com `status = 'won'` e `closed_at` no período | `closed_at` | Valor registrado no CRM, **não** faturamento contábil |
| 3 | **Taxa de conversão** | `ganhos / (ganhos + perdidos) × 100` | `closed_at` no período | `null` se `ganhos + perdidos = 0` |
| 4 | **Leads ativos** | Contagem de leads não arquivados com status `new`, `contacted` ou `qualified` | **Instantâneo atual** | Convertidos e desqualificados não contam |
| 5 | **Ticket médio** | `Σ valor ganho / nº de negócios ganhos` | `closed_at` no período | `null` se não houve ganhos |
| 6 | **Metas** | Considera as metas cujo período intersecta o filtro. Se existirem metas **individuais**, usa só elas; senão, as de **equipe**. Card = `Σ realizado / Σ meta × 100`, onde `realizado` = Σ valor ganho do responsável (ou da equipe) **dentro do período da própria meta**. | período da meta | `null` se não há metas ou Σ meta = 0; somas em centavos |

## Gráficos

| Gráfico | O que mede | Agrupamento |
|---|---|---|
| Evolução de vendas | Σ valor ganho por bucket | Semana se o período ≤ 90 dias, senão mês (segunda-feira como início da semana) |
| Funil comercial | Contagem e Σ valor por etapa **aberta** | Instantâneo atual, na ordem das etapas |
| Desempenho por vendedor | Nº e Σ valor ganho por responsável | Período |
| Origem dos leads | Contagem de leads **criados** no período por origem | "Sem origem" quando nulo |
| Ganhos × perdidos | Contagem de negócios encerrados por bucket | Mesmo agrupamento da evolução |
| Metas × realizado | Meta e realizado por meta | Ver indicador 6 |

## Alertas
| Alerta | Regra | Limite configurável |
|---|---|---|
| Follow-up atrasado | Atividade com `due_at` < agora e sem `completed_at` | — |
| Oportunidade parada | Aberta e sem atividade nem mudança de etapa há mais de N dias | `stale_days` (padrão 14) |
| Fechamento próximo | Aberta com `expected_close_date` entre hoje e hoje + N dias | `closing_soon_days` (padrão 7) |
| Meta abaixo do ritmo | `realizado% < decorrido% − 15 pontos`, só se decorrido ≥ 25% do período da meta | — |

## Ranking
Ordenado por Σ valor ganho (desempate: nº de ganhos, depois nome). Colunas: nº de ganhos, valor, taxa de conversão (do vendedor, `null` se nenhum encerrado), metas atingidas (`realizado ≥ meta`).
