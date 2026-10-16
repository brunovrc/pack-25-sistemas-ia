# SPLIT_RULES — rateio entre vendedores

Código: `engine/split.ts` (`allocateByWeights`).

## Método do maior resto
1. Parte exata de cada participante = total × peso ÷ soma dos pesos.
2. Cada um recebe o **piso** (centavos inteiros).
3. Os centavos que sobram vão, um a um, a quem tem **maior resto fracionário**; empate ⇒ ordem recebida (o motor ordena: principal primeiro, depois `seller_id`).
4. A soma das partes é **sempre exatamente** o total. Totais negativos (estornos) usam o mesmo método sobre o valor absoluto, com sinal restituído.

Pesos negativos, lista vazia e soma zero são recusados.

## Modelos da venda
- **`pool`**: um único dono (o participante principal) calcula a comissão; o resultado é dividido pelas participações, que devem somar **exatamente 100%** e ter **um** principal. Só o principal precisa de plano vigente; os demais só dividem o resultado.
- **`independent`**: cada participante tem componente próprio, com o **seu** plano (fixado na confirmação) aplicado à sua fatia (`allocation_percentage`).

A soma das fatias de cada componente é igual ao total do componente; o estorno de uma devolução usa as mesmas participações da venda.

## Metas com bônus fixo
`distribution = each` (cada vendedor recebe o valor) ou `proportional` (valor rateado pelo crédito de cada um, mesmo método).
