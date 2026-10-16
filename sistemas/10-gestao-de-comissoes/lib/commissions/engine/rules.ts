// Resolução de regras: escopo → especificidade → prioridade. Uma única regra exclusiva vence; empilhamento só quando
// a regra declara `stack`. Empate não resolvido é CONFLITO (nunca escolhe ao acaso). Validação de versão de plano para publicação.
import { evalCondition, conditionDimensions, type FactValues, parseCondition } from './conditions';
import { rate as parseRate } from './decimal';
import { validateTiers, type TierIssue } from './tiers';
import type { Dimension, PlanVersionConfig, Rule, SellerFacts } from './types';

/** Ordem padrão (do mais específico ao mais geral). `[]` = regra global da organização. Configurável por versão do plano. */
export const DEFAULT_PRECEDENCE: Dimension[][] = [
  ['product', 'seller'], ['category', 'seller'], ['channel', 'product'], ['product'], ['category'], ['seller'], ['channel'], ['team'], [],
];

export const dimsKey = (dims: readonly string[]): string => [...new Set(dims)].sort().join('+');

export function ruleDimensions(r: Rule): Dimension[] {
  const base: Dimension[] = r.scopeType === 'organization' ? [] : [r.scopeType];
  return [...new Set([...base, ...conditionDimensions(r.conditions)])].sort() as Dimension[];
}

export interface RuleContext {
  date: string;
  seller: SellerFacts;
  productId: string | null;
  categoryId: string | null;
  channel: string | null;
  customerId: string | null;
  saleNetCents: number;
  itemNetCents: number | null;
  itemQuantity: string | null;
}

const isFixedBasis = (b: PlanVersionConfig['basis']): boolean => b === 'fixed_per_sale' || b === 'fixed_per_unit';

function factsOf(ctx: RuleContext): FactValues {
  return {
    'seller.id': ctx.seller.id, 'seller.team_id': ctx.seller.teamId, 'seller.type': ctx.seller.type,
    'product.id': ctx.productId, 'product.category_id': ctx.categoryId, 'sale.channel': ctx.channel, 'customer.id': ctx.customerId,
    'sale.net_cents': ctx.saleNetCents, 'item.net_cents': ctx.itemNetCents, 'item.quantity': ctx.itemQuantity,
  };
}

function scopeMatches(r: Rule, ctx: RuleContext): boolean {
  switch (r.scopeType) {
    case 'organization': return true;
    case 'seller': return r.scopeReference === ctx.seller.id;
    case 'team': return r.scopeReference !== null && r.scopeReference === ctx.seller.teamId;
    case 'product': return r.scopeReference !== null && r.scopeReference === ctx.productId;
    case 'category': return r.scopeReference !== null && r.scopeReference === ctx.categoryId;
    case 'channel': return r.scopeReference !== null && r.scopeReference === ctx.channel;
  }
}

export function rankOf(plan: PlanVersionConfig, r: Rule): number {
  const dims = ruleDimensions(r);
  const key = dimsKey(dims);
  const idx = plan.precedence.findIndex((p) => dimsKey(p) === key);
  // Conjunto fora da lista não deveria existir (a publicação o rejeita): fica abaixo de todos, mais dimensões primeiro.
  return idx >= 0 ? idx : plan.precedence.length + 10 - dims.length;
}

export interface Resolution {
  winner: Rule | null;
  stackers: Rule[];
  conflict: Rule[] | null;
  considered: Array<{ ruleId: string; rank: number; role: 'winner' | 'overridden' | 'stacked' | 'conflict' }>;
}

export function resolveRules(plan: PlanVersionConfig, ctx: RuleContext): Resolution {
  const facts = factsOf(ctx);
  const kindsOk = (r: Rule): boolean => (isFixedBasis(plan.basis) ? r.kind === 'fixed' : r.kind === 'percentage' || r.kind === 'tiered');
  const matching = plan.rules
    .filter((r) => r.enabled && kindsOk(r))
    .filter((r) => (r.validFrom === null || r.validFrom <= ctx.date) && (r.validUntil === null || ctx.date <= r.validUntil))
    .filter((r) => scopeMatches(r, ctx) && evalCondition(r.conditions, facts))
    .sort((a, b) => a.id.localeCompare(b.id));
  const stackers = matching.filter((r) => r.stack === 'stack');
  const exclusive = matching.filter((r) => r.stack === 'exclusive');
  const considered: Resolution['considered'] = stackers.map((r) => ({ ruleId: r.id, rank: rankOf(plan, r), role: 'stacked' }));
  if (exclusive.length === 0) return { winner: null, stackers, conflict: null, considered };
  const ranked = exclusive.map((r) => ({ r, rank: rankOf(plan, r) }));
  const bestRank = Math.min(...ranked.map((x) => x.rank));
  const top = ranked.filter((x) => x.rank === bestRank);
  const bestPrio = Math.max(...top.map((x) => x.r.priority));
  const finalists = top.filter((x) => x.r.priority === bestPrio);
  for (const x of ranked) {
    const inFinal = finalists.includes(x);
    considered.push({ ruleId: x.r.id, rank: x.rank, role: finalists.length > 1 && inFinal ? 'conflict' : inFinal ? 'winner' : 'overridden' });
  }
  if (finalists.length > 1) return { winner: null, stackers, conflict: finalists.map((x) => x.r), considered };
  return { winner: finalists[0]!.r, stackers, conflict: null, considered };
}

// ---- validação para publicação de uma versão de plano --------------------------------------------------
export function validatePlanVersion(plan: PlanVersionConfig): TierIssue[] {
  const issues: TierIssue[] = [];
  const fixed = isFixedBasis(plan.basis);
  if (plan.rules.filter((r) => r.enabled).length === 0) issues.push({ code: 'PLAN_NO_RULES', message: 'A versão precisa de ao menos uma regra ativa.' });
  if (plan.basis === 'received_value' && plan.eligibility !== 'proportional_receipt') {
    issues.push({ code: 'BASIS_ELIGIBILITY_MISMATCH', message: 'Base «valor recebido» exige elegibilidade proporcional ao recebimento.' });
  }
  const ranked = new Set(plan.precedence.map(dimsKey));
  const exclusiveByKey = new Map<string, Rule[]>();
  for (const r of plan.rules.filter((x) => x.enabled)) {
    const tag = `Regra «${r.name}»`;
    if (fixed && r.kind !== 'fixed') issues.push({ code: 'RULE_KIND_MISMATCH', message: `${tag}: base fixa aceita somente regras de valor fixo.` });
    if (!fixed && r.kind === 'fixed') issues.push({ code: 'RULE_KIND_MISMATCH', message: `${tag}: valor fixo exige base «fixo por venda» ou «fixo por unidade».` });
    if (r.kind === 'percentage') {
      try { if (r.rate === null) throw new Error(); parseRate(r.rate); } catch { issues.push({ code: 'RULE_RATE_INVALID', message: `${tag}: informe uma taxa entre 0% e 100%.` }); }
    }
    if (r.kind === 'fixed' && (r.fixedAmountCents === null || !Number.isSafeInteger(r.fixedAmountCents) || r.fixedAmountCents < 0)) {
      issues.push({ code: 'RULE_AMOUNT_INVALID', message: `${tag}: informe um valor fixo não negativo.` });
    }
    if (r.kind === 'tiered') {
      if (!r.tier) issues.push({ code: 'RULE_TIER_MISSING', message: `${tag}: faixas não configuradas.` });
      else for (const i of validateTiers(r.tier.bands)) issues.push({ code: i.code, message: `${tag}: ${i.message}` });
    }
    if (r.entryKind === 'bonus' && r.kind !== 'fixed') issues.push({ code: 'RULE_BONUS_KIND', message: `${tag}: bônus só pode ser de valor fixo.` });
    if (plan.basis === 'fixed_per_sale' && (r.scopeType === 'product' || r.scopeType === 'category' || conditionDimensions(r.conditions).some((d) => d === 'product' || d === 'category'))) {
      issues.push({ code: 'RULE_SCOPE_INVALID', message: `${tag}: valor fixo por venda não pode ter escopo de produto/categoria.` });
    }
    if (r.scopeType !== 'organization' && !r.scopeReference) issues.push({ code: 'RULE_SCOPE_REFERENCE', message: `${tag}: informe o alvo do escopo.` });
    if (r.conditions) { try { parseCondition(r.conditions); } catch { issues.push({ code: 'INVALID_CONDITION', message: `${tag}: condição inválida.` }); } }
    if (r.validFrom && r.validUntil && r.validFrom > r.validUntil) issues.push({ code: 'RULE_WINDOW', message: `${tag}: vigência invertida.` });
    const key = dimsKey(ruleDimensions(r));
    if (!ranked.has(key)) issues.push({ code: 'RULE_SCOPE_NOT_RANKED', message: `${tag}: a combinação de escopo «${key || 'global'}» não está na ordem de precedência.` });
    if (r.stack === 'exclusive') exclusiveByKey.set(key, [...(exclusiveByKey.get(key) ?? []), r]);
  }
  // Conflito estático: mesma especificidade, mesma prioridade, mesmo alvo e vigências que se cruzam.
  for (const group of exclusiveByKey.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!, b = group[j]!;
        const overlap = (a.validFrom ?? '0000-01-01') <= (b.validUntil ?? '9999-12-31') && (b.validFrom ?? '0000-01-01') <= (a.validUntil ?? '9999-12-31');
        if (a.priority === b.priority && a.scopeReference === b.scopeReference && overlap && !a.conditions && !b.conditions) {
          issues.push({ code: 'RULE_CONFLICT', message: `Regras «${a.name}» e «${b.name}» conflitam (mesma especificidade e prioridade).` });
        }
      }
    }
  }
  return issues;
}
