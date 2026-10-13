// Prefixos de rota acessíveis SEM sessão, além das rotas de autenticação (ver paths.ts).
// Portal B2B: só a página de convite (/convite/<token>). Ela NÃO consulta o banco quando não há sessão e não revela
// se o convite existe; a aceitação exige login e é validada por public.pt_invite_accept. Este arquivo está em .core-overrides.
export const PUBLIC_PREFIXES: readonly string[] = ['/convite/'];
