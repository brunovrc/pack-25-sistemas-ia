---
name: monthly-closing
description: Use ao mexer em períodos, fechamentos, saldo devedor ou reabertura.
---

# monthly-closing

- Estados: open → in_review → awaiting_approval → closed. Um lançamento em um fechamento só. Saldo devedor transportado (`carryover_*`).
- Reabrir: só admin, justificativa ≥ 20, sem pagamento registrado, sem período posterior fechado.
- Código: `supabase/migrations/20271001000600_cm_closing.sql`. Doc: `docs/CLOSING_RULES.md`.
