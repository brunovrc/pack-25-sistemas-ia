# OPEN_SOURCE_AUDIT — Portal de Clientes B2B

Consulta de 2026-10-13 (API do GitHub e `npm view`). «Incorporado» = código copiado para este repositório. Dependências instaladas aparecem em `THIRD_PARTY_NOTICES.md` do Pack.

## Matriz de referências

| Projeto | Licença | Atividade (último push) | Tecnologia | Decisão |
|---|---|---|---|---|
| Refine | MIT | 2026-09-10 | React, framework de painéis | **Só referência** de organização de painéis; nada copiado (o Core já tem a base) |
| Payload CMS | MIT | 2026-10-13 | Next.js, CMS/painel | **Só referência** de papéis e controle de acesso por coleção; nada copiado |
| React Admin | MIT | 2026-10-11 | React, painéis CRUD | **Só referência** de listas/filtros; nada copiado |
| Appsmith | Apache-2.0 | 2026-10-13 | Java/React, low-code | **Não utilizado** (plataforma low-code; o produto precisa de regras no banco) |
| Atomic CRM (marmelab) | MIT | 2026-10-13 | React + Supabase | **Só referência** de UX (lista, ficha, notas); nada copiado |
| Papermark | **NOASSERTION** no GitHub (núcleo AGPL-3.0 + pasta de licença comercial) | 2026-08-28 | Next.js, compartilhamento de documentos | **Só inspiração** de links e trilha de visualização. **Nenhum código incorporado** |
| Documenso | **AGPL-3.0** | 2026-10-13 | Next.js, assinatura de documentos | **Só inspiração** (assinatura certificada está fora do escopo). **Nenhum código incorporado** |
| Zammad | **AGPL-3.0** | 2026-10-13 | Ruby, helpdesk | **Só inspiração** de fluxo de tickets. Nada incorporado |
| FreeScout | **AGPL-3.0** | 2026-10-13 | PHP, helpdesk | **Não utilizado** |
| Chatwoot | **NOASSERTION** (MIT com pasta «enterprise» proprietária) | 2026-10-13 | Ruby, atendimento omnichannel | **Não utilizado** (chat omnichannel está fora do escopo) |
| Peppermint | **NOASSERTION**; **repositório arquivado** (último push 2025-09-21) | — | Next.js, tickets | **Não utilizado** (sem manutenção) |
| shadcn/ui | MIT | 2026-10-12 | Radix + Tailwind | **Não adotado** (o Core já traz kit próprio acessível; D-12) |
| TanStack Table | MIT | 2026-10-12 | React | **Usar** (tabelas ordenáveis) |
| Recharts | MIT | 2026-10-13 | React | **Usar** (gráficos, só no navegador) |
| react-hook-form + resolvers | MIT | 2026-10-13 | React | **Usar** (formulários com o mesmo esquema Zod do servidor) |
| Zod | MIT | 2026-10-12 | TypeScript | **Usar** (validação compartilhada) |
| supabase-js / @supabase/ssr | MIT | 2026-10-13 | TypeScript | **Usar** (Auth, Postgres, Storage) |

Licença de cada pacote conferida com `npm view <pacote> license`; todas MIT.

## Riscos observados
- **Licenças copyleft de rede (AGPL)** em ferramentas de documentos e tickets (Documenso, Zammad, FreeScout, núcleo do Papermark): incompatíveis com a distribuição pretendida. **Nada foi incorporado**; as semelhanças de fluxo (trilha de acessos, ciclo de ticket) são ideias gerais, implementadas do zero em SQL.
- **NOASSERTION** no GitHub costuma indicar licença mista (parte aberta, parte comercial): tratado como **não reutilizável** até leitura arquivo a arquivo.
- **Plataformas completas** (Appsmith, Chatwoot) trazem escopo muito maior (low-code, omnichannel) e dependências que o comprador não precisa operar.
- **Projeto arquivado** (Peppermint): sem correções de segurança.
- **Estilos em linha** de bibliotecas de gráfico/tabela: bloqueados pela CSP estrita; gráficos carregam só no navegador.

## Dependências adicionadas por este sistema (sobre o Core)
| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| recharts | 3.10.1 | MIT | gráficos do painel |
| react-hook-form + @hookform/resolvers | 7.89.0 / 5.9.1 | MIT | formulários |
| @tanstack/react-table | 8.21.3 | MIT | tabelas |

Arquivos de terceiros incorporados a este repositório: **nenhum**. Os arquivos de demonstração (PDF, PNG, DOCX, XLSX) são gerados por `scripts/demo-files.mjs` em código próprio, sem bibliotecas.
