---
name: request-workflow
description: Use ao alterar situações, transições, prazos/SLA, reabertura, comentários ou notificações de solicitação.
---

# Fluxo de solicitações

- Fonte única das transições: `private.pt_transition_ok`. `lib/portal/workflow.ts` é só espelho da interface; mude os dois e `62_pt_workflow.sql`.
- Cancelar e reabrir exigem motivo; reabertura do cliente só dentro de `reopen_window_days`; resposta do cliente em «aguardando cliente» vira «aguardando prestadora».
- Prazo: `pt_add_business_hours` (fuso, dias e expediente do portal; sem feriados). Prazo combinado/estimativa só gestão, com motivo; trocar prioridade só recalcula prazo de política.
- Histórico (`request_status_history`), comentários e eventos de prazo são imutáveis.
- Avisos: `private.pt_refresh_org` (idempotente) via `pt_refresh` (gestão) ou `private.pt_refresh_all` (pg_cron). Notificações têm `dedup_key`; nunca para usuário desativado.
- Regra crítica nova → teste SQL com valores à mão + mutação.
