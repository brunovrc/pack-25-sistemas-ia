import 'server-only';
import type { Context } from '@/lib/auth/session';
import { computeCommissions, parseMoneyToCents, type CalcDetail, type ParticipantFacts, type Pendency, type PlanVersionConfig, type SaleFacts } from './engine';
import { loadPlanVersions } from './facts';
import { isIsoDate, monthStart } from './query';

// Simulação: usa EXATAMENTE o motor de produção sobre fatos hipotéticos. Nada é gravado: sem lançamento, sem alterar venda, meta ou fechamento.

export type SimInput = {
  sellerId: string; date: string; amount: string; discount: string; productId: string; channel: string; secondSellerId: string; secondPct: string; received: string; accumulated: string; returned: string;
};
export type SimResult = {
  ok: true; plan: string; version: number; basis: string;
  rows: Array<{ sellerId: string; potentialCents: number; eligibleCents: number; ruleName: string; baseCents: number; snapshot: unknown }>;
  totalPotential: number; totalEligible: number; pendencies: Pendency[]; hypothetical: true;
} | { ok: false; error: string };

async function planAt(ctx: Context, sellerId: string, date: string): Promise<PlanVersionConfig | null> {
  const { data: a } = await ctx.supabase.from('seller_plan_assignments').select('plan_id').eq('seller_id', sellerId).lte('valid_from', date).or(`valid_until.is.null,valid_until.gte.${date}`).limit(1).maybeSingle();
  const planId = (a as { plan_id?: string } | null)?.plan_id;
  if (!planId) return null;
  const { data: v } = await ctx.supabase.from('commission_plan_versions').select('id').eq('plan_id', planId).eq('status', 'published').lte('valid_from', date).or(`valid_until.is.null,valid_until.gte.${date}`).order('version_number', { ascending: false }).limit(1).maybeSingle();
  const vid = (v as { id?: string } | null)?.id;
  if (!vid) return null;
  return (await loadPlanVersions(ctx, [vid])).get(vid) ?? null;
}

const cents = (s: string): number => (s.trim() === '' ? 0 : parseMoneyToCents(s));

export async function simulate(ctx: Context, inp: SimInput): Promise<SimResult> {
  try {
    if (!inp.sellerId) return { ok: false, error: 'Escolha o vendedor.' };
    if (!isIsoDate(inp.date)) return { ok: false, error: 'Data inválida.' };
    const amount = cents(inp.amount);
    const discount = cents(inp.discount);
    const received = cents(inp.received);
    const accumulated = cents(inp.accumulated);
    const returned = cents(inp.returned);
    if (amount <= 0) return { ok: false, error: 'Informe o valor da venda.' };
    if (discount < 0 || discount >= amount) return { ok: false, error: 'O desconto deve ser menor que o valor da venda.' };
    const net = amount - discount;
    if (received > net) return { ok: false, error: 'O valor recebido não pode passar do valor líquido.' };
    if (returned > net) return { ok: false, error: 'A devolução não pode passar do valor líquido.' };

    const sellerIds = [inp.sellerId, ...(inp.secondSellerId ? [inp.secondSellerId] : [])];
    const { data: sel } = await ctx.supabase.from('sellers').select('id, team_id, seller_type').in('id', sellerIds);
    const sellers = new Map(((sel ?? []) as Array<{ id: string; team_id: string | null; seller_type: 'internal' | 'external' | 'partner' }>).map((s) => [s.id, s]));
    if (!sellers.get(inp.sellerId)) return { ok: false, error: 'Vendedor não encontrado.' };
    const plan = await planAt(ctx, inp.sellerId, inp.date);
    if (!plan) return { ok: false, error: 'O vendedor não tem plano vigente nesta data.' };
    let categoryId: string | null = null;
    if (inp.productId) {
      const { data: p } = await ctx.supabase.from('products').select('category_id').eq('id', inp.productId).maybeSingle();
      categoryId = (p as { category_id?: string | null } | null)?.category_id ?? null;
    }
    const pool = !!inp.secondSellerId;
    const pct2 = pool ? Number(inp.secondPct.replace(',', '.')) : 0;
    if (pool && !(pct2 > 0 && pct2 < 100)) return { ok: false, error: 'A participação do segundo vendedor deve ficar entre 0 e 100%.' };
    const parts: ParticipantFacts[] = [{ seller: { id: inp.sellerId, teamId: sellers.get(inp.sellerId)!.team_id, type: sellers.get(inp.sellerId)!.seller_type }, isPrimary: true, allocationPct: pool ? String(100 - pct2) : '100', plan }];
    if (pool) {
      const s2 = sellers.get(inp.secondSellerId);
      if (!s2) return { ok: false, error: 'Segundo vendedor não encontrado.' };
      parts.push({ seller: { id: s2.id, teamId: s2.team_id, type: s2.seller_type }, isPrimary: false, allocationPct: String(pct2), plan: (await planAt(ctx, s2.id, inp.date)) ?? plan });
    }
    const mk = (id: string, date: string, amountC: number, prior: boolean): SaleFacts => ({
      id, number: id, date, confirmedAt: date, status: 'confirmed', channel: inp.channel || null, customerId: null, netCents: amountC, commissionableCents: amountC, splitModel: pool ? 'pool' : 'independent',
      items: [{ id: `${id}-i`, position: 1, productId: prior ? null : inp.productId || null, categoryId: prior ? null : categoryId, quantity: '1', netCents: amountC, commissionableCents: amountC, costCents: null }],
      participants: parts, receipts: prior ? [] : received > 0 ? [{ id: 'sim-r', date: inp.date, amountCents: received }] : [], returns: [],
    });
    const hypo = mk('sim-venda', inp.date, net, false);
    if (returned > 0) { hypo.status = 'partially_returned'; hypo.returns = [{ id: 'sim-d', date: inp.date, amountCents: returned }]; }
    const sales: SaleFacts[] = [];
    if (accumulated > 0) sales.push(mk('sim-anterior', monthStart(inp.date), accumulated, true));
    sales.push(hypo);
    const out = computeCommissions({ sales, booked: [] });
    const mine: CalcDetail[] = out.details.filter((d) => d.saleId === 'sim-venda');
    // para faixas: o potencial da venda hipotética é o incremento causado por ela sobre o acumulado informado
    const rows = mine.map((d) => ({ sellerId: d.sellerId, potentialCents: d.potentialCents, eligibleCents: d.eligibleCents, ruleName: String((d.snapshot.rule as { name?: string } | undefined)?.name ?? ''), baseCents: d.baseCents, snapshot: d.snapshot }));
    return {
      ok: true, plan: plan.planName, version: plan.versionNumber, basis: plan.basis, rows, totalPotential: rows.reduce((a, r) => a + r.potentialCents, 0), totalEligible: rows.reduce((a, r) => a + r.eligibleCents, 0),
      pendencies: out.pendencies.filter((p) => p.saleId === 'sim-venda'), hypothetical: true,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível simular.' };
  }
}
