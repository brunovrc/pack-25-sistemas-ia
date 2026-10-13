import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { fail, type ActionState } from '@/lib/actions/result';
import { isAdminRole, ORG_ROLES, uuidSchema, type OrgRole } from '@/lib/validation/org';

export const ORG_COOKIE = 'pack25_org';
export const CLIENT_COOKIE = 'pack25_client';

export type Membership = { organization_id: string; role: OrgRole; name: string; slug: string };

export type Context = {
  supabase: SupabaseClient;
  user: { id: string; email: string };
  membership: Membership;
  memberships: Membership[];
};

export type ContextResult =
  | { kind: 'ok'; ctx: Context }
  | { kind: 'redirect'; to: string }
  | { kind: 'forbidden' };

/** Usuário validado no servidor de autenticação (não confia apenas no cookie). */
export const getUser = cache(async () => {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? '' };
});

const getAal = cache(async () => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
});

export const getMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name, slug)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const rows = (data ?? []) as unknown as Array<{
    organization_id: string;
    role: string;
    organizations: { name: string; slug: string } | { name: string; slug: string }[] | null;
  }>;
  const out: Membership[] = [];
  for (const r of rows) {
    const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
    if (!org || !(ORG_ROLES as readonly string[]).includes(r.role)) continue;
    out.push({ organization_id: r.organization_id, role: r.role as OrgRole, name: org.name, slug: org.slug });
  }
  return out;
});

// ------------------------------------------------------------------ portal do cliente (específico do Portal B2B)
export type ClientRole = 'client_admin' | 'client_user';
export type ClientAccount = { client_account_id: string; organization_id: string; role: ClientRole; name: string; org_name: string };

/** Contas de cliente em que o usuário é membro ATIVO (o RLS já esconde as demais). */
export const getClientAccounts = cache(async (userId: string): Promise<ClientAccount[]> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('client_members')
    .select('client_account_id, organization_id, role, client_accounts!inner(name, status, archived_at), created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  const rows = (data ?? []) as unknown as Array<{
    client_account_id: string; organization_id: string; role: string;
    client_accounts: { name: string; status: string; archived_at: string | null } | { name: string; status: string; archived_at: string | null }[] | null;
  }>;
  const out: ClientAccount[] = [];
  for (const r of rows) {
    const acc = Array.isArray(r.client_accounts) ? r.client_accounts[0] : r.client_accounts;
    if (!acc || acc.status !== 'active' || acc.archived_at || (r.role !== 'client_admin' && r.role !== 'client_user')) continue;
    out.push({ client_account_id: r.client_account_id, organization_id: r.organization_id, role: r.role, name: acc.name, org_name: '' });
  }
  return out;
});

export type PortalContext = { supabase: SupabaseClient; user: { id: string; email: string }; account: ClientAccount; accounts: ClientAccount[] };
export type PortalContextResult = { kind: 'ok'; ctx: PortalContext } | { kind: 'redirect'; to: string } | { kind: 'forbidden' };

/**
 * Sessão do portal do cliente. A conta ativa vem de cookie, mas é SEMPRE revalidada contra as associações reais
 * (membro ativo de conta ativa). Quem tem fator de MFA cadastrado precisa verificá-lo; o cliente não é obrigado a cadastrar.
 */
export async function resolvePortalContext(roles?: readonly ClientRole[]): Promise<PortalContextResult> {
  const user = await getUser();
  if (!user) return { kind: 'redirect', to: '/login' };
  const aal = await getAal();
  if (aal.next === 'aal2' && aal.current !== 'aal2') return { kind: 'redirect', to: '/mfa/verify' };
  const accounts = await getClientAccounts(user.id);
  if (accounts.length === 0) return { kind: 'redirect', to: (await getMemberships(user.id)).length > 0 ? '/dashboard' : '/onboarding' };
  const store = await cookies();
  const wanted = store.get(CLIENT_COOKIE)?.value;
  const valid = wanted && uuidSchema.safeParse(wanted).success ? wanted : undefined;
  const account = accounts.find((a) => a.client_account_id === valid) ?? accounts[0]!;
  if (roles && !roles.includes(account.role)) return { kind: 'forbidden' };
  return { kind: 'ok', ctx: { supabase: await createSupabaseServer(), user, account, accounts } };
}

export async function requirePortalContext(roles?: readonly ClientRole[]): Promise<PortalContext> {
  const result = await resolvePortalContext(roles);
  if (result.kind === 'redirect') redirect(result.to);
  if (result.kind === 'forbidden') notFound();
  return result.ctx;
}

export async function actionPortalContext(roles?: readonly ClientRole[]): Promise<{ ctx: PortalContext } | { error: ActionState }> {
  const result = await resolvePortalContext(roles);
  if (result.kind === 'ok') return { ctx: result.ctx };
  if (result.kind === 'forbidden') return { error: fail('Você não tem permissão para esta ação.') };
  return { error: fail('Sua sessão expirou ou exige verificação adicional. Entre novamente.') };
}

/**
 * Resolve sessão, MFA, organização ativa e papel. Fonte única das regras de acesso do servidor.
 * - MFA: quem for owner/admin em qualquer organização precisa de sessão AAL2; quem já cadastrou fator precisa verificar.
 * - A organização ativa vem de cookie, mas é SEMPRE revalidada contra as associações reais do usuário.
 */
export async function resolveContext(roles?: readonly OrgRole[]): Promise<ContextResult> {
  const user = await getUser();
  if (!user) return { kind: 'redirect', to: '/login' };

  const aal = await getAal();
  if (aal.next === 'aal2' && aal.current !== 'aal2') return { kind: 'redirect', to: '/mfa/verify' };

  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) {
    // Usuário só de cliente (convidado de uma empresa): vai ao portal, nunca ao painel da prestadora nem à criação de organização.
    return { kind: 'redirect', to: (await getClientAccounts(user.id)).length > 0 ? '/portal' : '/onboarding' };
  }

  if (memberships.some((m) => isAdminRole(m.role)) && aal.current !== 'aal2') {
    return { kind: 'redirect', to: '/mfa/enroll?required=1' };
  }

  const store = await cookies();
  const wanted = store.get(ORG_COOKIE)?.value;
  const valid = wanted && uuidSchema.safeParse(wanted).success ? wanted : undefined;
  const membership = memberships.find((m) => m.organization_id === valid) ?? memberships[0]!;

  if (roles && !roles.includes(membership.role)) return { kind: 'forbidden' };

  const supabase = await createSupabaseServer();
  return { kind: 'ok', ctx: { supabase, user, membership, memberships } };
}

/** Para páginas e layouts: redireciona ou responde 404 quando não autorizado. */
export async function requireContext(roles?: readonly OrgRole[]): Promise<Context> {
  const result = await resolveContext(roles);
  if (result.kind === 'redirect') redirect(result.to);
  if (result.kind === 'forbidden') notFound();
  return result.ctx;
}

/** Para Server Actions: devolve mensagem em vez de redirecionar quando o acesso é negado. */
export async function actionContext(roles?: readonly OrgRole[]): Promise<{ ctx: Context } | { error: ActionState }> {
  const result = await resolveContext(roles);
  if (result.kind === 'ok') return { ctx: result.ctx };
  if (result.kind === 'forbidden') return { error: fail('Você não tem permissão para esta ação.') };
  return { error: fail('Sua sessão expirou ou exige verificação adicional. Entre novamente.') };
}

/** Exige apenas um usuário autenticado (fluxos de MFA, redefinição e onboarding). */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}
