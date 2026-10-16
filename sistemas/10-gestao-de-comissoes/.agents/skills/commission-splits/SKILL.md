---
name: commission-splits
description: Use ao mexer em rateio entre vendedores (pool ou independente).
---

# commission-splits

- `allocateByWeights`: maior resto, desempate pela ordem recebida (principal, depois `seller_id`); soma das partes = total, também para negativos.
- `pool`: um dono, exatamente um principal, participações somam 100%. `independent`: cada um com o plano fixado.
- Doc: `docs/SPLIT_RULES.md`.
