---
name: decimal-money-calculations
description: Use ao escrever ou revisar qualquer conta com dinheiro, taxa ou quantidade.
---

# decimal-money-calculations

- Centavos inteiros (`number` seguro) e taxas em texto decimal; **nunca float** (`dec()` recusa fração binária).
- `decimal.js` via `engine/decimal.ts` (precisão 40, meio-para-cima). Arredonde **uma vez por componente**; em faixas, sobre o acumulado.
- Entrada pt-BR: `parseMoneyToCents`/`parsePercentToRate`; saída: `formatBRL`. Ambíguo (`1,234.56`) é recusado.
- Testes: `tests/unit/engine-rules.test.ts`, `engine-boundaries.test.ts`.
