# MEMORY — DASHBOARD DE MARKETING
Atualizado em: 2026-10-11 | Versão: 0.1.0 | Estado: PLANEJADO

## Missão do sistema
Resultados de campanhas dispersos em várias plataformas. Público: Gestores de tráfego e marketing. Valor: Visão consolidada de custo, conversão, ROAS e CPL por importação CSV.

## Stack e caminhos-chave
Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + Supabase (Auth, Storage, RLS). Pastas: app/, components/, lib/, supabase/migrations/, tests/, docs/.
Comandos do sistema: ainda não existem (app não criado).

## Escopo contratado do MVP
Campanhas; Mídia; Custo; Conversões; ROAS e CPL; Importação CSV.
Fora do escopo: APIs nativas obrigatórias das plataformas de mídia.

## Implementado e verificado
- Nada. Apenas a estrutura de pastas e a documentação inicial existem.

## Em implementação
- Nenhuma tarefa iniciada.

## Pendências e riscos
- Risco LGPD: baixo (dados: nenhum pessoal previsto).
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
