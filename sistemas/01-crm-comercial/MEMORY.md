# MEMORY — CRM COMERCIAL
Atualizado em: 2026-10-11 | Versão: 0.1.0 | Estado: PLANEJADO

## Missão do sistema
Leads em planilhas e WhatsApp, sem funil nem histórico de relacionamento. Público: Equipes comerciais de pequenas e médias empresas B2B. Valor: Funil de vendas único com histórico, tarefas e indicadores calculados do banco.

## Stack e caminhos-chave
Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + Supabase (Auth, Storage, RLS). Pastas: app/, components/, lib/, supabase/migrations/, tests/, docs/.
Comandos do sistema: ainda não existem (app não criado).

## Escopo contratado do MVP
Leads; Contatos; Contas; Oportunidades em pipeline Kanban; Tarefas e lembretes; Histórico de interações; Relatórios e KPIs; Importação e exportação CSV; IA opcional para rascunho de textos.
Fora do escopo: WhatsApp automatizado; Disparo em massa; Integração fiscal.

## Implementado e verificado
- Nada. Apenas a estrutura de pastas e a documentação inicial existem.

## Em implementação
- Nenhuma tarefa iniciada.

## Pendências e riscos
- Risco LGPD: médio (dados: nome, e-mail, telefone, cargo, histórico de contato).
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
