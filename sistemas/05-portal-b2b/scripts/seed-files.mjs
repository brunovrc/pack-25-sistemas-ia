#!/usr/bin/env node
// Envia ao Storage LOCAL os arquivos de demonstração listados em scripts/seed-files.json (gerado por gen-seed.mjs).
// SOMENTE desenvolvimento: usa a chave service_role da stack local, que NUNCA vai ao navegador nem ao git. Recusa URLs que não sejam locais.
// Uso: SUPABASE_URL=http://127.0.0.1:58321 SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-files.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoFile } from './demo-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:58321').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) { console.error('Recusado: este script só roda contra o Supabase local.'); process.exit(2); }
if (!key) { console.error('Defina SUPABASE_SERVICE_ROLE_KEY (veja «npx supabase status -o env»).'); process.exit(2); }

const files = JSON.parse(readFileSync(join(root, 'scripts', 'seed-files.json'), 'utf8'));
let ok = 0;
for (const f of files) {
  const body = demoFile(f.ext, f.title);
  const res = await fetch(`${url}/storage/v1/object/portal-documents/${f.org}/${f.client}/${f.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': f.mime, 'x-upsert': 'true' }, body,
  });
  if (!res.ok) { console.error(`Falha ao enviar ${f.title}: HTTP ${res.status}`); process.exit(1); }
  ok += 1;
}
console.log(`${ok} arquivo(s) de demonstração enviados ao Storage local.`);
