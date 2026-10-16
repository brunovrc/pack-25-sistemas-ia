# DATABASE — Gestão de Comissões

Migrações em `supabase/migrations/` (prefixo `20271001…`, depois das migrações do Core). Ordem:

| Arquivo | Conteúdo |
|---|---|
| `000000_cm_schema` | tabelas de cadastro, planos, vendas, metas |
| `000010_cm_ledger_schema` | execuções, lançamentos, aprovações, contestações, ajustes, períodos, fechamentos, pagamentos, demonstrativos, importações, notificações |
| `000050_cm_rls` | RLS (somente SELECT) |
| `000100_cm_guards` | funções de papel, triggers de imutabilidade, auditoria |
| `000200_cm_registry` | RPCs de cadastro (vendedor, equipe, cliente, produto, configurações, acesso) |
| `000300_cm_plans` | planos, versões, regras, faixas, validação e publicação |
| `000400_cm_sales` | vendas, confirmação, devolução, cancelamento, recebimento |
| `000500_cm_ledger` | `cm_post_calculation`, revisão, contestações, ajustes |
| `000600_cm_closing` | períodos, fechamentos, pagamentos, demonstrativos |
| `000700_cm_goals_misc` | metas, simulações salvas, notificações |
| `000800_cm_metrics` | `cm_dashboard`, `cm_org_aggregates`, `cm_team_at` |
| `000900_cm_context` | contexto do usuário e membros |
| `000950…000970` | log de exportação, bucket de demonstrativos, importação |
| `999999_cm_privileges` | `revoke`/`grant` finais (nada de escrita direta) |

## Convenções
- Dinheiro `bigint` em centavos (`*_cents`); taxas `numeric(9,6)`; datas `date`; instantes `timestamptz`.
- Convenção de sinal do livro: comissão, bônus e ajuste positivo > 0; ajuste negativo e estorno < 0; lançamento nunca vale 0.
- `idempotency_key` único por organização; `component_key` agrupa os lançamentos de um componente.
- Exclusão física proibida nas tabelas de histórico (`cm_no_delete`); cadastros são arquivados (`archived_at`).
- Auditoria (`audit_trigger`/`cm_audit`) em cadastros, planos e decisões; sem valores sensíveis em log de aplicação.

## Testes
`supabase/tests/50_cm_domain.sql` (30 blocos: cálculo gravado, plano fixado, estornos, aprovação, fechamento, pagamento, metas, importação, métricas) e `70_cm_security.sql` (9 blocos: RLS entre empresas, perfis, escrita direta negada, segregação de funções, vendedor só vê o seu). Execução: `node scripts/test-db.mjs` (container Postgres descartável com o harness do Core).

Modelo detalhado das tabelas: `DATA_MODEL.md`.
