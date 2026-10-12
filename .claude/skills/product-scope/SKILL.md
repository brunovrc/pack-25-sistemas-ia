---
name: product-scope
description: Transforma o escopo de um sistema do Pack em critérios de aceitação testáveis e limites claros do MVP. Use ao iniciar um sistema ou ao surgir pedido de funcionalidade fora do catálogo.
---

# product-scope

1. Ler a entrada do sistema em `catalogo/sistemas.json` (features, exclusões, KPIs). Ela manda; pedido fora dela é recusado ou vira decisão do titular.
2. Para cada feature, escrever fluxo mínimo: ator → ação → resultado persistido → como verificar.
3. Para cada KPI, escrever a fórmula e o intervalo de tempo.
4. Listar explicitamente o que NÃO entra (exclusões do catálogo) e o risco LGPD do sistema.
5. Gravar em `docs/FEATURES.md` (status TODO) e uma linha em `MEMORY.md`.
Saída: tabela de fluxos com critério de aceite, sem implementação.
