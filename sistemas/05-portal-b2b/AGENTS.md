# AGENTS — Portal de Clientes B2B

Sistema 05 do Pack 25 Sistemas IA (portal-b2b). O status real vive em MEMORY.md.

## Regras perenes
- Esta pasta é autossuficiente: nada importa de fora dela, sem workspace:*, sem citar outros sistemas.
- Ler MEMORY.md antes de trabalhar; atualizar ao concluir marcos, só com fatos comprovados.
- Toda tabela de negócio tem organization_id + RLS; toda mutação valida sessão, papel e entrada (Zod) no servidor e chama função `pt_*`.
- Nunca commitar segredos; o app não usa service-role (só o script local de seed de arquivos, que recusa URLs não locais); jamais com prefixo NEXT_PUBLIC_.
- Dados pessoais mínimos; sem PII em logs; sem dados reais de cliente em seed.
- Não declarar pronto sem evidência (comando + resultado). Se algo não foi executado, escrever NÃO EXECUTADO.

## Comandos
pnpm install --frozen-lockfile · pnpm lint · pnpm typecheck · pnpm test · pnpm build · pnpm test:db (Docker) · pnpm test:mutation · pnpm test:e2e (Supabase local + app **recompilado**, porta do `site_url` = 3123) · node scripts/gen-seed.mjs · node scripts/seed-files.mjs

## Regras do sistema
- O que importa mora no BANCO: transições, prazos, visibilidade, vínculos entre empresas, convites, arquivos, métricas. `lib/portal/workflow.ts` é só espelho da tela.
- Cliente NUNCA vê nota interna, observação interna, documento interno, entrega em rascunho ou dado de outra empresa. Qualquer mudança que toque isso precisa de teste SQL A/B, E2E de ataque via API e mutação.
- Usuário de cliente nunca entra em `organization_members`. Conta ativa do cliente (cookie) é sempre revalidada.
- Documento: bucket privado, caminho opaco, tipo pelos bytes, URL assinada de 60 s só depois de o banco autorizar e registrar; recusa = 404 uniforme.
- Convite: só o hash do token no banco; mensagem de erro uniforme; link mostrado uma vez.
- Datas de métricas e prazos usam o fuso do portal (`portal_settings.timezone`). SLA em horas úteis, sem feriados (limite documentado).
- CSP estrita: sem estilo em linha; gráficos só no navegador; tema do portal pela folha `/portal-theme.css`. CSV neutraliza fórmulas e só a gestão exporta (auditado).
- Mudou regra crítica de banco: rode `pnpm test:mutation` (todas devem morrer; adicione mutação nova se criar regra crítica).
- Cuidados: em JS, `String.replace` com `$$`/`$'` na substituição corrompe SQL (use Edit, sed ou função); em política de `storage.objects`, use `objects.name`; logins repetidos nos E2E esbarram no limitador (os helpers reaproveitam a sessão).

## Definição de pronto (resumo)
Migrações em banco limpo, seed reproduzível, teste RLS A/B negando acesso cruzado, fluxos críticos em Playwright, mobile e desktop revisados, licenças e segredos verificados, instalação isolada validada, docs e MEMORY.md atualizados.
