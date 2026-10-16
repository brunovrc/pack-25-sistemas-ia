import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Só para o gerador do seed (scripts/generate-seed.mjs). Não faz parte da suíte do produto.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)), 'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['scripts/seed/**/*.seed.ts'] },
});
