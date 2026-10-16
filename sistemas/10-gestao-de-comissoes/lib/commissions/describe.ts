// Descrições em português de regras e faixas (telas e demonstrativos).
import { brl, rateBR } from './format';
import { RULE_TYPE_LABEL, SCOPE_LABEL, TIER_MODE_LABEL, TIER_PERIOD_LABEL } from './labels';

export type RuleView = {
  id: string; name: string; rule_type: string; scope_type: string; scope_reference: string | null; conditions_json: unknown; rate_decimal: number | string | null; fixed_amount_cents: number | null;
  tier_mode: string | null; tier_period: string | null; tier_scope: string | null; priority: number; stack_behavior: string; entry_kind: string; enabled: boolean; valid_from: string | null; valid_until: string | null;
};
export type TierView = { rule_id: string; tier_order: number; threshold_from_cents: number; threshold_to_cents: number | null; rate_decimal: number | string };

export function describeValue(r: RuleView, tiers: TierView[], basis?: string): string {
  if (r.rule_type === 'percentage') return `${rateBR(r.rate_decimal)} sobre a base`;
  if (r.rule_type === 'fixed') return `${brl(r.fixed_amount_cents)} ${basis === 'fixed_per_unit' ? 'por unidade' : 'por venda'}${r.entry_kind === 'bonus' ? ' (bônus)' : ''}`;
  const t = tiers.filter((x) => x.rule_id === r.id).sort((a, b) => a.tier_order - b.tier_order);
  return `${t.map((x) => `${x.threshold_to_cents === null ? `acima de ${brl(x.threshold_from_cents)}` : `até ${brl(x.threshold_to_cents)}`}: ${rateBR(x.rate_decimal)}`).join(' · ')}`;
}
export function describeTierMode(r: RuleView): string {
  return r.rule_type === 'tiered' ? `${TIER_MODE_LABEL[r.tier_mode ?? ''] ?? ''} · ${TIER_PERIOD_LABEL[r.tier_period ?? ''] ?? ''}${r.tier_scope === 'team' ? ' · soma da equipe' : ''}` : '';
}
export const ruleTypeLabel = (t: string): string => RULE_TYPE_LABEL[t] ?? t;
export const scopeLabel = (t: string): string => SCOPE_LABEL[t] ?? t;
