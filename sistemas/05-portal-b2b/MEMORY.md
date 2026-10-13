# MEMORY — PORTAL DE CLIENTES B2B
Atualizado em: 2026-10-13 | Versão: 0.1.0 | Estado: VALIDADO

## Missão do sistema
Dar às empresas que atendem clientes corporativos um portal exclusivo para o cliente (solicitações, entregas, documentos privados, comunicados) e um painel para a equipe, com isolamento por empresa. Público: agências, consultorias, escritórios e prestadores recorrentes.

## Stack e caminhos-chave
Next.js 16 (App Router, `proxy.ts`) + TypeScript strict + Tailwind 4 + Supabase (Auth, Postgres/RLS, Storage). Raiz do Core (sem `src/`). Banco: `supabase/migrations` (4 do sistema: `pt_schema`, `pt_workflow`, `pt_content`, `pt_metrics`), testes SQL `supabase/tests/60–64`. Libs `lib/portal/*`; componentes `components/portal/*`; portal em `app/portal/*`; painel em `app/(app)/*`; arquivos em `app/api/documents`.
Comandos: `pnpm lint | typecheck | test | build | test:db | test:mutation | test:e2e`; `node scripts/gen-seed.mjs`; `node scripts/seed-files.mjs`. Porta do app em E2E: 3123 (`site_url` do Supabase local); stack 583xx.

## Escopo entregue
Prestadora × empresa cliente; papéis; convites com hash; solicitações com máquina de estados, prioridade, responsável, prazo (SLA em horas úteis/combinado/estimativa), comentários compartilhados × internos, reabertura; documentos privados com pastas, visibilidade, tipo real, URL assinada de 60 s e trilha; entregas; comunicados; notificações; painel (10 KPIs, 8 gráficos, alertas) para equipe e cliente; 5 relatórios CSV auditados; white-label; seed fictício (Agência Horizonte Digital; Alfa, Beta, Gama).
Fora do escopo: ERP, fiscal, cobrança/gateway, assinatura certificada, chat omnichannel, WhatsApp automático, CRM comercial, RAG, onboarding por entrevista.

## Implementado e verificado (evidência em docs/FEATURES.md)
- Lint e tipos limpos; 72 testes unitários; testes SQL 60–64 (+Core) verdes; 33/33 mutações reprovadas.
- 49 E2E verdes (Supabase local + build de produção): fluxo equipe × cliente, 14 cenários de ameaça (API, Storage, upload forjado, 15/21 MB), convites ponta a ponta, painel = banco, celular.

## Pendências e riscos
- Instalação isolada validada em 2026-10-13 (cópia exportada: install, lint, tipos, 72 unitários, build, test:db, 33/33 mutações, 47 E2E sem as capturas). CI do hub: jobs portal-db, portal-web e portal-e2e verdes.
- Sem antivírus no envio; sem feriados no SLA; sem e-mail transacional; limitador de taxa por instância.
- `pt_refresh` precisa ser agendado em produção (`private.pt_refresh_all()` via pg_cron); agendamento real não testado.
- Hospedagem serverless com limite de corpo pequeno exige ajustar `doc_max_mb` (docs/DEPLOYMENT.md).

## Decisões relevantes (docs/DECISIONS.md)
D-1 prestadora = organização do Core · D-2 regras no banco · D-3 colaborador vê por vínculo · D-5 SLA sem feriados · D-7 convite com hash · D-8 arquivos: URL assinada curta + trilha · D-9 envio por route handler (+ limite do proxy) · D-12 sem shadcn · D-15 menor privilégio por mutação.

## Armadilhas aprendidas
- `String.replace` em JS com `$$`/`$'` corrompe SQL; use Edit/sed/função.
- Em política de `storage.objects`, `name` dentro de subconsulta é a coluna da outra tabela: use `objects.name`.
- O proxy do Next trunca corpo > 10 MB: `experimental.proxyClientMaxBodySize`.
- O Storage precisa de `[storage] enabled = true` no `config.toml` local.
- Login repetido nos E2E esbarra no limitador (8/10 min): helpers reaproveitam a sessão. `Date.now()` em render viola o lint de pureza: use `lib/time`.
- `pt_user_labels.kind` é `staff|client`, não o papel.

## Próxima tarefa recomendada
Personalizar para o cliente (nome, cores, SLA, categorias); agendar `private.pt_refresh_all()`; avaliar antivírus no envio. Próximo do Pack: Sistema 06 — Gestão Financeira Empresarial.
