# Personalizando com Claude Code

1. Abra a pasta do **sistema** (não a raiz inteira) no VS Code e inicie o Claude Code.
2. Ele lê `CLAUDE.md`, que importa `AGENTS.md`. Peça: "leia o MEMORY.md e me diga o estado atual".
3. Trabalhe em tarefas pequenas e verificáveis, por exemplo: "adicione o campo X à entidade Y com migração, validação Zod e teste RLS".
4. Exija evidência: "rode lint, typecheck e testes e mostre o resultado".
5. Ao fim de cada marco, peça para atualizar o `MEMORY.md` com o que foi comprovado.

**Cuidados de segurança:** não cole chaves no chat; revise migrações antes de aplicar; nunca peça para desativar RLS "só para testar"; confira toda dependência nova (licença e origem) antes de aceitar.
