# Primeiros passos

> Nenhum sistema está disponível ainda; este guia descreve o caminho que cada sistema validado seguirá. Confira o status em `catalogo/sistemas.json`.

## Em 5 passos

1. **Escolha o sistema** que vai implantar na empresa do seu cliente e abra o repositório dele (ex.: `pack25-01-crm-comercial`).
2. **Copie o link de clone:** no GitHub, botão verde **Code** → copie o endereço HTTPS.
3. **Clone na pasta do seu projeto:** no VS Code, abra a pasta onde quer trabalhar, abra o terminal e rode:
   ```bash
   git clone <link-copiado> nome-do-projeto-do-cliente
   cd nome-do-projeto-do-cliente
   ```
4. **Abra a pasta no VS Code** e inicie o **Claude Code** ou o **Codex** nela. Diga: "leia o AGENTS.md e o MEMORY.md e me explique o estado do projeto".
5. **Adapte para a empresa:** nome, cores, campos, regras e textos, sempre pedindo ao agente tarefas pequenas e que ele rode os testes.

## Antes de começar a trabalhar com dados de um cliente (importante)

- **Crie o seu próprio repositório PRIVADO para o projeto do cliente** e desligue o vínculo com o repositório original, para não enviar nada para ele por engano:
  ```bash
  git remote remove origin
  git remote add origin <link-do-SEU-repositório-privado>
  ```
- **Nunca publique dados do cliente nem chaves** (`.env.local`, senhas, planilhas, CPF, e-mails). Repositórios públicos são vistos por qualquer pessoa. O `.gitignore` já ignora `.env*`, mas a atenção é sua.
- **Dados reais só no seu ambiente próprio.** Use os dados de demonstração para estudar.

## Para rodar o sistema
1. Crie um projeto **Supabase** seu, de preferência na região do Brasil. Nunca compartilhe a chave `service_role`.
2. `cp .env.example .env.local` e preencha. Esse arquivo nunca vai ao git.
3. Aplique as migrações de `supabase/migrations` no seu projeto.
4. `pnpm install --frozen-lockfile` e `pnpm dev`.
5. Antes de entregar ao cliente: `pnpm lint typecheck test build`, revise a [LGPD](../docs/LGPD_GUIDE.md) e o [checklist de segurança](../docs/SECURITY_STANDARD.md) §13, e teste backup e restauração.

## Atualizações
Os links das aulas apontam para uma **versão fixa (tag)**. Correções de segurança saem em versões novas e são avisadas por e-mail; veja o `CHANGELOG` do sistema antes de atualizar.
