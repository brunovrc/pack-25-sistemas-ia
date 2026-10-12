# DATA_MODEL — CRM Completo

Migração do CRM: `supabase/migrations/20270101000000_crm_schema.sql` (depois das três do Core: fundação, perfis e MFA).
Toda tabela de negócio tem `organization_id`, `created_at`, `updated_at` e **RLS ativa**. Vínculos entre tabelas usam chave estrangeira composta com `organization_id`, então um registro nunca aponta para outra organização.

| Tabela | Para que serve | Observações |
|---|---|---|
| `crm_settings` | 1 linha por organização: dias para «oportunidade parada» (`stale_days`, padrão 14) e «fechamento próximo» (`closing_soon_days`, padrão 7) | só owner/admin alteram |
| `crm_teams`, `crm_team_members` | equipes e participantes | filtro e metas por equipe |
| `crm_pipeline_stages` | etapas do funil (`kind`: open, won, lost; ordem; cor; probabilidade) | configuráveis |
| `crm_lead_sources` | origens de lead | configuráveis |
| `crm_loss_reasons` | motivos de perda | configuráveis |
| `crm_companies`, `crm_contacts` | empresas e pessoas de contato | `custom jsonb` |
| `crm_leads` | leads: origem, responsável, status, classificação, arquivamento, conversão | `custom jsonb`, e-mail único por organização (sem arquivados) |
| `crm_opportunities` | negócios: etapa, valor `numeric(14,2)`, previsão, responsável, status | `custom jsonb`; ganho/perdido preenchem `closed_at` por gatilho; perdido exige motivo |
| `crm_stage_history` | histórico de mudanças de etapa (somente inserção) | gerado por gatilho |
| `crm_activities` | tarefas, ligações, reuniões, follow-ups | liga a lead, contato, empresa ou oportunidade; `custom jsonb` |
| `crm_goals` | metas de vendas por vendedor ou equipe e período | |

## Campos extensíveis
As cinco tabelas acima têm `custom jsonb` (objeto, até 8 KB). Para adaptar a um cliente sem migração, grave valores ali e mostre-os na interface; para campos com filtro ou relatório, prefira coluna própria numa migração nova. Veja `guias/personalizacao.md` no repositório do Pack.

## Quem vê o quê (RLS)
| Papel | Acesso |
|---|---|
| owner / admin | tudo, mais configurações do CRM (escrita exige verificação em duas etapas) |
| manager | todos os dados do CRM e definição de metas |
| member (vendedor) | só leads, oportunidades e atividades **próprios**; lê empresas e contatos |
| viewer | somente leitura |

Testes: `supabase/tests/60_crm_rls.sql` (isolamento entre organizações e papéis), `61_crm_rules.sql` (regras e gatilhos), `62_crm_metrics.sql` (indicadores com fixtures).

## Dados pessoais (LGPD)
Nome, e-mail, telefone, cargo e histórico de contato de leads e contatos. Sem CPF/CNPJ no MVP. Alterações em configurações são auditadas (só nomes de coluna, nunca valores). Quem implanta é o controlador dos dados; veja `docs/LGPD_GUIDE.md` do Pack.
