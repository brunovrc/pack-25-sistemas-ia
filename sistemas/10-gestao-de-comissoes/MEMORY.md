# MEMORY — GESTÃO DE COMISSÕES
Atualizado em: 2026-10-16 | Versão: 0.1.0 | Estado: VALIDADO

## Missão do sistema
Cálculo manual de comissão gera erro e disputa. Público: empresas com vendedores comissionados. Valor: planos de comissão por faixa com estornos e fechamentos rastreáveis (cada centavo com memória de cálculo; histórico imutável; calculado ≠ aprovado ≠ pago).

## Stack e caminhos-chave
Next 16.4 (App Router) + React 19 + TypeScript strict + Tailwind 4 + Supabase (Auth, Storage, RLS). Layout do Core na raiz (sem `src/`), rotas em português.
- `lib/commissions/engine/` motor puro (decimal.js, centavos inteiros); `lib/commissions/*` fatos, execução, ações, PDF (pdf-lib), CSV (papaparse), importação.
- `supabase/migrations/20271001*` (escrita só por RPCs `cm_*` SECURITY DEFINER; RLS somente leitura); `supabase/tests/{50,60,61,70}_cm_*.sql`.
- `scripts/{test-db,test-concurrency,mutation-check,generate-seed}.mjs`, `scripts/seed/*`.
- Docs em `docs/` (ARCHITECTURE, COMMISSION_ENGINE, CALCULATION_RULES, TIER_RULES, ELIGIBILITY_RULES, SPLIT_RULES, REVERSALS, CLOSING_RULES, METRICS, PERMISSIONS, DATABASE, DATA_MODEL, DECISIONS, DEPLOYMENT, OPEN_SOURCE_AUDIT, PLANO_IMPLEMENTACAO, FEATURES). Skills em `.agents/skills/*`.
- Comandos: `pnpm install --frozen-lockfile` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:db` · `pnpm test:concurrency` · `pnpm test:mutation` · `pnpm test:e2e`.
- Portas locais: Supabase 587xx; app de E2E 3124 (`site_url` do `config.toml`). Seed: `node scripts/generate-seed.mjs` → `supabase/seed.sql` (NovaSales; senha `DemoLocal#2026`; usuários `admin|gestor|gestor2|financeiro|vend1..4|consulta@demo.exemplo`).

## Escopo contratado do MVP
Planos de comissão; vendedores; vendas; faixas; estornos; fechamento de período. Fora do escopo: folha de pagamento; pagamento automático (pagamento é só registro).

## Implementado e verificado (2026-10-16)
- lint e typecheck sem erros; build OK; **157 testes unitários** (15 casos de referência, regras, propriedades, limites, livro, metas, E/S de CSV, seed consistente com o motor).
- Banco (`pnpm test:db`): Core + domínio (50, 30 blocos), travas de negócio com mensagem (60, 8 blocos), metas e notificações (61, 8 blocos), segurança/RLS (70, 9 blocos) — todos PASS.
- Concorrência real (`pnpm test:concurrency`): 8 sessões na mesma venda geram 1 lançamento e 1 memória de cálculo; 1 só vencedor em aprovação, confirmação, fechamento, referência de recebimento e pagamento; perdedores recebem a mensagem da regra.
- Mutação (`pnpm test:mutation`): **159/159 mutações reprovadas** (motor TS, E/S, banco, concorrência). Dois mutantes equivalentes foram removidos com justificativa em comentário no script (ON CONFLICT redundante com `unique_violation`; «pagamento já estornado» duplicado no trigger).
- E2E Playwright (35): core-flow 5, email-flows 3, security 5, cm-demo 5, cm-flow 9, cm-import-security 4, cm-responsive 4 (375/768/1440 px sem rolagem horizontal; título, h1, landmark, nomes acessíveis).
- Bugs reais achados por testes: caixas de um grupo marcadas juntas (aprovava 5 lançamentos em vez de 1); render-prop Server→Client; texto `sr-only` de cabeçalho de tabela fora do contêiner de rolagem estourava a largura no celular (wrappers `relative`); rótulo do papel do Core ausente no cabeçalho (spec de segurança do Core).
- Dependências removidas por não usadas: date-fns, react-hook-form, @hookform/resolvers.

## Em implementação
- Nada em andamento neste sistema.

## Pendências e riscos
- Segregação de funções vem DESLIGADA por padrão (configurável); recomendada quando há mais de uma pessoa no financeiro.
- Risco LGPD médio (nome do vendedor, remuneração variável): sem CPF/dados bancários; arquivos importados não são guardados; seed 100% fictício.
- Mutantes de concorrência dependem de rodar sem carga paralela.

## Decisões relevantes
- Ver `docs/DECISIONS.md` (D-C1…D-C20): motor puro em TS e banco que valida/grava; alvo × livro; plano fixado por participante na confirmação; versão publicada imutável; meio-para-cima por componente; faixas (de, até]; maior resto; bônus nunca estornado sozinho; sem XLSX, sem fila, planos não importáveis.

## Testes e deploy
- Último lint/typecheck/unit/db/concorrência/mutação/e2e/build: executados em 2026-10-16 (resultados acima).
- Deploy: ver `docs/DEPLOYMENT.md` (Supabase São Paulo, seed NÃO aplicado em produção).

## Armadilhas
- E2E exige banco recém-semeado (`supabase db reset`) e reinício do app entre arquivos (limitador de login em memória); `next build` também tipa `tests/`.
- Heredoc de bash perde barras/aspas: gerar arquivos com Write; `String.replace` com `$$` corrompe SQL (usar função de substituição).
- Mutante sobrevivente = teste faltando OU defesa em profundidade (então quebrar todas as camadas ou documentar a equivalência).

## Próxima tarefa recomendada
1. Reconciliar eventuais divergências com a versão final do prompt mestre, se o usuário enviar ajustes.
2. Sistema 11 (agendamento-online), quando o prompt mestre chegar.

## Referências
- docs/FEATURES.md; docs/DATA_MODEL.md; docs/DEPLOYMENT.md; docs/OPEN_SOURCE_AUDIT.md
