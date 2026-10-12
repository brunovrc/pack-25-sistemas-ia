#!/usr/bin/env node
// Sincroniza o Core (core/web + core/supabase) com a pasta de um sistema. ADR-004 e ADR-014.
// Uso: node scripts/sync-core.mjs <slug|all> [--check]
//  - Sem --check: copia/atualiza os arquivos gerenciados pelo Core e grava .core-manifest.json.
//  - Com --check: não escreve; falha (exit 1) se o sistema divergir do Core sem override declarado.
// O arquivo .core-overrides do sistema lista o que ele possui:
//    caminho ou glob  -> o sistema é dono; o sync cria se faltar e NUNCA sobrescreve
//    -caminho ou glob -> o sistema não quer este arquivo; o sync nunca o cria
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--'));
const check = args.includes('--check');
if (!key) { console.error('Uso: sync-core.mjs <slug|all> [--check]'); process.exit(2); }

const catalog = JSON.parse(readFileSync(join(root, 'catalogo', 'sistemas.json'), 'utf8'));
const targets = key === 'all' ? catalog.systems.filter((s) => s.status !== 'PLANEJADO') : catalog.systems.filter((s) => [s.slug, s.id, s.directory, `${s.id}-${s.slug}`].includes(key));
if (!targets.length) { console.error(`Sistema não encontrado: ${key}`); process.exit(2); }

const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results', 'playwright-report', 'coverage']);
const SKIP_FILE = (n) => (/^\.env(\..+)?$/.test(n) && n !== '.env.example') || n === 'next-env.d.ts' || n.endsWith('.tsbuildinfo') || n === '.DS_Store';
const SYSTEM_OWNED = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'MEMORY.md', 'docs/**', '.core-overrides', '.core-manifest.json', '**/.gitkeep'];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), base, out); continue; }
    if (SKIP_FILE(e.name)) continue;
    out.push(relative(base, join(dir, e.name)).replaceAll('\\', '/'));
  }
  return out;
}

/** Mapa destino -> { content } com tudo que o Core fornece a um sistema. */
function coreFiles(system) {
  const map = new Map();
  const add = (dest, abs, transform) => {
    let buf = readFileSync(abs);
    if (transform) buf = Buffer.from(transform(buf.toString('utf8')));
    map.set(dest, buf);
  };
  const web = join(root, 'core', 'web');
  for (const rel of walk(web)) add(rel, join(web, rel));
  const sb = join(root, 'core', 'supabase');
  for (const sub of ['migrations', 'templates', 'tests']) {
    if (!existsSync(join(sb, sub))) continue;
    for (const rel of walk(join(sb, sub))) add(`supabase/${sub}/${rel}`, join(sb, sub, rel));
  }
  add('supabase/config.toml', join(sb, 'config.toml'), (t) => t.replace(/^project_id = ".*"$/m, `project_id = "pack25-${system.slug}"`));
  add('scripts/test-db.mjs', join(root, 'scripts', 'test-core-db.mjs'));
  return map;
}

let failures = 0;
for (const system of targets) {
  const dir = join(root, system.directory);
  if (!existsSync(dir)) { console.error(`pasta ausente: ${system.directory}`); failures++; continue; }

  const overridesPath = join(dir, '.core-overrides');
  const lines = existsSync(overridesPath) ? readFileSync(overridesPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  const owned = lines.filter((l) => !l.startsWith('-')).map(globToRe);
  const excluded = lines.filter((l) => l.startsWith('-')).map((l) => globToRe(l.slice(1)));
  const ownedAlways = SYSTEM_OWNED.map(globToRe);
  const manifestPath = join(dir, '.core-manifest.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? {} : {};

  const files = coreFiles(system);
  const managed = {};
  const problems = [];
  let written = 0;

  for (const [rel, content] of files) {
    if (ownedAlways.some((r) => r.test(rel)) || excluded.some((r) => r.test(rel))) continue;
    const dest = join(dir, rel);
    const isOwned = owned.some((r) => r.test(rel));
    if (isOwned) {
      if (!existsSync(dest) && !check) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, content); written++; }
      continue; // o sistema é dono: nunca sobrescreve
    }
    managed[rel] = sha(content);
    const current = existsSync(dest) ? readFileSync(dest) : null;
    if (current && sha(current) === managed[rel]) continue;
    if (check) {
      problems.push(current ? (previous[rel] && sha(current) !== previous[rel] ? `${rel}: modificado no sistema sem override` : `${rel}: desatualizado em relação ao Core`) : `${rel}: ausente`);
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
      written++;
    }
  }

  // Arquivos que o Core removeu (e que o sistema não possui): removidos do sistema.
  for (const rel of Object.keys(previous)) {
    if (files.has(rel) || owned.some((r) => r.test(rel))) continue;
    if (check) problems.push(`${rel}: removido do Core, ainda presente no sistema`);
    else if (existsSync(join(dir, rel))) { rmSync(join(dir, rel)); written++; }
  }

  if (check) {
    if (!Object.keys(previous).length) problems.push('sem .core-manifest.json (rode o sync)');
    if (problems.length) { failures++; console.error(`${system.directory}: DIVERGENTE (${problems.length})`); problems.slice(0, 20).forEach((p) => console.error('  - ' + p)); }
    else console.log(`${system.directory}: em dia com o Core`);
  } else {
    const version = sha(Buffer.from(JSON.stringify(managed, Object.keys(managed).sort())));
    writeFileSync(manifestPath, JSON.stringify({ coreVersion: version, files: Object.fromEntries(Object.entries(managed).sort()) }, null, 2) + '\n');
    console.log(`${system.directory}: ${written} arquivo(s) escrito(s); ${Object.keys(managed).length} gerenciados pelo Core; versão ${version.slice(0, 12)}`);
  }
}
process.exit(failures ? 1 : 0);
