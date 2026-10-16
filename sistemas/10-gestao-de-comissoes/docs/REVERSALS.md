# REVERSALS — devoluções, cancelamentos e estornos

## Devolução
`cm_register_return` registra o valor devolvido **por item** (soma = valor da devolução; cada item ≤ seu saldo; total ≤ saldo comissionável da venda; data entre a venda e hoje). A venda passa a `partially_returned` ou `totally_returned`. Nada é recalculado aqui: o próximo processamento do motor vê a devolução nos fatos.

## Cancelamento
`cm_cancel_sale`: o restante não devolvido vira devolução final (`final:<venda>`), com data de cancelamento. Só vendas confirmadas.

## Efeito no livro
O motor recalcula o alvo do componente com a base reduzida; a diferença negativa vira lançamento **`reversal`** (causa `return` ou `cancellation`) com:
- `original_entry_id` = primeiro lançamento positivo do componente;
- `source_event_id` = a devolução que originou o estorno (**único por evento**: repetir o mesmo evento não estorna duas vezes);
- data = data da devolução.

Recalculo sem devolução (mudança de fatos) gera `adjustment_negative`, não `reversal`.

## Políticas do plano (`returns_policy`)
- `automatic`: o motor estorna sozinho.
- `manual`: o motor **não** estorna; cria pendência (`RETURN_NEEDS_REVIEW` / `SALE_CANCELLED_NEEDS_REVERSAL`) e a venda fica protegida até que alguém lance um ajuste.

## Bônus
Bônus de meta **nunca** é estornado sozinho. Se uma devolução derruba o atingimento, o motor mantém o valor lançado e abre a pendência `BONUS_BELOW_THRESHOLD` para decisão humana (ajuste manual auditável).

## Após fechamento e pagamento
Lançamento fechado não muda. O estorno posterior só entra num fechamento depois de **aprovado** e reduz o líquido do período em que for fechado; se o líquido ficar negativo, vira saldo devedor transportado ao fechamento seguinte (ver `CLOSING_RULES.md`). Pagamento errado é estornado por `cm_reverse_payout` (novo registro, o original permanece).
