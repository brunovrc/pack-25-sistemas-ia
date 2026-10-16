# COMMISSION_ENGINE — motor de comissões

Código: `lib/commissions/engine/` (TypeScript puro, sem I/O). Versão `ENGINE_VERSION = 1.0.0`, gravada em cada memória de cálculo.

## Princípios
1. **Dinheiro em centavos inteiros**, taxas em texto decimal (`"0.05"`). Nunca `float`. `decimal.js` com precisão 40.
2. **Determinismo**: mesmos fatos ⇒ mesmos lançamentos, na mesma ordem. Nada de `Date.now()`, nada de acaso.
3. **Alvo × livro**: para cada *componente* (venda × item × regra × dono) o motor calcula o **alvo** (quanto já é elegível hoje) e compara com o que o livro **já tem** (`booked`). A diferença vira lançamento.
4. **Idempotência**: reprocessar os mesmos fatos ⇒ diferença zero ⇒ nenhum lançamento novo. Chave: `componentKey|vendedor#n`.
5. **Histórico imutável**: lançamento nunca é editado; correção é novo lançamento (estorno/ajuste) que referencia o original.
6. **Calculado ≠ aprovado ≠ pago**: o motor só calcula. Aprovação, fechamento e pagamento são etapas separadas no banco.

## Funções públicas (`engine/index.ts`)
| Função | O que faz |
|---|---|
| `computeCommissions(input)` | Fatos de vendas + planos fixados + livro ⇒ `{ details, entries, pendencies }` |
| `evaluateGoals(goals, sales, booked, asOf)` | Metas e bônus como lançamentos próprios (`g:meta:regra:vendedor`) |
| `validatePlanVersion(plan)` | Regras de publicação de uma versão de plano |
| `allocateByWeights(total, pesos)` | Rateio de centavos (maior resto) |
| `parseMoneyToCents`, `formatBRL`, `parsePercentToRate` | Entrada/saída de valores pt-BR |

## Fluxo de `computeCommissions`
1. **Preparar a venda** (`prepareSale`): ordena itens; valida soma dos itens = total comissionável; aplica devoluções por item (limitadas ao saldo do item, com pendência `RETURN_EXCEEDS_SALE`); cancelamento vira devolução do restante.
2. **Participantes**: sem participante, repetido, pool sem principal único ou que não soma 100% ⇒ pendência crítica e a venda fica **protegida** (nada é lançado nem estornado).
3. **Plano fixado**: o plano de cada participante é o que o servidor gravou na confirmação da venda. Sem plano ⇒ `NO_PLAN`.
4. **Elegibilidade** (`sale_confirmation`, `full_receipt`, `proportional_receipt`) ⇒ razão 0–1 e data de elegibilidade. Na base `received_value` a razão é forçada a 1 (o recebimento já é a base).
5. **Base por item**: `net_value`, `gross_margin` (exige custo; nunca presume zero), `received_value` (recebimento rateado por maior resto, limitado ao saldo do item), `fixed_per_unit`, `fixed_per_sale`.
6. **Regra vencedora** (`rules.ts`): escopo → especificidade → prioridade; empate = `RULE_CONFLICT` (nunca escolhe ao acaso). Regras `stack` somam.
7. **Percentual/fixo**: arredondamento meio-para-cima **uma vez por componente**.
8. **Faixas**: eventos (item, recebimento, devolução) agrupados por (regra, escopo, período), acumulados em ordem cronológica; o lançamento é a **diferença entre acumulados arredondados** — a soma dos lançamentos é sempre igual à comissão exata do acumulado.
9. **Rateio**: `pool` (um dono; resultado dividido por maior resto) ou `independent` (cada participante tem seu componente).
10. **Reconciliar** (`reconcile`): `delta = alvo − livro`; positivo ⇒ comissão/ajuste positivo; negativo ⇒ estorno (devolução/cancelamento) ou ajuste negativo, sempre com `originalIdempotencyKey` do primeiro lançamento positivo. Componentes que sumiram dos fatos (ex.: recebimento estornado) vão a alvo zero, exceto em vendas protegidas.

## Persistência
O servidor chama `cm_post_calculation` (SECURITY DEFINER) com `details` + `entries`. O banco **revalida**: participante pertence à venda, plano é o fixado, regra pertence ao plano, plano publicado, original do estorno existe, bônus ≤ valor da regra. A chave de idempotência tem índice único `(organization_id, idempotency_key)`; execuções simultâneas da mesma venda inserem uma só vez (provado em `scripts/test-concurrency.mjs`).

## Provas
`tests/unit/engine-reference.test.ts` (15 casos de referência do prompt §42), `engine-rules.test.ts`, `engine-properties.test.ts` (propriedades: idempotência, soma exata, ordem das vendas irrelevante) e `scripts/mutation-check.mjs`.
