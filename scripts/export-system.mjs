#!/usr/bin/env node
// Gera o pacote individual de UM sistema (base dos repositórios espelho por sistema).
// Uso: node scripts/export-system.mjs <id|slug|pasta|repo_name> [--out DIR] [--allow-planned]
// Recusa exportar sistema que não passou do status PLANEJADO (sem --allow-planned).
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDir } from './check-no-secrets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--'));
const flag = (n) => args.includes(n);
const outArg = args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : null;

if (!key) { console.error('Uso: export-system.mjs <id|slug|pasta|repo_name> [--out DIR] [--allow-planned]'); process.exit(2); }

const catalog = JSON.parse(readFileSync(join(root, 'catalogo', 'sistemas.json'), 'utf8'));
const sys = catalog.systems.find((s) => [s.id, s.slug, s.directory, s.repo_name, `${s.id}-${s.slug}`].includes(key));
if (!sys) { console.error(`Sistema não encontrado: ${key}`); process.exit(2); }

if (sys.status === 'PLANEJADO' && !flag('--allow-planned')) {
  console.error(`RECUSADO: ${sys.repo_name} está PLANEJADO. Exportar para publicação só após os gates (use --allow-planned apenas para teste local).`);
  process.exit(3);
}

const src = join(root, sys.directory);
const out = resolve(outArg ?? join(root, '_export', sys.repo_name));
if (!existsSync(src)) { console.error(`Pasta ausente: ${sys.directory}`); process.exit(2); }
if (out === src || out.startsWith(src + sep)) { console.error('Destino não pode ficar dentro do sistema.'); process.exit(2); }

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'coverage', 'playwright-report', 'test-results', 'internal']);
// Cópia recursiva manual (cpSync com filtro derrubou o Node 24 no Windows; assim é previsível e filtrável por entrada).
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    const name = e.name;
    if (e.isDirectory() ? EXCLUDE_DIRS.has(name) || name === '.temp' || name === '.branches' : (/^.env(..+)?$/.test(name) && name !== '.env.example') || name.endsWith('.log') || name.endsWith('.tsbuildinfo') || name === 'next-env.d.ts') continue;
    if (e.isSymbolicLink()) continue;
    e.isDirectory() ? copyTree(join(from, name), join(to, name)) : copyFileSync(join(from, name), join(to, name));
  }
}
copyTree(src, out);

// Arquivos legais e de segurança do repositório-fonte acompanham o pacote.
for (const f of ['LICENSE.md', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md']) {
  if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f));
}

// ---- Verificações de autossuficiência ----
const problems = [];
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.sql', '.yml', '.yaml', '.toml', '.css']);
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const full = join(d, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!TEXT_EXT.has(extname(e.name))) continue;
    const rel = relative(out, full).replaceAll('\\', '/');
    const text = readFileSync(full, 'utf8');
    if (e.name === 'package.json' && /"(?:workspace:|file:\.\.|link:\.\.)/.test(text)) problems.push(`${rel}: dependência workspace:/file:../link:../`);
    if (/['"`]\.\.\/\.\.\/(?:core|sistemas|scripts)\b/.test(text)) problems.push(`${rel}: referência a pasta fora do sistema`);
    if (/\bsistemas\/\d{2}-/.test(text) && e.name !== 'MEMORY.md') problems.push(`${rel}: referência a outro sistema`);
  }
})(out);

if (sys.status !== 'PLANEJADO') {
  for (const f of ['package.json', 'pnpm-lock.yaml', '.env.example', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'MEMORY.md']) {
    if (!existsSync(join(out, f))) problems.push(`arquivo obrigatório ausente: ${f}`);
  }
}
scanDir(out).forEach((f) => problems.push(`segredo? ${f.file}: ${f.rule}`));

if (problems.length) {
  console.error(`EXPORTAÇÃO REPROVADA (${problems.length}):`);
  problems.forEach((p) => console.error(' - ' + p));
  process.exit(1);
}

// ---- Manifesto e checksums ----
let commit = 'sem-git';
try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* fora de git */ }
writeFileSync(join(out, 'EXPORT_MANIFEST.json'), JSON.stringify({
  repo_name: sys.repo_name, system: sys.slug, id: sys.id, status: sys.status,
  catalog_version: catalog.catalog_version, source_commit: commit, exported_at: new Date().toISOString(),
}, null, 2) + '\n');

const files = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); e.isDirectory() ? walk(f) : files.push(f); } })(out);
const sums = files.map((f) => relative(out, f).replaceAll('\\', '/')).filter((r) => r !== 'CHECKSUMS.sha256').sort()
  .map((r) => `${createHash('sha256').update(readFileSync(join(out, r))).digest('hex')}  ${r}`);
writeFileSync(join(out, 'CHECKSUMS.sha256'), sums.join('\n') + '\n');

console.log(`exportado: ${sys.repo_name} -> ${out} (${sums.length} arquivos, commit ${commit.slice(0, 10)})`);
