// Rotas acessíveis sem sessão. O proxy usa isto só para UX; a autorização real
// acontece em cada página/ação via requireContext() e no RLS do banco.
const PUBLIC_EXACT = new Set(['/login', '/signup', '/forgot-password', '/auth/confirm']);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname);
}
