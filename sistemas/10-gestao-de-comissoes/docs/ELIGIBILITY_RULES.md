# ELIGIBILITY_RULES — quando a comissão passa a valer

A **elegibilidade** define quanto do potencial já pode ser lançado; é independente de aprovação e pagamento.

| Modo | Razão (0–1) | Data de elegibilidade |
|---|---|---|
| `sale_confirmation` | 1 | confirmação da venda |
| `full_receipt` | 0 até o acumulado recebido alcançar o devido; depois 1 | data do recebimento que completou o devido (ou a confirmação, se anterior) |
| `proportional_receipt` | recebido ÷ devido, no máximo 1 | data do último recebimento |

- **Devido** = valor líquido da venda × fração ainda não devolvida.
- Devido ≤ 0 (venda totalmente devolvida) ⇒ razão 0.
- Elegível = `round(potencial × razão)` (com razão 1 não se arredonda de novo).
- Base `received_value` exige elegibilidade proporcional (a publicação do plano rejeita outra combinação) e força razão 1 no cálculo: o recebimento **já é** a base, aplicar a razão contaria duas vezes.
- Recebimento só entra em venda confirmada; recebimento acima do devido é recusado (configurável por organização: `allow_receipt_over_sale`). Recebimento estornado some dos fatos e o motor leva o componente a alvo zero (estorno no livro).
- Vendedor precisa estar ativo na data da venda e ter plano vigente nela (ou a confirmação é recusada).
