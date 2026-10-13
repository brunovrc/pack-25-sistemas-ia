# FEATURES — Portal de Clientes B2B

Status: VERIFIED (com evidência: arquivo/teste), FORA DO MVP ou LIMITE DOCUMENTADO. Última verificação completa: 2026-10-13 (lint e tipos limpos; 72 testes unitários; testes SQL 60–64 e os do Core; 33/33 mutações reprovadas; 49 testes E2E contra Supabase local + build de produção).

| Fluxo | Status | Evidência |
|---|---|---|
| Duas camadas (prestadora × empresa cliente), papéis da equipe e do cliente | VERIFIED | `61_pt_access.sql`, `pt-security.spec.ts` |
| Isolamento entre empresas e entre prestadoras (RLS, chaves compostas) | VERIFIED | `61_pt_access.sql`, E2E «1–3», «4–7» |
| Convites seguros (hash, 7 dias, uso único, e-mail, mensagem uniforme, revogação) | VERIFIED | `62_pt_workflow.sql`, `pt-invite.spec.ts` |
| Usuários da empresa: papel, ativar/desativar, último administrador protegido | VERIFIED | `62_pt_workflow.sql`, E2E «11–14» |
| Solicitações: abrir, atribuir, editar, prioridade, categoria | VERIFIED | `62_pt_workflow.sql`, `pt-flow.spec.ts` |
| Máquina de estados e reabertura pelo cliente | VERIFIED | `62_pt_workflow.sql`, `pt-workflow-format.test.ts`, `pt-flow.spec.ts` |
| Prazo: SLA em horas úteis, combinado, estimativa, histórico | VERIFIED | `60_pt_business_hours.sql` (20 casos à mão), `62_pt_workflow.sql` |
| Comentários compartilhados × notas internas; histórico imutável | VERIFIED | `62_pt_workflow.sql`, `pt-flow.spec.ts`, E2E «1–3» |
| Documentos privados: pastas, visibilidade, tipo real, URL assinada de 60 s, trilha | VERIFIED | `63_pt_documents.sql`, `pt-uploads-validation.test.ts`, `pt-flow.spec.ts`, E2E «8–10» (inclui 15 MB e 21 MB) |
| Entregas: rascunho → pronta → publicada → recebimento confirmado | VERIFIED | `62/63`, `pt-flow.spec.ts` |
| Comunicados: todos ou selecionados, agendamento, expiração | VERIFIED | `62_pt_workflow.sql`, `pt-flow.spec.ts` |
| Notificações internas (dedup, silenciar tipos, nunca para desativado) | VERIFIED | `62_pt_workflow.sql` |
| Painel: 10 indicadores, 8 gráficos, filtros, alertas (equipe e cliente) | VERIFIED | `64_pt_metrics.sql` (valores à mão), `pt-dashboard.spec.ts` (tela = banco) |
| Relatórios: 5 com CSV, BOM, fórmulas neutralizadas, auditoria | VERIFIED | `64_pt_metrics.sql`, `pt-filters-csv.test.ts`, `pt-dashboard.spec.ts` |
| White-label (nome, cores, contato, rodapé) | VERIFIED | `pt-smoke.spec.ts`, capturas |
| Celular (390 px) sem rolagem horizontal | VERIFIED | `pt-mobile.spec.ts`, `docs/screenshots/*-mobile.png` |
| Rotina de avisos por agendador (pg_cron) | VERIFIED (SQL) | `62_pt_workflow.sql` — agendamento real em produção: NÃO EXECUTADO |
| Antivírus no envio de arquivos | FORA DO MVP | `docs/DOCUMENTS.md` |
| Feriados no cálculo de SLA | LIMITE DOCUMENTADO | `docs/WORKFLOWS.md` |
| E-mail transacional de notificação | FORA DO MVP | `docs/DECISIONS.md` D-13 |

## Evidências por comando
`pnpm lint` · `pnpm typecheck` · `pnpm test` (72) · `pnpm test:db` · `pnpm test:mutation` (33/33) · `pnpm test:e2e` (49).
Cenários de ameaça cobertos: ver tabela em `docs/PERMISSIONS.md`.
