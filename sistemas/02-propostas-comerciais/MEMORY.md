# MEMORY — GERADOR DE PROPOSTAS
Atualizado em: 2026-10-11 | Versão: 0.1.0 | Estado: PLANEJADO

## Missão do sistema
Propostas montadas à mão, sem versões, sem controle de descontos e sem status. Público: Vendedores e prestadores de serviço que enviam orçamentos. Valor: Propostas padronizadas, versionadas e em PDF, com catálogo e aprovação de desconto.

## Stack e caminhos-chave
Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + Supabase (Auth, Storage, RLS). Pastas: app/, components/, lib/, supabase/migrations/, tests/, docs/.
Comandos do sistema: ainda não existem (app não criado).

## Escopo contratado do MVP
Catálogo de produtos e serviços; Preços; Clientes; Versões da proposta; Descontos com limite por perfil; Geração de PDF; Status da proposta.
Fora do escopo: Assinatura eletrônica certificada; Integração fiscal.

## Implementado e verificado
- Nada. Apenas a estrutura de pastas e a documentação inicial existem.

## Em implementação
- Nenhuma tarefa iniciada.

## Pendências e riscos
- Risco LGPD: médio (dados: nome, e-mail, telefone, endereço comercial).
- Aguardar o Core web (auth, organização, UX base) antes de iniciar este sistema.

## Decisões relevantes
- 2026-10-11 — Estrutura criada por scripts/generate-systems.mjs a partir do catálogo.

## Testes e deploy
- Último lint/typecheck/unit/e2e/build: NÃO EXECUTADO
- Ambiente de deploy: não configurado

## Próxima tarefa recomendada
1. Fazer a avaliação de referências deste sistema em docs/REFERENCES.md antes de qualquer código.

## Referências
- docs/FEATURES.md; docs/DATA_MODEL.md; docs/DEPLOYMENT.md
