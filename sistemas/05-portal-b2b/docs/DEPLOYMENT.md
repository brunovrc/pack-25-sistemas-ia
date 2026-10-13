# DEPLOYMENT — Portal de Clientes B2B

Tudo é seu: seu projeto Supabase, seu repositório, sua hospedagem. Nada é enviado ao autor do Pack.

## Pré-requisitos
Node 22+, pnpm, Docker (só para o Supabase local), conta Supabase (região **São Paulo** para dados pessoais) e hospedagem Node (ex.: Vercel).

## Variáveis (`.env.local`, nunca no git)
| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave publishable/anon (segura no navegador, limitada pelo RLS) |

O app **não usa** `service_role`. Não a coloque em variável alguma. (O script `scripts/seed-files.mjs` usa a chave do Supabase **local**, só na sua máquina, e recusa qualquer URL que não seja local.)

## Banco e Storage
1. Local: `supabase start` (o Storage precisa estar habilitado: `[storage] enabled = true` no `config.toml`) e `supabase db reset` (migrações + `seed.sql` fictício). Em seguida, `SUPABASE_SERVICE_ROLE_KEY=<do supabase status> node scripts/seed-files.mjs` envia os arquivos de demonstração.
2. Produção: `supabase link --project-ref <ref>` e `supabase db push`. **Não** aplique `seed.sql` em produção (cria usuários de demonstração). A migração cria o bucket privado `portal-documents` e as políticas; confira em *Storage → Policies*.
3. No Supabase: confirmação de e-mail ligada, senha mínima de 12, TOTP, **SMTP próprio** e a URL do app em Redirect URLs. Modelos em `supabase/templates`.
4. **Agende a rotina de avisos** (ative a extensão `pg_cron` em *Database → Extensions*): `select cron.schedule('pt-refresh', '*/15 * * * *', 'select private.pt_refresh_all()');`. Ela gera os avisos de prazo próximo/vencido e publica comunicados agendados para **todas** as organizações; roda como dono do banco (a API não a executa) e é idempotente. Sem o agendamento, a rotina roda ao abrir o painel da equipe (gestão).

## Aplicação
`pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → `pnpm start`. A porta padrão do E2E é a do `site_url` do `config.toml` (3123): `E2E_BASE_URL=http://localhost:3123 pnpm test:e2e`. Refaça o `build` antes do E2E depois de mudar o código.
**Hospedagem e corpo da requisição:** envios de até 50 MB passam pelo proxy do app; confirme que sua hospedagem aceita corpos desse tamanho (algumas plataformas serverless limitam a 4,5 MB — nesse caso use um host Node, ou ajuste `doc_max_mb` para o limite da plataforma).
**Windows:** use um caminho curto para a pasta (caminho longo quebra o Vitest/Vite).

## Dados de demonstração
Senha local única `DemoLocal#2026`, todos `@demo.exemplo`:
- Equipe da «Agência Horizonte Digital»: `dono@` (proprietário; cadastra a verificação em duas etapas no primeiro acesso), `gerente@`, `colaborador1@`, `colaborador2@`, `leitor@`.
- Empresas clientes: `alfa.admin@`, `alfa.usuario@`, `beta.admin@`, `beta.usuario@`, `gama.admin@`.

As datas são relativas ao dia em que o seed foi aplicado. Para regerar: `node scripts/gen-seed.mjs`. Em implantação real, remova a organização de demonstração.

## Primeiro uso real
Crie sua conta e a organização (ative o MFA) → **Configurações do portal** (nome, cores, contato, fuso, expediente, SLA, categorias) → **Clientes** → cadastre a primeira empresa → convide o administrador dela → ele convida os colegas → comece a abrir solicitações.

## Rotina sugerida
Acompanhar *Solicitações atrasadas* e *Sem responsável* no painel; publicar relatórios mensais como **Entregas**; revisar a trilha de acessos de documentos sensíveis; revogar convites pendentes antigos.

## LGPD e operação
- Quem implanta é o controlador. Informe aos usuários das empresas clientes quais dados são tratados e para quê; a trilha de acessos a documentos é parte da transparência.
- Usuários desativados e empresas arquivadas perdem o acesso imediatamente (os dados são mantidos para auditoria até a sua política de retenção).
- Pedidos de titulares: página «Privacidade (LGPD)» do Core. Exportações ficam na auditoria.
- **Antivírus**: o envio não varre malware (veja `docs/DOCUMENTS.md`).

## Backup, restauração e rollback
Ative backups automáticos no Supabase (banco **e** Storage) e **teste a restauração** antes de usar dados reais. Rollback de código: reimplante a tag anterior. Migrações são só para frente: para desfazer, escreva uma migração nova. Históricos (comentários, situação, trilha de acessos, auditoria) são imutáveis por desenho.
