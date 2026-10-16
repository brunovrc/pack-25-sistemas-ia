# CALCULATION_RULES — regras de cálculo

## Dinheiro e arredondamento
- Valores em **centavos inteiros**; taxas em texto decimal; leitura de entrada via `parseMoneyToCents` (aceita `1.234,56`, `1234,56`, `R$ 10,00`; rejeita `1,234.56`, notação científica e mais de 2 casas).
- **Meio-para-cima**, simétrico (round(−x) = −round(x)), **uma vez por componente**. Nos planos por faixa, uma vez sobre o **acumulado**.

## Bases do plano
| Base | Valor sobre o qual a taxa incide |
|---|---|
| `net_value` | valor comissionável do item − devoluções |
| `gross_margin` | (comissionável − custo) proporcional ao que não foi devolvido; margem negativa vale 0; **custo ausente = pendência crítica**, nunca zero presumido |
| `received_value` | recebimentos rateados entre os itens (maior resto), limitados ao saldo do item |
| `fixed_per_unit` | quantidade válida (quantidade − devolvida) × valor fixo |
| `fixed_per_sale` | valor fixo por venda; some se a venda foi totalmente devolvida |

Valor comissionável do item ≤ valor líquido (desconto, frete e impostos configuráveis ficam fora da base).

## Precedência de regras
Ordem padrão (mais específica primeiro): produto+vendedor, categoria+vendedor, canal+produto, produto, categoria, vendedor, canal, equipe, global. Dentro do mesmo nível vence a **maior prioridade**. Empate ⇒ conflito (bloqueia a venda, aparece nas pendências). Regras `stack` somam à vencedora. Vigência da regra: `validFrom ≤ data da venda ≤ validUntil` (extremos inclusivos).

## Condições
JSON fechado: `{all|any|not}` e folhas `{fact, op, value}`. Fatos: `seller.id`, `seller.team_id`, `seller.type`, `product.id`, `product.category_id`, `sale.channel`, `customer.id`, `sale.net_cents`, `item.net_cents`, `item.quantity`. Operadores: `eq ne in not_in gt gte lt lte between`. Limites: profundidade 4, 30 nós, listas de 50. Sem `eval`.

## Elegibilidade
- `sale_confirmation`: elegível na confirmação.
- `full_receipt`: elegível quando o acumulado recebido ≥ devido (líquido × fração não devolvida).
- `proportional_receipt`: razão = recebido ÷ devido (teto 100%); cada recebimento libera a parcela correspondente.

Detalhes: `TIER_RULES.md`, `SPLIT_RULES.md`, `REVERSALS.md`, `ELIGIBILITY_RULES.md`.
