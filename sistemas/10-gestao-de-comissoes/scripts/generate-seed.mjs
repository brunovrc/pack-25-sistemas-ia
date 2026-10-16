#!/usr/bin/env node
// Gera supabase/seed.sql com o motor de comissões de produção. Uso: node scripts/generate-seed.mjs [--anchor AAAA-MM]
import { spawnSync } from 'node:child_process';
const i = process.argv.indexOf('--anchor');
const env = { ...process.env, ...(i > 0 && process.argv[i + 1] ? { SEED_ANCHOR: process.argv[i + 1] } : {}) };
const r = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.seed.config.ts'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
