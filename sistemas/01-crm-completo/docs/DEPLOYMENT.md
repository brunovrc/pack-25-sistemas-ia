# DEPLOYMENT — CRM Completo

Tudo é seu: seu projeto Supabase, seu repositório, sua hospedagem. Nada é enviado ao autor do Pack.

## Pré-requisitos
Node 22+, pnpm, Docker (só para o Supabase local), conta Supabase (região **São Paulo** para dados pessoais) e uma hospedagem Node (ex.: Vercel).

## Variáveis (`.env.local`, nunca no git)
| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave publishable/anon (segura no navegador, limitada pelo RLS) |

O app **não usa** `service_role`. Não a coloque em variável alguma.

## Banco
1. Local: `supabase start` e `supabase db reset` (aplica migrações e `seed.sql` com dados fictícios).
2. Produção: `supabase link --project-ref <ref>` e `supabase db push`. **Não** aplique `seed.sql` em produção (ele cria usuários de demonstração).
3. No Supabase: ative confirmação de e-mail, senha mínima de 12, TOTP (verificação em duas etapas), configure **SMTP próprio**, e cadastre a URL do app em Redirect URLs. Modelos de e-mail em `supabase/templates`.
4. Teste de banco: `pnpm test:db` (exige Supabase local rodando).

## Aplicação
`pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → `pnpm start`.
E2E: `pnpm test:e2e` (precisa do Supabase local, com Mailpit, e do app rodando; veja `playwright.config.ts`).

## Demonstração local
Usuários do seed (senha local `DemoLocal#2026`): `dono@`, `gerente@`, `vendedor1@`, `vendedor2@` `demo.exemplo`. O proprietário precisa cadastrar a verificação em duas etapas no primeiro acesso.

## Backup, restauração e rollback
- Ative backups automáticos no Supabase e **teste a restauração** antes de usar dados reais.
- Rollback de código: reimplante a tag anterior. Migrações são só para frente: para desfazer uma, escreva uma migração nova.
- Antes de cada atualização, leia o `CHANGELOG` e faça backup.
