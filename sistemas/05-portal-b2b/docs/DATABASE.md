# DATABASE — Portal de Clientes B2B

Quatro migrações do sistema sobre as do Core (`supabase/migrations`): `…_pt_schema` (tabelas, RLS, gatilhos), `…_pt_workflow` (solicitações, prazos, notificações), `…_pt_content` (documentos, entregas, comunicados, convites, Storage), `…_pt_metrics` (indicadores). Testes SQL em `supabase/tests/60–64`.

## Dois níveis
- **Prestadora** = `organizations` do Core (equipe em `organization_members`).
- **Empresa cliente** = `client_accounts` (1 prestadora → N empresas). **Usuários da empresa** = `client_members` (papel `client_admin` | `client_user`, situação `active` | `inactive`). Nunca entram em `organization_members`.

## Tabelas
| Grupo | Tabelas |
|---|---|
| Configuração | `portal_settings` (white-label, fuso, expediente, alertas, janela de reabertura, limite de arquivo), `service_categories`, `service_level_policies` (SLA por prioridade) |
| Empresas e acesso | `client_accounts`, `client_internal_notes` (só equipe), `client_members`, `invitation_tokens` (só o **hash** do token) |
| Solicitações | `requests` (número sequencial por prestadora via `request_counters`), `request_comments` (imutáveis), `request_status_history` (imutável), `request_deadline_events` |
| Documentos | `document_folders`, `documents`, `document_access_logs` (imutável), `request_attachments` |
| Entregas | `deliverables`, `deliverable_files` |
| Comunicação | `announcements`, `announcement_recipients`, `notifications`, `notification_preferences` |
| Core reaproveitado | `organizations`, `organization_members`, `profiles`, `audit_log` (imutável) |

## Padrões obrigatórios
- **RLS em todas** as tabelas; `revoke all` de `anon`/`authenticated` e `grant select` mínimo; escritas sensíveis **só por funções** (`pt_*`, `SECURITY DEFINER`, `set search_path = ''`). Funções do sistema não são executáveis pelo anônimo (teste).
- **Chaves compostas** `(id, organization_id[, client_account_id])` nas referências: um comentário, anexo, documento ou entrega só pode apontar para uma solicitação **da mesma empresa**.
- **Históricos imutáveis** por gatilho (`pt_append_only`, `pt_comment_immutable`): comentários, mudanças de situação, trilha de acessos.
- **Auditoria** (`audit_trigger`) em empresas, usuários da empresa, categorias, SLA, comunicados, convites, pastas e configurações.
- **Grants por coluna** onde o cliente da API poderia tocar (ex.: `invitation_tokens` não expõe `token_hash`).

## Funções públicas (RPC)
| Área | Funções |
|---|---|
| Solicitações | `pt_request_create`, `pt_request_set_status`, `pt_request_assign`, `pt_request_edit`, `pt_request_set_due`, `pt_comment_add`, `pt_refresh` (gestão), `pt_user_labels` |
| Documentos | `pt_folder_create`, `pt_folder_archive`, `pt_document_register`, `pt_document_access`, `pt_document_set_visibility`, `pt_document_archive` |
| Entregas | `pt_deliverable_create/update/attach/detach/set_status/acknowledge` |
| Comunicados | `pt_announcement_publish` |
| Convites e usuários | `pt_invite_create`, `pt_invite_revoke`, `pt_invite_accept`, `pt_client_member_set` |
| Indicadores | `pt_kpis`, `pt_series`, `pt_status_distribution`, `pt_priority_distribution`, `pt_by_assignee`, `pt_by_client`, `pt_alerts`, `pt_log_export` |
| Utilitário | `pt_add_business_hours` (horas úteis, imutável e testável isoladamente) |

`private.pt_refresh_org` e `private.pt_refresh_all` (rotina dos avisos para o agendador) não são executáveis pela API. Helpers de autorização (`private.pt_role`, `pt_is_staff/manager/admin`, `pt_client_role`, `pt_staff_sees_client`, `pt_staff_writes_client`, `pt_sees_client`, `pt_actor`) ficam no schema `private`, fora da API.

## Storage
Bucket privado `portal-documents` (50 MB, lista fechada de tipos), criado pela migração **quando o schema `storage` existe** (Supabase). Políticas em `storage.objects`: leitura (equipe com acesso, cliente só de documento compartilhado e não arquivado), inserção (caminho `<org>/<empresa>/<uuid>` + vínculo) e limpeza de órfãos do próprio autor. **Atenção:** dentro de subconsultas, `name` sem qualificar é `client_accounts.name`; as políticas usam `objects.name` (armadilha real encontrada nos testes).

## Dados de demonstração
`node scripts/gen-seed.mjs` gera `supabase/seed.sql` (determinístico): «Agência Horizonte Digital», 3 empresas, 58 solicitações com histórico/prazos/conversas, 18 documentos, 9 entregas, 3 comunicados. Prazos vêm de `pt_add_business_hours`; os avisos vêm de `pt_refresh`. Os arquivos reais vão ao Storage local com `node scripts/seed-files.mjs`.

## Como testar
`pnpm test:db` sobe um Postgres descartável (Docker), aplica Core + sistema e roda os testes SQL. `pnpm test:mutation` quebra 33 regras críticas de propósito e exige que a suíte reprove cada uma.
