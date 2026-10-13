import { readableOn, safePrimary } from '@/lib/utils';

// Tema (white-label) do portal do cliente como CSS do próprio domínio: a CSP (`style-src 'self'`) a aceita sem nonce.
// Cores vêm na URL (?c=principal&s=apoio, RRGGBB) e são validadas; qualquer outro valor cai no padrão. Conteúdo imutável, cacheável para sempre.
const HEX = /^[0-9a-fA-F]{6}$/;

export function GET(request: Request) {
  const url = new URL(request.url);
  const c = url.searchParams.get('c') ?? '';
  const s = url.searchParams.get('s') ?? '';
  const primary = safePrimary(HEX.test(c) ? `#${c}` : null);
  const accent = HEX.test(s) ? `#${s.toLowerCase()}` : null;
  const css = `:root:root{--primary:${primary};--primary-foreground:${readableOn(primary)}${accent ? `;--accent:${accent};--ring:${accent}` : ''}}`;
  return new Response(css, {
    headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
