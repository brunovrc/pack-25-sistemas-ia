# DISTRIBUTION — Hub único e repositório por sistema

## Modelo

```text
pack-25-sistemas-ia            (hub: catálogo, guias, 25 pastas — fonte da verdade)
 ├─ sistemas/01-crm-comercial  ──export──▶  crm-completo   (repositório espelho)
 ├─ sistemas/02-propostas-...  ──export──▶  gerador-de-propostas
 └─ ... (25)
```

- **Hub:** onde se desenvolve. O comprador pode obter só uma pasta com sparse checkout.
- **Espelho:** repositório com nome próprio (`<slug>` (ex.: `crm-completo`), campo `repo_name` do catálogo), gerado a partir da pasta. O comprador faz `git clone` normal e recebe só aquele sistema.
- Alterações **nunca** nascem no espelho; ele é sobrescrito pelo hub.

## Opção A — clonar o repositório do sistema (recomendada)

```bash
git clone https://github.com/<ORG>/crm-completo.git
cd crm-completo
```

## Opção B — só a pasta, a partir do hub (sparse checkout)

```bash
git clone --filter=blob:none --no-checkout https://github.com/<ORG>/pack-25-sistemas-ia.git
cd pack-25-sistemas-ia
git sparse-checkout set --cone sistemas/01-crm-comercial
git checkout main
```

Repositório privado exige autenticação (`gh auth login` ou token com permissão de leitura). `git clone` de subpasta **não existe** no GitHub; não use comandos que prometam isso.

## Como o espelho é gerado

1. `node scripts/export-system.mjs <slug> --out _export/<repo_name>` copia a pasta, **exclui** `.env*` (menos `.env.example`), `node_modules`, builds e `docs/internal`, e acrescenta `LICENSE.md`, `THIRD_PARTY_NOTICES.md`, `SECURITY.md`.
2. Reprova se achar `workspace:`/`file:../`, referência a outra pasta/sistema, segredo, ou arquivo obrigatório ausente.
3. Grava `EXPORT_MANIFEST.json` (commit de origem, versão do catálogo) e `CHECKSUMS.sha256`.
4. O workflow `publish-mirrors` (manual, com aprovação de ambiente) envia o resultado ao repositório espelho.

Um sistema só é exportável quando `status` ≠ `PLANEJADO`; só é **publicável** quando `VALIDADO` (gates da seção 11 do prompt mestre).

## Modelo de venda: plataforma de cursos (Kiwify, Hotmart etc.)

Definido pelo titular em 2026-10-12: o comprador adquire o **curso** na plataforma e recebe por e-mail as aulas com os **links dos repositórios**. A plataforma entrega o e-mail; ela **não** cria acesso ao GitHub.

Fluxo do aluno (definido pelo titular em 2026-10-12): aula na área de membros → link do repositório → escolhe o sistema → copia o link de clone → cola no VS Code com Claude/Codex → clona na pasta do projeto → adapta para a empresa do cliente. Por isso **cada sistema tem o próprio repositório com link de clone próprio** (`<slug>` (ex.: `crm-completo`)) e README/AGENTS/MEMORY que funcionam sozinhos.

Consequências:
- **Repositório público = qualquer pessoa com o link acessa**, comprando ou não. O que protege o produto passa a ser a licença (`LICENSE.md`), não o acesso técnico. O titular aceitou esse modelo (hub público desde 2026-10-12).
- **Repositório privado não funciona só com link**: o comprador precisaria de convite individual no GitHub. Isso exigiria pedir o usuário do GitHub na compra e automatizar o convite (webhook da plataforma → API do GitHub), com atrito e fila de suporte.

Regras de engenharia que valem em qualquer escolha:
1. **Decisão do titular (2026-10-12):** todo sistema `VALIDADO` vira repositório público próprio; não há ZIP. O aluno copia o link e pede ao Claude Code ou Codex para clonar.
2. Links nas aulas devem apontar para **tags/releases** (versão fixa), não para `main`, para que uma correção de segurança não quebre quem está no meio da aula. Atualizações são avisadas por e-mail.
3. Sem segredos nem dados reais em nenhum repositório, público ou privado (verificado por `check-no-secrets` e pelo secret scanning do GitHub).

## Bloqueios que dependem do titular (não resolvidos pelo agente)

1. Criar a organização/conta GitHub e os repositórios `<slug>` (ex.: `crm-completo`) (privados) e `pack-25-sistemas-ia`.
2. Gerar um token **fine-grained** com `Contents: write` restrito aos repositórios espelho e guardá-lo como secret `MIRROR_PUSH_TOKEN` no ambiente protegido `mirror-publish` do hub.
3. Modelo de acesso do comprador: **definido** (plataforma de cursos + repositório público por sistema).
4. Ativar secret scanning, push protection, Dependabot alerts e proteção de branch nos repositórios.
5. Sem e-mail, nome ou canal de suporte nos repositórios: o suporte é da plataforma de cursos.
