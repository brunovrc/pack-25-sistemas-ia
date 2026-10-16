# DECISIONS — Gestão de Comissões

**D-C1 Motor puro em TypeScript.** O cálculo vive em `lib/commissions/engine/` sem I/O; o banco **não calcula** comissão, apenas **valida e grava** (`cm_post_calculation`). Motivo: testabilidade (casos de referência, propriedades, mutação) e uma única fonte da regra. O banco repete as verificações de integridade (plano fixado, regra do plano, participante, original do estorno, teto do bônus).

**D-C2 Avaliador de condições próprio.** Gramática fechada (AND/OR/NOT, 10 fatos, 9 operadores) em vez de `json-rules-engine`: síncrono, determinístico, sem dependência transitiva e sem possibilidade de código arbitrário.

**D-C3 Alvo × livro.** Idempotência e correção por diferença, não por "reprocessar apagando". Reprocessar nunca altera o passado.

**D-C4 Plano fixado por participante na confirmação da venda.** `sale_participants.plan_version_id` é gravado pelo servidor ao confirmar. Mudar taxa depois cria **nova versão**; vendas antigas continuam no plano com que foram confirmadas. O banco recusa lançamento com outra versão.

**D-C5 Versão publicada é imutável; vigência retroativa proibida para plano já usado.** Corrigir = nova versão.

**D-C6 Arredondamento meio-para-cima, uma vez por componente**; em faixas, sobre o acumulado (lançamento = diferença entre acumulados arredondados). Documentado em `CALCULATION_RULES.md` e na memória de cada cálculo.

**D-C7 Faixas (de, até] com teto inclusivo**, modos `marginal` e `reached` explícitos; valores em centavos.

**D-C8 Rateio por maior resto**, com ordem de desempate fixa (principal, depois `seller_id`).

**D-C9 Bônus nunca é estornado sozinho.** Devolução que derruba o atingimento gera pendência para ajuste manual auditável.

**D-C10 Calculado ≠ aprovado ≠ pago.** Três estados e três responsabilidades. Pagamento é só **registro** (o sistema não movimenta dinheiro, não gera remessa bancária, não faz folha).

**D-C11 Escrita só por RPC `cm_*` (SECURITY DEFINER)**; RLS apenas de leitura; triggers de imutabilidade com variáveis de sessão. Evita que uma política de INSERT/UPDATE mal escrita abra o livro.

**D-C12 Segregação de funções configurável**, desligada por padrão para não travar empresas pequenas; "ninguém aprova a própria comissão" é sempre ativo.

**D-C13 Tabelas renderizadas no servidor**, sem TanStack Table: filtros, ordenação e paginação por URL. Menos JavaScript no cliente e links compartilháveis.

**D-C14 Sem XLSX.** Importação e exportação em CSV (`papaparse`), com neutralização de fórmulas na saída e recusa de binários na entrada. Reduz superfície de ataque (macros, zip bomb).

**D-C15 Planos não são importáveis.** Importam-se vendedores, clientes, produtos, vendas e recebimentos; plano e regra mudam o dinheiro de todos e passam pela tela com validação e publicação.

**D-C16 Sem fila (pg-boss).** O cálculo é síncrono, por venda ou por período, dentro de uma ação do servidor; reprocessamento em lote é limitado em tamanho.

**D-C17 PDF no servidor com `pdf-lib`**, sem navegador headless; versões imutáveis em bucket privado.

**D-C18 Importação não guarda o arquivo.** Só hash, contagens e erros por linha (minimização LGPD). Duplicidade nunca é silenciosa: linha repetida é rejeitada com motivo.

**D-C19 Seed gerado pelo próprio motor.** `scripts/seed/build.seed.ts` roda o motor e emite `seed.sql` com ids simbólicos; `tests/unit/seed-consistency.test.ts` prova que recalcular o seed gera **zero** lançamentos novos. Nomes e e-mails fictícios (`@demo.exemplo`).

**D-C20 Gestor vê apenas as equipes que gere**, resolvido no banco (`private.cm_can_see_seller`), com histórico de equipe por data (`cm_team_at`).
