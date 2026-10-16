---
name: eligibility-engine
description: Use ao mexer em quando a comissão passa a valer (confirmação, recebimento total ou proporcional).
---

# eligibility-engine

- `engine/calculate.ts` → `eligibility()`. Devido = líquido × fração não devolvida.
- Base `received_value` força razão 1 (o recebimento já é a base) e exige elegibilidade proporcional na publicação.
- Doc: `docs/ELIGIBILITY_RULES.md`.
