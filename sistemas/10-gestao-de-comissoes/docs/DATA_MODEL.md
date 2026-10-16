# DATA_MODEL — Gestão de Comissões

Todas as tabelas têm `organization_id` e RLS. Relações entre tabelas usam FK composta `(id, organization_id)`.

## Cadastros
- `commission_settings` (1 por organização): fuso, base padrão, política de saldo negativo (`carry_forward` | `manual_review`), `segregation_of_duties`, `allow_receipt_over_sale`, `allow_payout_over_balance`, prazos.
- `commission_access`: marca quem do tipo *member* é **financeiro**; vínculo do usuário a um vendedor.
- `sales_teams` (gestor em `manager_user_id`), `sellers` (+ `seller_team_history` com vigência), `customers`, `product_categories`, `products`.

## Planos
- `commission_plans` → `commission_plan_versions` (rascunho → publicada; **imutável depois de publicada**; vigência não retroativa para plano já usado) → `commission_rules` (percentual, fixo, faixas; escopo; condições JSON; prioridade; `stack`; entry_kind commission/bonus) → `commission_tiers` (de/até/taxa/ordem).
- `seller_plan_assignments`: vendedor × plano × vigência (sem sobreposição).

## Vendas
- `sales` (status, totais, modelo de rateio, canal, datas), `sale_items` (valor líquido, comissionável, custo), `sale_participants` (percentual, tipo `primary`/`secondary`, **`plan_version_id` fixado na confirmação**), `sale_events` (histórico: confirmada, devolução, cancelamento), `customer_receipts` (recebimentos; estornados mantêm a linha).

## Metas
`sales_goals` (tipo, escopo, período, alvo) e `goal_bonus_rules` (limiar %, bônus fixo ou %, momento, distribuição).

## Livro
- `commission_calculation_runs` (execução: tipo, versão do motor, hash dos parâmetros, status) e `commission_calculation_details` (**memória de cálculo**: base, taxa, potencial, elegível, snapshot JSON).
- `commission_entries` (**livro imutável**): tipo (`commission`, `bonus`, `reversal`, `adjustment_positive`, `adjustment_negative`), valor com sinal, `component_key`, `idempotency_key`, `original_entry_id`, `source_event_id`, `approval_status`, datas, origem (`calculation`/`adjustment`).
- `commission_approval_events` (decisões), `commission_disputes` (contestações), `commission_adjustments` (ajustes manuais com aprovação), `commission_pendencies` (inconsistências do motor).

## Fechamento e pagamento
`commission_periods` → `commission_closings` (por vendedor: totais, saldo devedor entrada/saída, a pagar) → `commission_closing_items` (lançamentos fechados; `voided_at` ao refazer) · `payout_records` + `payout_allocations` (pagamentos registrados e sua distribuição entre fechamentos) · `commission_statements` (versões de PDF).

## Apoio
`import_jobs`/`import_row_errors` (arquivo **não** é retido: só hash, contagens, erros por linha), `commission_notifications` + `commission_notification_prefs`, `saved_simulations`.

## Dados pessoais (LGPD)
Nome do vendedor e remuneração variável. Minimização: sem CPF, sem dado bancário, sem endereço; arquivos importados não são guardados; exportações e acesso a demonstrativos ficam na auditoria; seed só com nomes fictícios.
