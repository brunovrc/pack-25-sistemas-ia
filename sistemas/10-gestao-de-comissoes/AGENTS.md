# AGENTS — Gestão de Comissões

Sistema 10 do Pack 25 Sistemas IA (gestao-de-comissoes). O status real vive em MEMORY.md.

## Regras perenes
- Esta pasta é autossuficiente: nada importa de fora dela, sem workspace:*, sem citar outros sistemas.
- Ler MEMORY.md antes de trabalhar; atualizar ao concluir marcos, só com fatos comprovados.
- Toda tabela de negócio tem organization_id + RLS (nunca desabilitar); toda mutação passa por RPC `cm_*` e valida sessão, papel e entrada (Zod) no servidor.
- **Dinheiro em centavos inteiros, nunca float.** Calculado ≠ aprovado ≠ pago. Lançamento é imutável: corrija com estorno/ajuste.
- Sem folha de pagamento, encargos trabalhistas ou pagamento bancário: pagamento é apenas registro.
- Nunca commitar segredos; service-role key só no servidor, jamais com prefixo NEXT_PUBLIC_.
- Dados pessoais mínimos; sem PII em logs; sem dados reais de cliente em seed (nomes fictícios, `@demo.exemplo`).
- Não declarar pronto sem evidência (comando + resultado). Se algo não foi executado, escrever NÃO EXECUTADO.

## Comandos
pnpm install --frozen-lockfile · pnpm lint · pnpm typecheck · pnpm test · pnpm build · pnpm test:db · pnpm test:concurrency · pnpm test:mutation · pnpm test:e2e
(E2E: app compilado na porta 3124, `supabase db reset` antes, um arquivo por vez — ver docs/DEPLOYMENT.md.)

## Mapa
`lib/commissions/engine` (motor puro) · `lib/commissions/*` (fatos, execução, ações, PDF, CSV) · `components/cm` · `app/(app)/*` (rotas em português) · `supabase/migrations/20271001*` · `supabase/tests` · `scripts/seed` · `.agents/skills/*`.

## Definição de pronto (resumo)
Migrações em banco limpo, seed reproduzível, teste RLS A/B negando acesso cruzado, fluxos críticos em Playwright,
mobile e desktop revisados, licenças e segredos verificados, instalação isolada validada, docs e MEMORY.md atualizados.
