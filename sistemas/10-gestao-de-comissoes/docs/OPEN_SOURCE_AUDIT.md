# OPEN_SOURCE_AUDIT — Gestão de Comissões

Avaliação de referências **antes** de escrever código (regra do prompt mestre). Licenças consultadas no repositório de origem
(`gh repo view` / arquivo LICENSE). "Referência" = lido para entender o domínio; nenhum trecho foi copiado.

| Projeto | Licença | Decisão | Motivo |
|---|---|---|---|
| ERPNext (módulo de comissão de vendas) | GPL-3.0 | **Só referência** | Copyleft forte: copiar código obrigaria a abrir o sistema inteiro. Usado apenas para conferir vocabulário (parceiro de vendas, comissão sobre pedido). |
| decimal.js | MIT | **Adotado** (`decimal.js` 10.6.0) | Aritmética decimal exata; é a base de todo o motor. |
| dinero.js | MIT | Não adotado | Bom modelo de moeda, mas o motor trabalha só em BRL/centavos inteiros; evita dependência extra. |
| json-rules-engine | ISC | **Não adotado** | Decisão D-C2: o domínio precisa de AND/OR/NOT sobre ~10 fatos fixos; avaliador próprio, síncrono e determinístico, sem dependência transitiva. |
| pg-boss | MIT | **Não adotado** | O cálculo roda sob demanda dentro de uma ação do servidor; não há fila. Evita um segundo estado de execução. |
| atomic-crm | MIT | Referência de UX | Padrão de listas/filtros/atividade. Nada copiado. |
| medusa-order-affiliate | MIT | Referência | Modelagem de comissão por pedido. Nada copiado. |
| commission-engine (repositório sem licença) | **sem licença** | **Só referência** | Sem licença não há permissão de reuso: lido, não copiado. |
| papaparse | MIT | **Adotado** | Leitura de CSV (aspas, delimitadores, BOM). |
| pdf-lib | MIT | **Adotado** | Demonstrativo em PDF no servidor, sem navegador headless. |
| recharts | MIT | **Adotado** | Gráficos do painel. |

Dependências removidas por não serem usadas: `date-fns`, `react-hook-form`, `@hookform/resolvers`.

Regra: nenhuma dependência GPL/AGPL entra no sistema. Texto das licenças adotadas em `THIRD_PARTY_NOTICES.md` (raiz do hub).
