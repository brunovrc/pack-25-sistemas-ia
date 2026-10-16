---
name: progressive-tiers
description: Use ao mexer em comissão por faixas (marginal/atingida) e acúmulo por período.
---

# progressive-tiers

- Faixas (de, até], teto **inclusivo**; primeira em 0; sem lacuna/sobreposição; só a última sem teto.
- `marginal` = taxa por parcela; `reached` = taxa da faixa atingida sobre a base toda. Nunca misture.
- Lançamento = diferença entre acumulados arredondados; devolução é evento negativo no mesmo grupo (regra|escopo|período).
- Código: `engine/tiers.ts` e a seção de faixas de `engine/calculate.ts`. Doc: `docs/TIER_RULES.md`.
