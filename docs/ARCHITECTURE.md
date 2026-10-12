# ARCHITECTURE — Visão do repositório-fonte

## Estrutura

```text
pack-25-sistemas-ia/
  README.md LICENSE.md THIRD_PARTY_NOTICES.md SECURITY.md
  AGENTS.md CLAUDE.md MEMORY.md
  catalogo/sistemas.json            # catálogo congelado (25), fonte do status real
  core/supabase/                    # Core de banco: migrações + testes RLS (fonte da verdade)
  sistemas/NN-slug/                 # 25 pastas autossuficientes (cada uma com AGENTS/CLAUDE/MEMORY)
  scripts/                          # ferramentas de engenharia (Node ESM, sem dependências)
  guias/                            # guias para o comprador
  docs/                             # auditoria, ADRs, segurança, LGPD, distribuição
  .claude/skills/                   # skills internas originais (engenharia; não vão ao comprador)
  .github/workflows/                # CI e publicação dos espelhos
```

## Fluxo de entrega

```text
core/ ──sync-core (a criar)──▶ sistemas/NN-slug ──export-system──▶ pacote ──publish-mirrors──▶ pack25-NN-slug
          ▲                          │ gates (seção 11)                     │ checksums + manifesto
          └── correção de segurança propaga para as 25 pastas ──────────────┘
```

## Modelo de dados do Core (implementado e testado)

- `organizations` · `organization_members` (papéis `owner > admin > manager > member > viewer`) · `organization_settings` (white-label) · `audit_log` (append-only) · `privacy_requests` (direitos do titular).
- Criação de organização atômica via `create_organization()` (cria org + owner + configurações; exige `auth.uid()`).
- Autorização por funções `private.is_member` / `private.has_role` usadas em políticas RLS; fronteira de confiança = banco.

## Fronteiras de confiança

| Zona | Confiável? | Controle |
|---|---|---|
| Navegador | Não | Validação e autorização repetidas no servidor; sem `service_role` |
| Server Actions / Route Handlers | Parcial | Sessão + papel + propriedade + Zod em toda entrada |
| Postgres (RLS) | Sim (última barreira) | RLS em toda tabela, grants mínimos, auditoria imutável |
| Provedor de IA / terceiros | Não | Allowlist de hosts, dados mascarados, saída tratada como não confiável |

## Estado
Core de **banco** implementado e verificado (ver `MEMORY.md`). Core **web** (Next.js, Supabase SSR, UX base) é o próximo marco.
