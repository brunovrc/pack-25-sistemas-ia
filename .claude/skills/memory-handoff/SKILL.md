---
name: memory-handoff
description: Atualiza o MEMORY.md do sistema ou da raiz ao concluir um marco e prepara a passagem para a próxima sessão. Use ao terminar uma tarefa substantiva ou ao encerrar a sessão.
---

# memory-handoff

1. Abrir o `MEMORY.md` alvo (modelo da seção 5 do prompt mestre; resumo ativo <= 120 linhas).
2. Mover para "Implementado e verificado" somente o que tem evidência (comando + resultado ou arquivo de teste).
3. Registrar decisões com data e link para o ADR; pendências com prioridade e impacto.
4. Em "Testes e deploy" escrever o resultado real ou **NÃO EXECUTADO**.
5. Definir UMA próxima tarefa verificável.
6. Mover histórico longo para `docs/CHANGELOG_INTERNAL.md`.
Nunca afirmar teste executado que não rodou.
