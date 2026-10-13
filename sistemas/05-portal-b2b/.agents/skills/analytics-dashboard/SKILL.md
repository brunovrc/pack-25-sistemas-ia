---
name: analytics-dashboard
description: Use ao criar ou alterar indicadores, gráficos, filtros, relatórios ou CSV.
---

# Painel e relatórios

- Todo número vem de função SQL `security invoker` em `…_pt_metrics.sql`; definições em `docs/METRICS.md`. Período e «dia» no fuso do portal.
- Novo indicador: função SQL + teste à mão em `supabase/tests/64_pt_metrics.sql` (bordas de fuso/período e escopo por papel) + linha em METRICS.md + E2E comparando a tela com a chamada à função (`pt-dashboard.spec.ts`).
- Cada função de métrica precisa de teste de escopo (colaborador e cliente): a mutação «security definer» as mata.
- Taxa/média sem base = «—», nunca 0. Variação em texto, não só cor.
- Gráficos: Recharts só no navegador (`charts-loader`), `isAnimationActive={false}`, cada um com «Ver dados em tabela». O cliente não recebe rankings internos.
- CSV: `lib/portal/csv.ts` neutraliza fórmulas, BOM, `;`, só gestão, auditado por `pt_log_export` (sem trilha, sem arquivo).
- Filtros vêm da URL e são SEMPRE validados (`lib/portal/filters.ts`).
