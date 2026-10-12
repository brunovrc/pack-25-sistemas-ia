#!/usr/bin/env node
// Valida catalogo/sistemas.json contra as regras do prompt mestre (seções 9 e 11).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'catalogo', 'sistemas.json'), 'utf8'));

const STATUS = new Set(catalog.status_values);
const COMPLEXITY = new Set(['baixa', 'média', 'alta']);
const LGPD = new Set(['baixo', 'médio', 'alto']);
const CATEGORIES = new Set(['Comercial', 'Gestão', 'Operações', 'Marketing', 'Verticais']);
const REQUIRED = ['id', 'slug', 'directory', 'repo_name', 'name', 'category', 'audience', 'pain',
  'value_proposition', 'mvp_features', 'exclusions', 'kpis', 'complexity',
  'implementation_price_brl_illustrative', 'lgpd_risk', 'personal_data', 'status'];

const errors = [];
const err = (m) => errors.push(m);
const systems = catalog.systems ?? [];

if (systems.length !== 25) err(`Esperado 25 sistemas, encontrado ${systems.length}`);

const seen = { id: new Set(), slug: new Set(), repo: new Set() };
systems.forEach((s, i) => {
  const tag = `[${s.id ?? i}]`;
  for (const k of REQUIRED) if (s[k] === undefined || s[k] === '') err(`${tag} campo ausente: ${k}`);
  const expectedId = String(i + 1).padStart(2, '0');
  if (s.id !== expectedId) err(`${tag} id deveria ser ${expectedId}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug ?? '')) err(`${tag} slug inválido`);
  if (s.directory !== `sistemas/${s.id}-${s.slug}`) err(`${tag} directory inconsistente`);
  if (s.repo_name !== `pack25-${s.id}-${s.slug}`) err(`${tag} repo_name inconsistente`);
  for (const [set, key] of [[seen.id, 'id'], [seen.slug, 'slug'], [seen.repo, 'repo_name']]) {
    if (set.has(s[key])) err(`${tag} ${key} duplicado: ${s[key]}`);
    set.add(s[key]);
  }
  if (!STATUS.has(s.status)) err(`${tag} status inválido: ${s.status}`);
  if (!COMPLEXITY.has(s.complexity)) err(`${tag} complexidade inválida`);
  if (!LGPD.has(s.lgpd_risk)) err(`${tag} lgpd_risk inválido`);
  if (!CATEGORIES.has(s.category)) err(`${tag} categoria inválida`);
  const p = s.implementation_price_brl_illustrative;
  if (!p || !(p.min > 0) || !(p.max >= p.min)) err(`${tag} faixa de preço inválida`);
  for (const k of ['mvp_features', 'exclusions', 'kpis']) {
    if (!Array.isArray(s[k]) || s[k].length === 0) err(`${tag} ${k} deve ser lista não vazia`);
  }
  // Gate honesto: nada fora de PLANEJADO sem a base mínima existir.
  if (s.status !== 'PLANEJADO') {
    for (const f of ['package.json', 'pnpm-lock.yaml', 'MEMORY.md', 'docs/FEATURES.md']) {
      if (!existsSync(join(root, s.directory, f))) err(`${tag} status ${s.status} exige ${f}`);
    }
  }
  if (s.status === 'VALIDADO') {
    const feat = join(root, s.directory, 'docs', 'FEATURES.md');
    if (existsSync(feat) && /\b(TODO|IN_PROGRESS)\b/.test(readFileSync(feat, 'utf8'))) {
      err(`${tag} VALIDADO mas docs/FEATURES.md ainda tem TODO/IN_PROGRESS`);
    }
  }
});

if (errors.length) {
  console.error(`catálogo INVÁLIDO (${errors.length} problema(s)):`);
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
const counts = systems.reduce((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
console.log(`catálogo OK: ${systems.length} sistemas`, counts);
