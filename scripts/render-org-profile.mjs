#!/usr/bin/env node
// Gera o README da vitrine da organização (repositório ".github", pasta profile/) a partir do catálogo.
// Uso: node scripts/render-org-profile.mjs [--org NOME] > profile/README.md
// Só cria link para o repositório do sistema quando o status é VALIDADO (repositório publicado).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const org = args.includes('--org') ? args[args.indexOf('--org') + 1] : 'pack-25-sistemas-ia';
const catalog = JSON.parse(readFileSync(join(root, 'catalogo', 'sistemas.json'), 'utf8'));

const ready = catalog.systems.filter((s) => s.status === 'VALIDADO').length;
const rows = catalog.systems
  .map((s) => {
    const name = s.status === 'VALIDADO' ? `[**${s.name}**](https://github.com/${org}/${s.repo_name})` : `**${s.name}**`;
    const status = s.status === 'VALIDADO' ? 'Disponível' : 'Em desenvolvimento';
    return `| ${s.id} | ${name} | ${s.value_proposition} | ${s.category} | ${status} |`;
  })
  .join('\n');

const out = `# Pack 25 Sistemas IA

25 sistemas MVP para pequenas e médias empresas, feitos para você **clonar, personalizar com Claude Code ou Codex** e implantar para o seu cliente. Cada sistema é um repositório independente, com banco de dados, testes e documentação próprios.

> **Estado atual:** ${ready} de 25 sistemas disponíveis. Os demais estão em desenvolvimento e **só ganham repositório depois de passar nos testes de qualidade e segurança**. Este material reduz tempo de desenvolvimento; não promete renda nem resultado comercial.

## Como usar um sistema
1. Escolha o sistema na lista abaixo e abra o repositório dele.
2. Clique em **Code** e copie o link de clone.
3. No VS Code, abra a pasta do seu projeto e rode \`git clone <link> nome-do-projeto\`.
4. Abra a pasta com **Claude Code** ou **Codex** e peça: "leia o AGENTS.md e o MEMORY.md e explique o projeto".
5. Adapte para a empresa do seu cliente, em tarefas pequenas, rodando os testes.

**Importante:** crie um repositório **privado seu** para o projeto do cliente e nunca publique chaves (\`.env\`) nem dados pessoais do cliente. O guia completo, com a parte de privacidade (LGPD), vem em cada repositório.

## Os 25 sistemas

| # | Sistema | O que faz | Categoria | Estado |
|---|---|---|---|---|
${rows}

## Padrão de qualidade
Isolamento de dados por empresa testado, autenticação com verificação em duas etapas para administradores, auditoria imutável, validação no servidor, guia de LGPD e checklist de segurança em cada sistema.

Cada sistema é MVP e **não** inclui emissão fiscal, assinatura eletrônica certificada, pagamento integrado, disparo em massa nem automação de WhatsApp.
`;
process.stdout.write(out);
