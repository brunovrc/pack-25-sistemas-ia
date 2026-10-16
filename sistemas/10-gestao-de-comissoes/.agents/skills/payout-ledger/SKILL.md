---
name: payout-ledger
description: Use ao mexer em registro de pagamento, alocação e estorno de pagamento.
---

# payout-ledger

- `cm_record_payout` trava os fechamentos (`for update`, ordem fixa), valida saldo, referência única e data; o sistema **não** transfere dinheiro.
- Estorno de pagamento cria novo registro; o original permanece. Teste de concorrência: `scripts/test-concurrency.mjs`.
