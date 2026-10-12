# CORE_WEB — Núcleo web (autenticação, organização, privacidade)

App Next.js 16 (App Router) + TypeScript 6.0 strict + Tailwind 4 em `core/web`, sobre as migrações de `core/supabase`. É a fonte que cada sistema herda (ADR-004).

## O que existe e foi verificado
Cadastro, login, logout, recuperação e redefinição de senha · MFA (TOTP) obrigatório para owner/admin · criação de organização · troca de organização · equipe (papéis e remoção) · configurações white-label (nome e cor) · auditoria · solicitações de titulares (LGPD) · painel com números calculados do banco.
**Ainda não existe:** convite de novas pessoas por e-mail (próximo marco), upload de logo (exige Storage), limitador de taxa distribuído.

## Segurança implementada (e onde está o teste)
| Controle | Onde | Teste |
|---|---|---|
| CSP com nonce por requisição, sem `unsafe-inline`; `connect-src 'self'` | `proxy.ts`, `lib/security/csp.ts` | `security.spec.ts` (0 violações no navegador) + unitário |
| Cabeçalhos: HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy; sem `X-Powered-By` | `next.config.ts` | `security.spec.ts` |
| Autorização no servidor em toda página/ação (sessão + MFA + papel + organização) | `lib/auth/session.ts` | `security.spec.ts` (leitor recebe 404 real e sem conteúdo) |
| Cookie de organização adulterado é ignorado (revalidado contra as associações reais) | `lib/auth/session.ts` | `security.spec.ts` |
| MFA exigido **também no banco** (políticas RESTRICTIVE por `aal2`) | `migrations/20261013…` | `30_mfa_enforcement.sql` + `security.spec.ts` (REST direto barrado) |
| Anti open-redirect | `lib/security/redirect.ts` | unitário + e2e |
| Login e cadastro sem enumeração de usuário | `app/(auth)/actions.ts` | `security.spec.ts` |
| Entrada validada com Zod no servidor; senha ≥ 12 caracteres | `lib/validation/*` | unitário |
| Logs estruturados com mascaramento de PII | `lib/log.ts` | unitário |
| Auditoria imutável, só nomes de colunas | migração do Core | `10_rls_isolation.sql` + conferência direta no banco |
| Sem `service_role` no app | `lib/env.ts` | revisão + `check-no-secrets` |
| Cadeia de suprimentos: lockfile, scripts de instalação bloqueados, quarentena de versões novas | `pnpm-workspace.yaml` | `pnpm install --frozen-lockfile` |

## Configuração obrigatória do Supabase em PRODUÇÃO
Os padrões do Supabase **não** atendem este padrão de segurança. Verifique no painel (Authentication):
1. **MFA → TOTP:** habilitar *enroll* e *verify* (vem desligado por padrão no `config.toml` gerado).
2. **Senha:** comprimento mínimo **12** (o padrão local é 6) e **proteção contra senhas vazadas** quando disponível.
3. **E-mail:** **confirmação de e-mail ligada** (o ambiente local a desliga só para testes) e *Secure password change* ligado.
4. **URLs:** `Site URL` e `Redirect URLs` apenas com o domínio real. Modelos de e-mail devem apontar para `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup|recovery`.
5. **SMTP próprio** para produção; **região do projeto no Brasil (São Paulo)**; backups automáticos e teste de restauração.
6. **Rate limits** de autenticação do Supabase mantidos ligados. O limitador do app é por instância e é só defesa em profundidade.
7. Variáveis do app: somente `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publishable) e `NEXT_PUBLIC_APP_URL` (https). Nunca `service_role`.

## Rodar localmente
```bash
# Supabase local (CLI oficial 2.120.0; confira o checksum do release antes de usar)
cd core && supabase start -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
cd web && cp .env.example .env.local   # preencha com as chaves exibidas pelo supabase start
pnpm install --frozen-lockfile && pnpm dev
# verificações
pnpm lint && pnpm typecheck && pnpm test && pnpm build
E2E_BASE_URL=... E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... pnpm test:e2e
```
As portas locais do Supabase são `583xx` (em `core/supabase/config.toml`) para não colidir com outros projetos.

## Lições registradas
- Um `loading.tsx` no nível de `(app)` faz páginas restritas responderem HTTP 200 (streaming). Evitar; ver `app/(app)/README.md`.
- O Supabase concede privilégios amplos por padrão a tabelas novas: cada migração deve revogar e conceder explicitamente (o teste `20_profiles.sql` falha se esquecer).
- `Date.now()` direto em Server Components viola a regra de pureza do React; use `lib/time.ts`.
