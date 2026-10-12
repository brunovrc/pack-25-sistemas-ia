# DISTRIBUTION — Hub único e repositório por sistema

## Modelo

```text
pack-25-sistemas-ia            (hub: catálogo, guias, 25 pastas — fonte da verdade)
 ├─ sistemas/01-crm-comercial  ──export──▶  pack25-01-crm-comercial   (repositório espelho)
 ├─ sistemas/02-propostas-...  ──export──▶  pack25-02-propostas-comerciais
 └─ ... (25)
```

- **Hub:** onde se desenvolve. O comprador pode obter só uma pasta com sparse checkout.
- **Espelho:** repositório com nome próprio (`pack25-NN-slug`, campo `repo_name` do catálogo), gerado a partir da pasta. O comprador faz `git clone` normal e recebe só aquele sistema.
- Alterações **nunca** nascem no espelho; ele é sobrescrito pelo hub.

## Opção A — clonar o repositório do sistema (recomendada)

```bash
git clone https://github.com/<ORG>/pack25-01-crm-comercial.git
cd pack25-01-crm-comercial
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

## Bloqueios que dependem do titular (não resolvidos pelo agente)

1. Criar a organização/conta GitHub e os repositórios `pack25-NN-slug` (privados) e `pack-25-sistemas-ia`.
2. Gerar um token **fine-grained** com `Contents: write` restrito aos repositórios espelho e guardá-lo como secret `MIRROR_PUSH_TOKEN` no ambiente protegido `mirror-publish` do hub.
3. Definir o modelo de acesso do comprador. Convidar cada comprador como colaborador de leitura é simples, mas escala mal (custo de assentos e 25 repositórios por comprador). Alternativas: *release assets* assinados com checksum, ou repositórios por compra. **Decisão comercial do titular.**
4. Ativar secret scanning, push protection, Dependabot alerts e proteção de branch nos repositórios.
5. Definir canal de suporte e e-mail de segurança (ver `SECURITY.md`).
