import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { requireContext, type Context } from '@/lib/auth/session';
import { nowMs } from '@/lib/time';
import { can, type Perms, type Profile } from './labels';
import { civilDateIn } from './query';

export type CmSettings = {
  timezone: string; date_format: string; currency: string; negative_balance_policy: 'carry_forward' | 'manual_review'; adjustment_approval_required: boolean;
  segregation_of_duties: boolean; allow_payout_over_balance: boolean; allow_receipt_over_sale: boolean; statement_template: 'standard' | 'compact'; statement_footer: string | null;
};
export const DEFAULT_SETTINGS: CmSettings = {
  timezone: 'America/Sao_Paulo', date_format: 'DD/MM/YYYY', currency: 'BRL', negative_balance_policy: 'carry_forward', adjustment_approval_required: true, segregation_of_duties: false,
  allow_payout_over_balance: false, allow_receipt_over_sale: false, statement_template: 'standard', statement_footer: null,
};

export type Access = { profile: Profile | null; sellerId: string | null; managedTeamIds: string[] };

/** Perfil e vendedor vinculado do usuário na empresa ativa (uma ida ao banco por requisição). */
export const loadAccess = cache(async (org: string): Promise<Access> => {
  const ctx = await requireContext();
  const { data } = await ctx.supabase.rpc('cm_my_context', { p_org: org });
  const d = (data ?? {}) as { profile?: Profile | null; seller_id?: string | null; managed_team_ids?: string[] };
  return { profile: d.profile ?? null, sellerId: d.seller_id ?? null, managedTeamIds: Array.isArray(d.managed_team_ids) ? d.managed_team_ids : [] };
});

/** Contexto comum das páginas: sessão (já com MFA/papel), perfil de comissões, configurações, fuso e «hoje». */
export async function pageCtx(allow?: readonly Profile[]) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const access = await loadAccess(org);
  if (allow && (!access.profile || !allow.includes(access.profile))) notFound();
  const { data } = await ctx.supabase.from('commission_settings').select('timezone, date_format, currency, negative_balance_policy, adjustment_approval_required, segregation_of_duties, allow_payout_over_balance, allow_receipt_over_sale, statement_template, statement_footer').eq('organization_id', org).maybeSingle();
  const settings: CmSettings = (data as CmSettings | null) ?? DEFAULT_SETTINGS;
  const today = civilDateIn(new Date(nowMs()), settings.timezone);
  return { ctx, org, settings, tz: settings.timezone, today, profile: access.profile, sellerId: access.sellerId, managedTeamIds: access.managedTeamIds, perms: can(access.profile) as Perms };
}
export type PageCtx = Awaited<ReturnType<typeof pageCtx>>;
export type { Context };
