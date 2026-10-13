import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveContext, resolvePortalContext } from '@/lib/auth/session';

export type ApiActor = {
  supabase: SupabaseClient;
  userId: string;
  organizationId: string;
  /** Conta do cliente quando o usuário é do portal; a equipe escolhe a conta no pedido. */
  clientAccountId: string | null;
  kind: 'staff' | 'client';
  staffRole: 'owner' | 'admin' | 'manager' | 'member' | 'viewer' | null;
};

/** Identifica quem chama um route handler (equipe ou cliente), com a mesma validação de sessão/MFA das páginas. `null` = não autenticado. */
export async function apiActor(): Promise<ApiActor | null> {
  const staff = await resolveContext();
  if (staff.kind === 'ok') {
    const { ctx } = staff;
    return { supabase: ctx.supabase, userId: ctx.user.id, organizationId: ctx.membership.organization_id, clientAccountId: null, kind: 'staff', staffRole: ctx.membership.role };
  }
  const client = await resolvePortalContext();
  if (client.kind === 'ok') {
    const { ctx } = client;
    return { supabase: ctx.supabase, userId: ctx.user.id, organizationId: ctx.account.organization_id, clientAccountId: ctx.account.client_account_id, kind: 'client', staffRole: null };
  }
  return null;
}
