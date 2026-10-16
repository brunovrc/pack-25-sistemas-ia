---
name: commission-rule-engine
description: Use ao alterar precedência, condições, conflito ou o orquestrador do cálculo.
---

# commission-rule-engine

- `engine/rules.ts`: escopo → especificidade → prioridade; empate = `RULE_CONFLICT` (nunca escolhe ao acaso); `stack` soma.
- `engine/conditions.ts`: gramática fechada (fatos e operadores listados, limites de profundidade/nós). Sem `eval`.
- `engine/calculate.ts`: alvo × livro → diferença vira lançamento; idempotência = diferença zero; venda inválida fica **protegida** (nada lançado/estornado).
- Toda mudança vem com teste e passa por `pnpm test:mutation`.
