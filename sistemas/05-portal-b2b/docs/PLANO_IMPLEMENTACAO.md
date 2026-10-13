# PLANO_IMPLEMENTACAO — Portal de Clientes B2B

Fases executadas na ordem abaixo; cada uma terminou com testes verdes antes da seguinte. Prioridades do produto: **permissões e compartilhamento seguro de documentos**, depois **acompanhamento de solicitações** (é o que demonstra valor).

| Fase | Entrega | Verificação |
|---|---|---|
| 1. Modelo e isolamento | Prestadora × empresa cliente, `client_members`, helpers de autorização, RLS em todas as tabelas, chaves compostas, históricos imutáveis, auditoria | `test:db` (Core + 61) |
| 2. Horas úteis e SLA | `pt_add_business_hours` (fuso, dias, expediente), políticas por prioridade | `60_pt_business_hours` (20 casos à mão) |
| 3. Fluxo de solicitações | Máquina de estados, prioridade, responsável, prazo (política/combinado/estimativa), comentários compartilhados × internos, reabertura, notificações | `62_pt_workflow` |
| 4. Documentos, entregas, comunicados, convites | Pastas, visibilidade, trilha, Storage privado, entregas com publicação e confirmação, comunicados dirigidos, convites com hash | `63_pt_documents`, `62_pt_workflow` |
| 5. Métricas | KPIs, séries, distribuições, rankings, alertas, log de exportação | `64_pt_metrics` |
| 6. Mutação | 33 mutações das regras críticas; sobreviventes viraram testes | `test:mutation` |
| 7. Sessão e rotas | Sessão do cliente, portal `/portal/*`, painel `/…`, convite público sem consulta ao banco | lint, tipos, build, `pt-smoke` |
| 8. Documentos na aplicação | Envio com tipo real pelos bytes, download por URL assinada de 60 s, trilha | `pt-flow`, `pt-security` |
| 9. Painel e relatórios | 10 KPIs, 8 gráficos, filtros, alertas, 5 relatórios com CSV auditado, white-label | `pt-dashboard` |
| 10. Demonstração | Seed gerado (3 empresas, 58 solicitações, 18 documentos, 9 entregas) + arquivos reais no Storage local | `pt-flow` |
| 11. E2E e segurança | Fluxo equipe × cliente, 14 cenários de ameaça, convites, celular, capturas revisadas | `pt-*.spec.ts` |
| 12. Entrega | Docs, licenças, CI, instalação isolada, repositório público | CI verde; cópia exportada |

## Riscos tratados
Vazamento entre empresas (RLS + chaves compostas + E2E de ataque) · nota/documento interno vazando ao cliente · arquivo malicioso com tipo falso · URL de arquivo reaproveitável (60 s, 404 uniforme) · convite reutilizável ou de outro e-mail · usuário desativado com sessão aberta · escalada por função de gestão · fórmulas em CSV · corpo truncado no proxy (limite elevado) · política de Storage ambígua (`objects.name`).

## Fora do escopo
ERP; emissão fiscal; cobrança e gateway; assinatura certificada; chat omnichannel; WhatsApp automático; CRM comercial; RAG; entrevista de onboarding.
