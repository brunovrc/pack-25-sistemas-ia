import type { NextConfig } from 'next';

// Cabeçalhos estáticos. A CSP com nonce é gerada por requisição em proxy.ts.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // O proxy (proxy.ts) lê o corpo para repassá-lo: o padrão de 10 MB truncaria envios de documentos. O teto do produto é 50 MB (doc_max_mb);
  // o limite por organização é conferido no route handler e no banco.
  experimental: { proxyClientMaxBodySize: '52mb' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
