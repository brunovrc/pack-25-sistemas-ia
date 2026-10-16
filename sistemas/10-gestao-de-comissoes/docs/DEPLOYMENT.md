# DEPLOYMENT — Gestão de Comissões

Tudo é seu: seu projeto Supabase, seu repositório, sua hospedagem. Nada é enviado ao autor do Pack.

## Pré-requisitos
Node 22+, pnpm 12, Docker (Supabase local e `pnpm test:db`), conta Supabase com região **São Paulo** (dados pessoais), hospedagem Node (ex.: Vercel).

## Variáveis (`.env.local`, nunca no git)
| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave publishable/anon (segura no navegador, limitada pelo RLS) |

O app **não usa** `service_role`. Não a coloque em variável alguma.

## Banco
1. **Local**: `supabase start` e `supabase db reset` (migrações + `seed.sql` fictício). Portas 587xx (`project_id = pack25-gestao-de-comissoes`).
2. **Produção**: `supabase link --project-ref <ref>` e `supabase db push`. **Não** aplique `seed.sql` (cria usuários e vendas fictícios).
3. **Autenticação**: confirmação de e-mail ligada, senha mínima de 12, **TOTP (MFA) habilitado** (as RPCs de escrita exigem a 2ª etapa), SMTP próprio, URL do app em Redirect URLs.
4. **Storage**: o bucket privado `statements` é criado pela migração `000960`; confira que continua **privado**.
5. **Backup e restauração**: backups diários do Supabase (PITR em plano pago). O livro de comissões é histórico imutável — restaure o banco inteiro, nunca "linhas".
6. **Reversão**: migrações só para frente; para voltar, restaure o backup. Versões de plano e lançamentos são imutáveis; corrigir é publicar nova versão / lançar ajuste.

## Aplicação
`pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → `pnpm start`.

## Primeiro uso em produção
1. Entrar como administrador (ativar o 2º fator). 2. Configurações: fuso, política de saldo negativo, segregação de funções. 3. Cadastrar equipes, vendedores, produtos. 4. Criar o plano, publicar a versão e vincular ao vendedor. 5. Importar/registrar vendas, confirmar, processar o cálculo. 6. Aprovar, abrir o período, preparar, fechar, registrar pagamentos.

## Testes locais
- Unitários: `pnpm test` · SQL: `pnpm test:db` · concorrência: `pnpm test:concurrency` · mutação: `pnpm test:mutation`.
- **E2E**: `pnpm test:e2e` usa o Supabase local e o app **compilado** (`pnpm build && pnpm start -p 3124`). Copie URLs/chaves de `supabase status` para `.env.e2e` (`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_BASE_URL`). Rode **um arquivo por vez**, reiniciando o app entre eles (limitador de login em memória) e **depois de `supabase db reset`** (os fluxos alteram dados).
- Consistência do seed: `E2E_SUPABASE_URL=… E2E_SUPABASE_ANON_KEY=… pnpm vitest run tests/unit/seed-consistency.test.ts`. Regerar o seed: `node scripts/generate-seed.mjs`.

## Dados de demonstração
Senha local única `DemoLocal#2026`, todos `@demo.exemplo`, empresa «NovaSales (dados fictícios)»: `admin@`, `gestor@`, `gestor2@`, `financeiro@`, `vend1@`…`vend4@`, `consulta@`.

## Checklist de produção
- [ ] Região Brasil; backups ligados; MFA ligado; SMTP próprio; Redirect URLs.
- [ ] `seed.sql` **não** aplicado; nenhuma chave `service_role` em variável de ambiente.
- [ ] Bucket `statements` privado.
- [ ] Configurações revisadas (fuso, segregação de funções, política de saldo negativo).
- [ ] Revisar o aviso de privacidade com seu jurídico (controlador = quem implanta; dados: nome do vendedor e remuneração variável).
