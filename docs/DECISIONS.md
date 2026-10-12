# DECISIONS — Registro de decisões (ADR)

Formato: contexto → decisão → consequência. Decisões novas entram no fim; nunca reescreva a história, supersede.

## ADR-001 — Repositório-fonte em subpasta; prompt mestre fora do repositório
- **Contexto:** o prompt mestre e materiais de engenharia privados não podem chegar ao comprador (seção 1).
- **Decisão:** o repositório `pack-25-sistemas-ia` vive em `Pack 25 Sistemas IA/pack-25-sistemas-ia/`. O prompt mestre fica na pasta-mãe, fora do git.
- **Consequência:** nada de engenharia privada é versionado por acidente.

## ADR-002 — Distribuição em dois níveis: hub único + espelho por sistema
- **Contexto:** o produto é UM repositório com 25 pastas (prompt mestre) e o comprador deve poder baixar/clonar só o sistema que quer, com repositório de nome próprio. O GitHub não clona subpasta.
- **Decisão:** (1) `pack-25-sistemas-ia` é a fonte e o catálogo; (2) cada sistema validado é publicado automaticamente como repositório espelho `pack25-NN-slug` por `scripts/export-system.mjs` + workflow `publish-mirrors`; (3) sparse checkout do hub segue documentado como alternativa.
- **Consequência:** o espelho é somente-leitura (alterações nascem no hub). A exportação recusa sistemas `PLANEJADO` e reprova pacote com dependência cruzada ou segredo. Detalhes em `docs/DISTRIBUTION.md`.

## ADR-003 — Core construído do zero, reutilizando padrões permissivos
- **Contexto:** os starters avaliados (Atomic CRM, Kiranism, Next SaaS Starter) não trazem multiempresa com RLS por organização e carregam acoplamentos (billing, auth de terceiros).
- **Decisão:** Core próprio em `core/`, usando shadcn/ui e TanStack Table como dependências, e starters apenas como estudo.
- **Consequência:** mais trabalho inicial, porém segurança verificável e zero dívida de licença. Se um trecho de terceiros for copiado, entra em `THIRD_PARTY_NOTICES.md`.

## ADR-004 — `core/` é a fonte da verdade; cada pasta recebe uma cópia sincronizada
- **Contexto:** cada sistema deve ser autossuficiente (sem `workspace:*`), mas uma correção de segurança no Core precisa chegar às 25 pastas.
- **Decisão:** `core/` contém migrações e código-base; um script `sync-core` (a criar quando o sistema 01 iniciar) copia o Core para cada pasta com cabeçalho de origem e versão. O CI falha se a cópia divergir.
- **Consequência:** correções se propagam por um comando e ficam auditáveis.

## ADR-005 — Postgres: RLS sem FORCE, funções SECURITY DEFINER com `search_path` vazio, grants por coluna
- **Decisão:** RLS ligada em toda tabela de `public`; sem `FORCE` (o dono precisa executar as funções de autorização e auditoria); `SECURITY DEFINER` sempre com `set search_path = ''`; `UPDATE` concedido por coluna; `anon` sem privilégios; criação de organização só via `create_organization` (atômica).
- **Auditoria:** `audit_log` é append-only (trigger bloqueia UPDATE/DELETE/TRUNCATE até para o dono) e grava **apenas nomes de colunas alteradas, nunca valores** (minimização LGPD).
- **Consequência:** o teste `10_rls_isolation.sql` impõe essas regras e roda no CI.

## ADR-006 — Ferramentas de engenharia em Node ESM, sem dependências
- **Decisão:** scripts em `scripts/*.mjs` usando só a biblioteca padrão do Node (>=22). Reduz superfície de cadeia de suprimentos nas ferramentas que tocam todo o repositório.

## ADR-007 — Segredos
- **Decisão:** sem segredos no git; `.env*` ignorado exceto `.env.example`; `scripts/check-no-secrets.mjs` como rede local; ativar **GitHub secret scanning + push protection** no hub e nos espelhos. Um scanner dedicado (ex.: gitleaks) entra no CI do Core web, fixado por versão e checksum.
- **Consequência:** o scanner local é heurístico e não substitui os recursos da plataforma.

## ADR-008 — Skills externas só após leitura e fixação
- **Decisão:** ver `docs/REFERENCE_AUDIT.md` §3. Preferência por skills internas originais em `.claude/skills/`.

## ADR-009 — Versões do stack
- **Decisão:** versões estáveis consultadas em 2026-10-11 estão em `REFERENCE_AUDIT.md` §4. A fixação final (inclusive TypeScript 7 vs. anterior) ocorre no Core web, com lockfile versionado e teste de compatibilidade.
