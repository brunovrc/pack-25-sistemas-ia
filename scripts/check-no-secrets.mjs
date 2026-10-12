#!/usr/bin/env node
// Verificação leve de segredos. É uma rede de segurança local, NÃO substitui
// GitHub secret scanning + push protection (ver docs/SECURITY_STANDARD.md).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '_export']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2']);
const SELF = basename(fileURLToPath(import.meta.url));

const RULES = [
  { name: 'chave privada', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'JWT embutido', re: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'chave Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'chave tipo OpenAI', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'token GitHub', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: 'service role com valor atribuído', re: /SERVICE_ROLE_KEY\s*[=:]\s*["']?[A-Za-z0-9._-]{12,}/ },
  { name: 'service role exposta ao navegador', re: /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/, skipExt: ['.md'] },
];

export function scanDir(dir) {
  const findings = [];
  const base = resolve(dir);
  (function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full); continue; }
      const rel = relative(base, full).replaceAll('\\', '/');
      if (/^\.env(\..+)?$/.test(entry.name) && entry.name !== '.env.example') {
        findings.push({ file: rel, rule: 'arquivo .env versionável' }); continue;
      }
      if (entry.name === SELF || SKIP_EXT.has(extname(entry.name).toLowerCase())) continue;
      if (statSync(full).size > 2_000_000) continue;
      const text = readFileSync(full, 'utf8');
      for (const r of RULES) {
        if (r.skipExt?.includes(extname(entry.name).toLowerCase())) continue;
        if (r.re.test(text)) findings.push({ file: rel, rule: r.name });
      }
    }
  })(base);
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const target = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const findings = scanDir(target);
  if (findings.length) {
    console.error(`POSSÍVEIS SEGREDOS (${findings.length}):`);
    findings.forEach((f) => console.error(` - ${f.file}: ${f.rule}`));
    process.exit(1);
  }
  console.log('verificação de segredos: nada encontrado (rede de segurança local, não exaustiva)');
}
