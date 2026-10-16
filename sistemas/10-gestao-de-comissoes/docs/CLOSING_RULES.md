# CLOSING_RULES — fechamento mensal e pagamentos

## Máquina de estados do período
`open → in_review → awaiting_approval → closed` (e `closed → open` por reabertura; `cancelled` antes de fechar).

| Passo (RPC) | Regra |
|---|---|
| `cm_open_period` | sem sobreposição com outro período (restrição de exclusão); até 366 dias |
| `cm_prepare_closings` | exige períodos anteriores fechados e o período já encerrado; monta **um fechamento por vendedor** com os lançamentos **aprovados** ainda não fechados |
| `cm_submit_period` | recusa se há inconsistências críticas (`cm_period_checks.blocked`) |
| `cm_close_period` | repete as checagens; todos os itens ainda precisam estar `approved`; **segregação de funções** (quando ligada): quem preparou não fecha |
| `cm_reopen_period` | só administrador; justificativa ≥ 20 caracteres; recusa se houver pagamento registrado ou período posterior fechado |

Cada lançamento entra em **um** fechamento (`commission_closing_items`, índice único parcial). Preparar de novo cancela os rascunhos do período e libera os itens.

**Saldo devedor** (estornos maiores que as comissões): `líquido = comissões + bônus + ajustes + estornos`. `a pagar = max(líquido − saldo_devedor_herdado, 0)` e `saldo_devedor_seguinte = max(saldo_devedor_herdado − líquido, 0)`. O saldo herdado vem do último fechamento **concluído** do vendedor e é descontado no seguinte. A política da organização (`negative_balance_policy`) é `carry_forward` (transporta) ou `manual_review` (o período não fecha enquanto houver saldo devedor sem revisão). `commission_closing_balances` mostra a pagar, pago e saldo.

## Pagamentos (somente registro)
O sistema **não transfere dinheiro**. `cm_record_payout` registra que o financeiro pagou: data (não futura), forma, referência externa única por vendedor, valor = soma das alocações a fechamentos **fechados** do mesmo vendedor.
- Valor de cada alocação ≤ saldo aprovado do fechamento (a menos que `allow_payout_over_balance`).
- Os fechamentos são travados em ordem fixa (`for update`): pagamentos simultâneos do mesmo saldo se enfileiram e só um cabe.
- Com a segregação ligada, quem aprovou o fechamento não registra o pagamento.
- `cm_reverse_payout` cria o estorno do pagamento; o registro original é preservado.

## Demonstrativos
`cm_register_statement` guarda uma **versão** imutável do PDF (`statements/<org>/<vendedor>/<fechamento>-vN.pdf`, bucket privado). Só fechamento concluído gera demonstrativo; o vendedor baixa apenas o seu.
