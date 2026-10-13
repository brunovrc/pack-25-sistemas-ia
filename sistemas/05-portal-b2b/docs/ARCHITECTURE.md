# ARCHITECTURE — Portal de Clientes B2B

```
 navegador ──► proxy.ts (CSP com nonce, renova sessão) ──► Next.js (App Router, Server Components)
                                                            │   requireContext / requirePortalContext
                                                            │   (sessão + MFA + conta ativa + papel, em TODA página/ação/rota)
                                                            ▼
                                            Supabase (anon key + sessão do usuário; nunca service_role)
                                            ├─ Postgres: RLS + funções pt_* (SECURITY DEFINER) ← regras de verdade
                                            ├─ Auth: senha, e-mail confirmado, TOTP
                                            └─ Storage: bucket privado portal-documents (URL assinada de 60 s)
```

## Duas áreas, um banco
| Área | Rotas | Quem | Contexto |
|---|---|---|---|
| Painel da prestadora | `app/(app)/…` (`/dashboard`, `/clientes`, `/solicitacoes`, `/entregas`, `/documentos`, `/comunicados`, `/relatorios`, `/convites`, `/configuracoes`, …) | equipe | `requireContext()` → `organization_members` |
| Portal do cliente | `app/portal/…` | usuários das empresas | `requirePortalContext()` → `client_members` ativos |
| Convite | `app/convite/[token]` | qualquer pessoa (página pública, sem consulta ao banco) | aceite exige login |
| API de arquivos | `app/api/documents` (POST envio) e `app/api/documents/[id]` (GET) | equipe e clientes | `apiActor()` |

`lib/auth/session.ts` (do sistema, em `.core-overrides`) estende o Core: quem **só** é usuário de cliente é levado a `/portal` (nunca ao painel nem a criar organização); a empresa ativa vem do cookie `pack25_client`, mas é **sempre** revalidada contra os vínculos reais (membro ativo de empresa ativa e não arquivada).

## Camadas do código
- `lib/portal/data.ts` — leituras (servem equipe e cliente; **o RLS decide**, nunca um filtro daqui).
- `lib/portal/actions.ts` — Server Actions: validam entrada com o **mesmo esquema Zod** do navegador (`validation.ts`), confirmam o papel e chamam as funções `pt_*`. Erros do banco viram mensagens úteis sem vazar nomes de tabela/coluna.
- `lib/portal/{format,filters,workflow,csv,uploads,dashboard,chart-rows,reports}.ts` — lógica pura e testável (72 testes unitários).
- `components/portal/*` — formulários (React Hook Form + Zod), tabelas (TanStack Table), gráficos (Recharts, **só no navegador**), navegação.
- `components/app/*` e `components/ui/*` — kit do Core.

## Segurança de aplicação
- **CSP estrita com nonce**, sem estilo em linha: gráficos carregam só no cliente; o tema (white-label) é uma folha de estilo do próprio domínio (`/portal-theme.css?c=…&s=…`, cores validadas como `#RRGGBB`).
- Limite de taxa em login, cadastro, aceite de convite e envio/download de arquivos (em memória, por instância — a proteção principal do login é a do Supabase Auth).
- CSV com fórmulas neutralizadas; nomes de arquivo sanitizados; redirecionamentos só para caminhos internos.
- Logs estruturados **sem dados pessoais** (campos sensíveis mascarados).

## Por que as regras estão no banco
O banco é a única barreira que nenhum caminho (interface, API REST direta, script) contorna. A interface esconde o que o papel não pode usar; os testes E2E atacam a API com tokens de clientes para provar que o banco, e não a tela, recusa.

## Limites conhecidos
- Limitador de taxa por instância (não compartilhado entre réplicas).
- `pt_refresh` (avisos de prazo e comunicados agendados) roda ao abrir o painel (gestão); em produção, agende `private.pt_refresh_all()` com pg_cron (veja `DEPLOYMENT.md`).
- Sem e-mail transacional de notificação: avisos são internos.
