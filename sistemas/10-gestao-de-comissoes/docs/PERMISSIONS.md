# PERMISSIONS — perfis e permissões

Os papéis vêm do Core (`owner/admin/manager/member/viewer`); o sistema deriva cinco perfis:

| Perfil | Origem | Enxerga | Faz |
|---|---|---|---|
| **Administrador** | owner/admin | tudo da empresa | configura, publica planos, reabre período, vê auditoria |
| **Gestor** | manager | vendedores e vendas das equipes que gere (`sales_teams.manager_user_id`) | revisa/aprova comissões da equipe, responde contestações, cria metas da equipe |
| **Financeiro** | member + `commission_access.finance` | todos os lançamentos, fechamentos e pagamentos | prepara/fecha períodos, registra pagamentos, importa, exporta |
| **Vendedor** | member vinculado a um vendedor | **apenas os próprios** lançamentos, vendas, metas e demonstrativos | contesta, baixa demonstrativo, simula |
| **Consulta** | viewer | **só agregados da empresa** (`cm_org_aggregates`), nunca remuneração individual | — |

## Regras transversais
- A decisão é do **banco**: RLS para leitura, RPCs `cm_*` para escrita. Esconder botão na tela não é controle.
- Escrita exige 2º fator (`mfa_ok`).
- **Sempre ativo**: ninguém aprova a própria comissão (o vendedor vinculado ao lançamento é barrado pelo banco).
- **Segregação de funções** (configurável em Configurações; **desligada por padrão**, recomendada quando há mais de uma pessoa no financeiro): quem calculou não aprova; quem criou o ajuste não o aprova; quem preparou o fechamento não o fecha; quem aprovou o fechamento não registra o pagamento.
- Rejeição, reabertura de período e estorno exigem justificativa mínima.
- Vendedor não vê plano, regra, taxa ou comissão de colega; gestor não vê fora da equipe (pelo id, a resposta é 404).
- Exportações e downloads de demonstrativo geram registro de auditoria sem valores.
- Evidência: `supabase/tests/70_cm_security.sql`, `tests/e2e/cm-demo.spec.ts`, `tests/e2e/cm-import-security.spec.ts`.
