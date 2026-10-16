---
name: commission-reversals
description: Use ao mexer em devolução, cancelamento, estorno ou ajuste.
---

# commission-reversals

- Devolução por item (soma = valor); cancelamento = devolução do restante. Estorno referencia o 1º lançamento positivo; `source_event_id` é único por evento.
- Plano `manual`: sem estorno automático, só pendência. Bônus nunca é estornado sozinho (`BONUS_BELOW_THRESHOLD`).
- Doc: `docs/REVERSALS.md`.
