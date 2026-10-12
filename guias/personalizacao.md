# Personalizar um sistema para a empresa do cliente

Tudo abaixo acontece no **seu** clone, no **seu** Supabase e no **seu** repositório. Peça ao Claude Code ou Codex tarefas pequenas e peça sempre para rodar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

| Quero mudar | Onde | Cuidado |
|---|---|---|
| Nome do sistema e menu | `lib/system.config.ts` | — |
| Logo e cores | pelo painel (Configurações → identidade) ou `public/brand/` | use imagens que você tem direito de usar |
| Etapas do funil, origens, motivos, equipes | pelo painel do sistema | não precisa de código |
| Um campo a mais (texto, número, data) | coluna `custom` (jsonb) da tabela + formulário/lista na interface | para filtrar ou somar nesse campo, crie coluna própria numa **migração nova** |
| Uma regra nova (ex.: desconto máximo) | migração nova (gatilho/constraint) + teste em `supabase/tests/` | nunca afrouxe o RLS |
| Um indicador novo | função SQL nova + card/gráfico + linha em `docs/METRICS.md` | some dinheiro em centavos; trate divisão por zero |
| Textos e idioma | componentes em `components/` e páginas em `app/` | — |

## Regras que não mudam
1. **Nunca edite migrações já aplicadas**; crie uma nova.
2. **Não desative RLS** nem use `service_role` no navegador.
3. Toda tabela nova leva `organization_id` e políticas de RLS, com teste de acesso entre organizações.
4. Atualize `MEMORY.md` e `docs/FEATURES.md` ao terminar; teste antes de entregar.
5. Dados reais do cliente ficam só no seu ambiente; revise [LGPD](../docs/LGPD_GUIDE.md).

## Roteiro com o Claude Code / Codex
1. «Leia o AGENTS.md, o MEMORY.md e docs/DATA_MODEL.md e me explique o sistema.»
2. «A empresa é [segmento]. Liste o que precisa mudar e o que posso manter.»
3. Execute uma mudança por vez, com teste, e faça commit.
