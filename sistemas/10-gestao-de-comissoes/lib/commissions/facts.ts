/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor de consultas do PostgREST não tem tipos gerados neste projeto */
import 'server-only';
import type { Context } from '@/lib/auth/session';
import {
  DEFAULT_PRECEDENCE, parseCondition, type BookedEntry, type Dimension, type ParticipantFacts, type PlanVersionConfig, type Rule, type SaleFacts, type SaleStatus, type Tier,
} from './engine';

// Leitura dos FATOS que o motor consome. Sempre pelo cliente do usuário (RLS): quem calcula só enxerga o que o perfil permite.
// O plano de cada participante vem FIXADO na confirmação da venda (sale_participants.plan_version_id) — nunca recalculado pela data.

const PAGE = 1000;
const IN_CHUNK = 80;

type Q = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

/** Lê todas as linhas de uma consulta paginando (PostgREST devolve no máximo 1000 por chamada). */
export async function fetchAll<T>(make: () => Q): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(`consulta falhou: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export function chunk<T>(xs: T[], n = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function byIds<T>(ctx: Context, table: string, select: string, column: string, ids: string[], extra?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk([...new Set(ids)])) {
    const rows = await fetchAll<T>(() => {
      let q = ctx.supabase.from(table).select(select).in(column, part).order(column) as any;
      if (extra) q = extra(q);
      return q;
    });
    out.push(...rows);
  }
  return out;
}

// ----------------------------------------------------------------------------------------- linhas do banco
type SaleRow = {
  id: string; sale_number: string; sale_date: string; confirmed_on: string | null; cancelled_on: string | null; status: SaleStatus; channel: string | null; customer_id: string | null;
  net_amount_cents: number; commissionable_amount_cents: number; split_model: 'pool' | 'independent'; new_customer: boolean;
};
type ItemRow = { id: string; sale_id: string; position: number; product_id: string | null; quantity_decimal: number | string; net_amount_cents: number; commissionable_amount_cents: number; cost_cents: number | null };
type PartRow = { sale_id: string; seller_id: string; participation_type: 'primary' | 'secondary'; allocation_percentage: number | string; plan_version_id: string | null };
type SellerRow = { id: string; team_id: string | null; seller_type: 'internal' | 'external' | 'partner' };
type HistRow = { seller_id: string; team_id: string | null; valid_from: string; valid_until: string | null };
type ReceiptRow = { id: string; sale_id: string; received_at: string; amount_cents: number };
type EventRow = { id: string; sale_id: string; event_type: string; event_amount_cents: number; effective_at: string; metadata_json: { itemAmounts?: Record<string, number> } | null };
type PlanRow = { id: string; name: string; calculation_basis: PlanVersionConfig['basis']; eligibility_event: PlanVersionConfig['eligibility']; returns_policy: PlanVersionConfig['returnsPolicy'] };
type VersionRow = { id: string; plan_id: string; version_number: number; precedence_json: Dimension[][] | null };
type RuleRow = {
  id: string; plan_version_id: string; name: string; rule_type: 'percentage' | 'fixed' | 'tiered'; scope_type: Rule['scopeType']; scope_reference: string | null; conditions_json: unknown;
  rate_decimal: number | string | null; fixed_amount_cents: number | null; tier_mode: 'marginal' | 'reached' | null; tier_period: 'month' | 'quarter' | 'year' | null; tier_scope: 'individual' | 'team' | null;
  priority: number; stack_behavior: 'exclusive' | 'stack'; entry_kind: 'commission' | 'bonus'; enabled: boolean; valid_from: string | null; valid_until: string | null;
};
type TierRow = { rule_id: string; tier_order: number; threshold_from_cents: number; threshold_to_cents: number | null; rate_decimal: number | string };
type EntryRow = { id: string; idempotency_key: string; component_key: string; seller_id: string; sale_id: string | null; sale_item_id: string | null; plan_version_id: string | null; rule_id: string | null; entry_type: BookedEntry['entryType']; amount_cents: number };

/** Números do banco chegam como number; taxas viram texto decimal sem notação científica. */
export const dec = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '0';
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return Number(n).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
};

export async function loadPlanVersions(ctx: Context, versionIds: string[]): Promise<Map<string, PlanVersionConfig>> {
  const ids = [...new Set(versionIds)];
  const out = new Map<string, PlanVersionConfig>();
  if (!ids.length) return out;
  const versions = await byIds<VersionRow>(ctx, 'commission_plan_versions', 'id, plan_id, version_number, precedence_json', 'id', ids);
  const plans = await byIds<PlanRow>(ctx, 'commission_plans', 'id, name, calculation_basis, eligibility_event, returns_policy', 'id', versions.map((v) => v.plan_id));
  const rules = await byIds<RuleRow>(ctx, 'commission_rules', 'id, plan_version_id, name, rule_type, scope_type, scope_reference, conditions_json, rate_decimal, fixed_amount_cents, tier_mode, tier_period, tier_scope, priority, stack_behavior, entry_kind, enabled, valid_from, valid_until', 'plan_version_id', ids);
  const tiers = await byIds<TierRow>(ctx, 'commission_tiers', 'rule_id, tier_order, threshold_from_cents, threshold_to_cents, rate_decimal', 'rule_id', rules.filter((r) => r.rule_type === 'tiered').map((r) => r.id));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const tiersByRule = new Map<string, Tier[]>();
  for (const t of tiers) {
    const list = tiersByRule.get(t.rule_id) ?? [];
    list.push({ order: t.tier_order, fromCents: t.threshold_from_cents, toCents: t.threshold_to_cents, rate: dec(t.rate_decimal) });
    tiersByRule.set(t.rule_id, list);
  }
  for (const v of versions) {
    const plan = planById.get(v.plan_id);
    if (!plan) continue;
    const myRules: Rule[] = rules.filter((r) => r.plan_version_id === v.id).sort((a, b) => a.id.localeCompare(b.id)).map((r) => ({
      id: r.id, name: r.name, kind: r.rule_type, scopeType: r.scope_type, scopeReference: r.scope_reference,
      conditions: r.conditions_json ? parseCondition(r.conditions_json) : null,
      rate: r.rate_decimal === null ? null : dec(r.rate_decimal), fixedAmountCents: r.fixed_amount_cents,
      tier: r.rule_type === 'tiered' && r.tier_mode && r.tier_period && r.tier_scope ? { mode: r.tier_mode, period: r.tier_period, scope: r.tier_scope, bands: (tiersByRule.get(r.id) ?? []).sort((a, b) => a.order - b.order) } : null,
      priority: r.priority, stack: r.stack_behavior, entryKind: r.entry_kind, enabled: r.enabled, validFrom: r.valid_from, validUntil: r.valid_until,
    }));
    out.set(v.id, {
      id: v.id, planId: v.plan_id, planName: plan.name, versionNumber: v.version_number, basis: plan.calculation_basis, eligibility: plan.eligibility_event,
      returnsPolicy: plan.returns_policy, precedence: Array.isArray(v.precedence_json) ? v.precedence_json : DEFAULT_PRECEDENCE, rules: myRules,
    });
  }
  return out;
}

export type LoadedFacts = { sales: SaleFacts[]; booked: BookedEntry[]; plans: Map<string, PlanVersionConfig> };

/** Monta os fatos de um conjunto de vendas (rascunhos ficam de fora) e o livro já lançado para elas. */
export async function loadFacts(ctx: Context, saleIds: string[]): Promise<LoadedFacts> {
  const ids = [...new Set(saleIds)];
  if (!ids.length) return { sales: [], booked: [], plans: new Map() };
  const sales = await byIds<SaleRow>(ctx, 'sales', 'id, sale_number, sale_date, confirmed_on, cancelled_on, status, channel, customer_id, net_amount_cents, commissionable_amount_cents, split_model, new_customer', 'id', ids, (q) => q.neq('status', 'draft'));
  const okIds = sales.map((s) => s.id);
  const [items, parts, receipts, events, entries] = await Promise.all([
    byIds<ItemRow>(ctx, 'sale_items', 'id, sale_id, position, product_id, quantity_decimal, net_amount_cents, commissionable_amount_cents, cost_cents', 'sale_id', okIds),
    byIds<PartRow>(ctx, 'sale_participants', 'sale_id, seller_id, participation_type, allocation_percentage, plan_version_id', 'sale_id', okIds),
    byIds<ReceiptRow>(ctx, 'customer_receipts', 'id, sale_id, received_at, amount_cents', 'sale_id', okIds, (q) => q.eq('status', 'confirmed')),
    byIds<EventRow>(ctx, 'sale_events', 'id, sale_id, event_type, event_amount_cents, effective_at, metadata_json', 'sale_id', okIds, (q) => q.in('event_type', ['partially_returned', 'totally_returned'])),
    byIds<EntryRow>(ctx, 'commission_entries', 'id, idempotency_key, component_key, seller_id, sale_id, sale_item_id, plan_version_id, rule_id, entry_type, amount_cents', 'sale_id', okIds),
  ]);
  const productIds = items.map((i) => i.product_id).filter((x): x is string => !!x);
  const products = productIds.length ? await byIds<{ id: string; category_id: string | null }>(ctx, 'products', 'id, category_id', 'id', productIds) : [];
  const categoryOf = new Map(products.map((p) => [p.id, p.category_id]));
  const sellerIds = [...new Set(parts.map((p) => p.seller_id))];
  const [sellers, hist, plans] = await Promise.all([
    byIds<SellerRow>(ctx, 'sellers', 'id, team_id, seller_type', 'id', sellerIds),
    byIds<HistRow>(ctx, 'seller_team_history', 'seller_id, team_id, valid_from, valid_until', 'seller_id', sellerIds),
    loadPlanVersions(ctx, parts.map((p) => p.plan_version_id).filter((x): x is string => !!x)),
  ]);
  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const teamAt = (sellerId: string, date: string): string | null => {
    const rows = hist.filter((h) => h.seller_id === sellerId);
    if (!rows.length) return sellerById.get(sellerId)?.team_id ?? null;
    return rows.find((h) => h.valid_from <= date && (h.valid_until === null || h.valid_until >= date))?.team_id ?? null;
  };

  const facts: SaleFacts[] = sales.map((s): SaleFacts => {
    const myParts = parts.filter((p) => p.sale_id === s.id);
    const participants: ParticipantFacts[] = myParts.map((p) => {
      const sel = sellerById.get(p.seller_id);
      return {
        seller: { id: p.seller_id, teamId: teamAt(p.seller_id, s.sale_date), type: sel?.seller_type ?? 'internal' },
        isPrimary: p.participation_type === 'primary',
        allocationPct: Number(p.allocation_percentage).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0',
        plan: p.plan_version_id ? plans.get(p.plan_version_id) ?? null : null,
      };
    });
    return {
      id: s.id, number: s.sale_number, date: s.sale_date, confirmedAt: s.sale_date, cancelledAt: s.cancelled_on, newCustomer: s.new_customer, status: s.status, channel: s.channel, customerId: s.customer_id,
      netCents: s.net_amount_cents, commissionableCents: s.commissionable_amount_cents, splitModel: s.split_model,
      items: items.filter((i) => i.sale_id === s.id).map((i) => ({
        id: i.id, position: i.position, productId: i.product_id, categoryId: i.product_id ? categoryOf.get(i.product_id) ?? null : null,
        quantity: dec(i.quantity_decimal), netCents: i.net_amount_cents, commissionableCents: i.commissionable_amount_cents, costCents: i.cost_cents,
      })),
      participants,
      receipts: receipts.filter((r) => r.sale_id === s.id).map((r) => ({ id: r.id, date: r.received_at, amountCents: r.amount_cents })),
      returns: events.filter((e) => e.sale_id === s.id).map((e) => ({ id: e.id, date: e.effective_at, amountCents: e.event_amount_cents, itemAmounts: e.metadata_json?.itemAmounts })),
    };
  });
  const booked: BookedEntry[] = entries.filter((e) => e.component_key.startsWith('c:') && e.plan_version_id).map((e) => ({
    id: e.id, idempotencyKey: e.idempotency_key, componentKey: e.component_key, saleId: e.sale_id, itemId: e.sale_item_id, planVersionId: e.plan_version_id as string, ruleId: e.rule_id,
    sellerId: e.seller_id, entryType: e.entry_type, amountCents: e.amount_cents,
  }));
  return { sales: facts, booked, plans };
}
