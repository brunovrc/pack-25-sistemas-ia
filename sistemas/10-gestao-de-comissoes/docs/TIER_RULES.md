# TIER_RULES — comissão por faixas

## Intervalos
Faixas são **(de, até]**: limite inferior exclusivo, **superior inclusivo**. Uma base exatamente igual ao teto de uma faixa pertence a ela. Valores em centavos.

Validação (`validateTiers`): ao menos uma faixa; ordens únicas; taxa 0–100%; início ≥ 0; fim > início; primeira começa em R$ 0,00; sem lacuna e sem sobreposição; só a última pode ficar sem teto, e ela **deve** ficar sem teto.

## Modos (nunca misturados)
- **marginal**: cada faixa incide só sobre a parcela da base que cai nela. Ex.: faixas 0–10.000 a 5% e acima a 8%; base 15.000 ⇒ 10.000×5% + 5.000×8%.
- **reached**: a taxa da faixa atingida incide sobre a base **inteira**. Base 15.000 ⇒ 15.000×8%.

## Acúmulo
Escopo `seller` ou `team`; período `month`, `quarter` ou `year` (chave `AAAA-MM`, `AAAA-Qn`, `AAAA`). Os eventos do grupo (item vendido, recebimento, devolução) são ordenados por `data | número da venda | posição do item | tipo | id` e acumulados.

Para cada evento: `exato = tierAmount(acumulado)`, `arredondado = round(exato)`, **lançamento = arredondado − arredondado anterior**. Consequências: a soma dos lançamentos do grupo é sempre igual à comissão do acumulado arredondada uma vez; uma devolução (evento negativo) reduz o acumulado e gera estorno proporcional à faixa em que o acumulado cai; trocar a ordem de chegada das vendas não muda o total.

## Memória de cálculo
Cada lançamento guarda acumulado antes/depois, comissão exata, acumulado arredondado e as linhas por faixa (`tierBreakdown`).
