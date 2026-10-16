---
name: sales-goals
description: Use ao mexer em metas e bônus.
---

# sales-goals

- `engine/goals.ts`: bônus é lançamento próprio com chave `g:meta:regra:vendedor`; mesma meta nunca paga duas vezes; alvo 0 nunca atinge.
- O banco limita o bônus ao valor da regra (`cm_post_calculation`).
