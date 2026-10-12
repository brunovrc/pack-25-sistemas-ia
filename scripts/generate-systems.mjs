#!/usr/bin/env node
// Gera a estrutura das 25 pastas a partir de catalogo/sistemas.json.
// Idempotente e NÃO destrutivo: nunca sobrescreve arquivo existente (use --force só em arquivos gerados).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const catalog = JSON.parse(readFileSync(join(root, 'catalogo', 'sistemas.json'), 'utf8'));
const TODAY = catalog.updated_at;

const SUBDIRS = ['app', 'components', 'lib', 'supabase/migrations', 'tests', 'public', 'docs'];
let created = 0;
let kept = 0;

function put(path, content) {
  if (existsSync(path) && !force) { kept++; return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : content + '\n');
  created++;
}
const bullets = (a) => a.map((x) => `- ${x}`).join('\n');

for (const s of catalog.systems) {
  const dir = join(root, s.directory);
  for (const d of SUBDIRS) put(join(dir, d, '.gitkeep'), '');

  put(join(dir, 'AGENTS.md'), `# AGENTS — ${s.name}

Sistema ${s.id} do Pack 25 Sistemas IA (${s.repo_name}). O status real vive em MEMORY.md.

## Regras perenes
- Esta pasta é autossuficiente: nada importa de fora dela, sem workspace:*, sem citar outros sistemas.
- Ler MEMORY.md antes de trabalhar; atualizar ao concluir marcos, só com fatos comprovados.
- Toda tabela de negócio tem organization_id + RLS; toda mutação valida sessão, papel e entrada (Zod) no servidor.
- Nunca commitar segredos; service-role key só no servidor, jamais com prefixo NEXT_PUBLIC_.
- Dados pessoais mínimos; sem PII em logs; sem dados reais de cliente em seed.
- Não declarar pronto sem evidência (comando + resultado). Se algo não foi executado, escrever NÃO EXECUTADO.

## Comandos (existirão quando o app for criado)
pnpm install --frozen-lockfile · pnpm lint · pnpm typecheck · pnpm test · pnpm build · pnpm test:e2e

## Definição de pronto (resumo)
Migrações em banco limpo, seed reproduzível, teste RLS A/B negando acesso cruzado, fluxos críticos em Playwright,
mobile e desktop revisados, licenças e segredos verificados, instalação isolada validada, docs e MEMORY.md atualizados.
`);

  put(join(dir, 'CLAUDE.md'), `# CLAUDE — ${s.name}

@AGENTS.md

Consulte MEMORY.md ao iniciar e atualize ao concluir uma tarefa substantiva. Leia somente os arquivos necessários.
`);

  put(join(dir, 'MEMORY.md'), `# MEMORY — ${s.name.toUpperCase()}
Atualizado em: ${TODAY} | Versão: 0.1.0 | Estado: ${s.status}

## Missão do sistema
${s.pain}. Público: ${s.audience}. Valor: ${s.value_proposition}.

## Stack e caminhos-chave
Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + Supabase (Auth, Storage, RLS). Pastas: app/, components/, lib/, supabase/migrations/, tests/, docs/.
Comandos do sistema: ainda não existem (app não criado).

## Escopo contratado do MVP
${s.mvp_features.join('; ')}.
Fora do escopo: ${s.exclusions.join('; ')}.

## Implementado e verificado
- Nada. Apenas a estrutura de pastas e a documentação inicial existem.

## Em implementação
- Nenhuma tarefa iniciada.

## Pendências e riscos
- Risco LGPD: ${s.lgpd_risk} (dados: ${s.personal_data.length ? s.personal_data.join(', ') : 'nenhum pessoal previsto'}).
- Aguardar o Core web (auth, organização, UX base) antes de iniciar este sistema.

## Decisões relevantes
- ${TODAY} — Estrutura criada por scripts/generate-systems.mjs a partir do catálogo.

## Testes e deploy
- Último lint/typecheck/unit/e2e/build: NÃO EXECUTADO
- Ambiente de deploy: não configurado

## Próxima tarefa recomendada
1. Fazer a avaliação de referências deste sistema em docs/REFERENCES.md antes de qualquer código.

## Referências
- docs/FEATURES.md; docs/DATA_MODEL.md; docs/DEPLOYMENT.md
`);

  put(join(dir, 'README.md'), `# ${s.name}

> **Status: ${s.status}.** ${s.status === 'PLANEJADO' ? 'Este sistema ainda NÃO está implementado nem disponível para uso.' : 'Veja MEMORY.md para o estado verificado.'}

**Público:** ${s.audience}
**Problema:** ${s.pain}
**Proposta:** ${s.value_proposition}

## Escopo do MVP
${bullets(s.mvp_features)}

## Fora do escopo
${bullets(s.exclusions)}

## Indicadores
${bullets(s.kpis)}

## Privacidade (LGPD)
Risco estimado: **${s.lgpd_risk}**. Dados pessoais tratados: ${s.personal_data.length ? s.personal_data.join(', ') : 'nenhum previsto'}.
Quem implanta o sistema é o controlador dos dados; este software não substitui assessoria jurídica.

> Valor de implantação ilustrativo e sem promessa de resultado: veja catalogo/sistemas.json.
`);

  put(join(dir, '.env.example'), `# ${s.name} — variáveis de ambiente. Copie para .env.local e preencha. NUNCA versione .env.local.
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Somente servidor. Jamais usar prefixo NEXT_PUBLIC_ nesta variável.
SUPABASE_SERVICE_ROLE_KEY=

# IA opcional (o sistema deve funcionar sem estas variáveis)
AI_PROVIDER=
AI_API_KEY=
AI_MONTHLY_BUDGET_BRL=
`);

  put(join(dir, 'docs', 'FEATURES.md'), `# FEATURES — ${s.name}
Status permitido: TODO, IN_PROGRESS, VERIFIED (com evidência: arquivo/teste).

| Fluxo | Status | Evidência |
|---|---|---|
${s.mvp_features.map((f) => `| ${f} | TODO | — |`).join('\n')}
`);

  put(join(dir, 'docs', 'DATA_MODEL.md'), `# DATA_MODEL — ${s.name}
Ainda não modelado. Regras: organization_id em toda entidade de negócio, RLS ativa, histórico imutável onde houver saldo/valor.
Dados pessoais previstos: ${s.personal_data.length ? s.personal_data.join(', ') : 'nenhum'}.
`);

  put(join(dir, 'docs', 'DEPLOYMENT.md'), `# DEPLOYMENT — ${s.name}
Ainda não configurado. Quando existir: pré-requisitos, variáveis, migrações, seed, backup/restauração e rollback.
Hospedagem recomendada: região do Brasil (ex.: São Paulo) para dados pessoais.
`);
}

console.log(`gerador: ${created} arquivo(s) criado(s), ${kept} já existente(s) preservado(s)`);
