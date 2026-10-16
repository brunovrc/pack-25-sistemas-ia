# METRICS — definições dos indicadores

Calculados no banco (`cm_dashboard`, `cm_org_aggregates`) e exibidos como vêm; o cliente não recalcula.

| Indicador | Definição |
|---|---|
| Comissões calculadas | soma dos lançamentos não rejeitados no período (comissão + bônus + ajustes + estornos) |
| Comissões aprovadas | soma dos lançamentos `approved`/`adjusted` |
| Comissões pendentes | `calculated`, `pending_review`, `contested` |
| Comissões pagas | soma das alocações de pagamentos `recorded` |
| A pagar | a pagar dos fechamentos concluídos (descontado o saldo devedor herdado) |
| Estornos | soma dos lançamentos `reversal` |
| Base de vendas elegíveis | vendas confirmadas/parcialmente devolvidas do período, com o rateio aplicado (sem dupla contagem) |
| Custo de comissão sobre vendas | comissões calculadas ÷ base de vendas elegíveis; sem vendas no período ⇒ «—», nunca 0% nem infinito |
| Visões | por mês, equipe, plano, categoria, produto e cliente; situação dos períodos; fechamentos sem demonstrativo |
| Rankings | por vendas elegíveis e por comissões; **não aparecem para o vendedor** (só administração, gestor e financeiro) |
| Atingimento de meta | realizado ÷ alvo da meta |

Filtro de período explícito (`p=custom&from&to`); sem filtro vale o mês atual no fuso da organização. Dados vazios mostram estado vazio explicativo. O perfil Consulta recebe só agregados da empresa (`cm_org_aggregates`), sem remuneração individual.
