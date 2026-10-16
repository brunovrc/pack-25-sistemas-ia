// Motor de comissões — orquestrador determinístico.
//
// Modelo: cada venda gera COMPONENTES (venda × item × regra × dono). Para cada componente o motor calcula o ALVO — quanto já é
// ELEGÍVEL hoje (comissão calculada × razão de elegibilidade, com devoluções aplicadas) — e compara com o que o livro JÁ TEM
// (`booked`). A diferença vira um novo lançamento (positivo, ou estorno/ajuste negativo). Consequências:
//   · idempotência: reprocessar os mesmos fatos ⇒ diferença zero ⇒ nenhum lançamento novo;
//   · histórico preservado: lançamentos nunca são alterados; correções são novos lançamentos referenciando o original;
//   · plano versionado: o plano de cada venda é fixado pelo servidor; mudar a taxa depois não reescreve o passado;
//   · soma exata em centavos: o arredondamento (meio-para-cima) ocorre uma vez por componente.
import { CommissionError, D, ENGINE_VERSION, type Cents, type Dec, dec, rate as parseRate, roundCents } from './decimal';
import { allocateByWeights, poolSumsTo100 } from './split';
import { resolveRules, type RuleContext } from './rules';
import { tierAmount, tierBreakdown } from './tiers';
import type {
  BookedEntry, CalcDetail, ComputeInput, ComputeOutput, EligibilityEvent, EntryCause, EntryKind, EntryType, ItemFacts, NewEntry,
  ParticipantFacts, Pendency, PlanVersionConfig, Rule, SaleFacts, TierPeriod,
} from './types';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const ZERO = new D(0);

export function periodKey(date: string, period: TierPeriod): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  return period === 'month' ? date.slice(0, 7) : period === 'quarter' ? `${y}-Q${Math.ceil(m / 3)}` : y;
}

// ------------------------------------------------------------------------------------------------ estruturas internas
interface RetEvent { id: string; date: string; perItem: Map<string, Cents> }

export interface SaleCtx {
  sale: SaleFacts;
  retEvents: RetEvent[];
  retByItem: Map<string, Cents>;
  retQtyByItem: Map<string, Dec>;
  remFrac: Dec;
  dueNet: Dec;
  received: Dec;
  receiptsSorted: SaleFacts['receipts'];
  cancelled: boolean;
  lastReturnDate: string | null;
  lastReturnId: string | null;
  hasReturns: boolean;
}

export interface Comp {
  key: string;
  saleId: string | null;
  itemId: string | null;
  ruleId: string | null;
  planVersionId: string;
  participants: string[];
  targets: Cents[];
  potentials: Cents[];
  base: Cents;
  rate: string | null;
  entryKind: EntryKind;
  eligibleAt: string;
  reversalAt: string;
  sourceReceiptId: string | null;
  sourceReturnId: string | null;
  isReturnEvent: boolean;
  originalKey: string;
  cause: 'normal' | 'return' | 'cancellation';
  snapshot: Record<string, unknown>;
}

interface TierEvent {
  ctx: SaleCtx;
  owner: ParticipantFacts;
  plan: PlanVersionConfig;
  rule: Rule;
  itemId: string;
  key: string;
  originalKey: string;
  kind: 'item' | 'rcpt' | 'ret';
  eventId: string;
  date: string;
  period: string;
  base: Dec;
  groupKey: string;
  order: string;
  ratio: Dec;
  eligibleAt: string;
  participants: ParticipantFacts[];
  resolution: unknown;
}

const baseKey = (saleId: string, ownerId: string, itemId: string, ruleId: string): string => `c:${saleId}:${ownerId}:${itemId}:${ruleId}`;
const ownerPrefix = (saleId: string, ownerId: string): string => `c:${saleId}:${ownerId}:`;

// ------------------------------------------------------------------------------------------------ preparação da venda
export function prepareSale(sale: SaleFacts, pend: Pendency[]): SaleCtx | null {
  const items = [...sale.items].sort((a, b) => a.position - b.position || cmp(a.id, b.id));
  const itemIds = new Set(items.map((i) => i.id));
  const retByItem = new Map<string, Cents>(items.map((i) => [i.id, 0]));
  const retQtyByItem = new Map<string, Dec>(items.map((i) => [i.id, new D(0)]));
  const events: RetEvent[] = [];
  const fail = (code: string, message: string): null => {
    pend.push({ code, severity: 'critical', message, saleId: sale.id });
    return null;
  };
  for (const it of items) {
    if (!Number.isSafeInteger(it.commissionableCents) || it.commissionableCents < 0) return fail('SALE_INVALID', 'Valor comissionável inválido em item.');
  }
  const sumItems = items.reduce((a, i) => a + i.commissionableCents, 0);
  if (sumItems !== sale.commissionableCents) return fail('SALE_TOTAL_MISMATCH', 'A soma dos itens difere do total comissionável da venda.');

  const addRet = (id: string, date: string, perItem: Map<string, Cents>): void => {
    events.push({ id, date, perItem });
    for (const [iid, c] of perItem) {
      retByItem.set(iid, (retByItem.get(iid) ?? 0) + c);
    }
  };

  const returns = [...sale.returns].sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));
  for (const r of returns) {
    const perItem = new Map<string, Cents>();
    if (r.itemAmounts) {
      let total = 0;
      for (const [iid, c] of Object.entries(r.itemAmounts)) {
        if (!itemIds.has(iid) || !Number.isSafeInteger(c) || c < 0) return fail('RETURN_INVALID', `Devolução ${r.id} referencia item inválido.`);
        perItem.set(iid, c);
        total += c;
      }
      if (total !== r.amountCents) return fail('RETURN_INVALID', `Devolução ${r.id}: itens não somam o valor devolvido.`);
    } else {
      if (!Number.isSafeInteger(r.amountCents) || r.amountCents < 0) return fail('RETURN_INVALID', `Devolução ${r.id} com valor inválido.`);
      const weights = items.map((i) => Math.max(0, i.commissionableCents - (retByItem.get(i.id) ?? 0)));
      if (weights.reduce((a, b) => a + b, 0) === 0) {
        if (r.amountCents > 0) return fail('RETURN_INVALID', `Devolução ${r.id} excede o valor da venda.`);
      } else {
        const alloc = allocateByWeights(r.amountCents, weights.map(String));
        items.forEach((i, ix) => perItem.set(i.id, alloc[ix] ?? 0));
      }
    }
    // Cap: a soma devolvida de um item nunca passa do comissionável dele.
    for (const [iid, c] of [...perItem]) {
      const it = items.find((x) => x.id === iid)!;
      const room = it.commissionableCents - (retByItem.get(iid) ?? 0);
      if (c > room) {
        pend.push({ code: 'RETURN_EXCEEDS_SALE', severity: 'warning', message: `Devolução ${r.id} excede o item; valor limitado ao saldo.`, saleId: sale.id });
        perItem.set(iid, Math.max(0, room));
      }
    }
    addRet(r.id, r.date, perItem);
    for (const it of items) {
      const given = r.itemQuantities?.[it.id];
      const c = perItem.get(it.id) ?? 0;
      const q = given !== undefined ? dec(given) : it.commissionableCents > 0 ? dec(it.quantity).times(c).div(it.commissionableCents) : new D(0);
      retQtyByItem.set(it.id, retQtyByItem.get(it.id)!.plus(q));
    }
  }

  const cancelled = sale.status === 'cancelled' || sale.status === 'totally_returned';
  if (cancelled) {
    const rest = new Map<string, Cents>();
    for (const it of items) {
      const left = it.commissionableCents - (retByItem.get(it.id) ?? 0);
      if (left > 0) rest.set(it.id, left);
    }
    if (rest.size > 0) {
      const date = sale.cancelledAt ?? returns[returns.length - 1]?.date ?? sale.date;
      addRet(`final:${sale.id}`, date, rest);
      for (const it of items) {
        const left = rest.get(it.id);
        if (left) retQtyByItem.set(it.id, dec(it.quantity)); // quantidade integral devolvida
      }
    }
  }
  const retTotal = [...retByItem.values()].reduce((a, b) => a + b, 0);
  const remFrac = sale.commissionableCents > 0 ? new D(sale.commissionableCents - retTotal).div(sale.commissionableCents) : new D(0);
  const receiptsSorted = [...sale.receipts].sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));
  const last = events[events.length - 1] ?? null;
  return {
    sale, retEvents: events, retByItem, retQtyByItem, remFrac,
    dueNet: new D(sale.netCents).times(remFrac),
    received: receiptsSorted.reduce((a, r) => a.plus(r.amountCents), new D(0)),
    receiptsSorted, cancelled, lastReturnDate: last?.date ?? null, lastReturnId: last?.id ?? null, hasReturns: events.length > 0,
  };
}

interface Elig { ratio: Dec; eligibleAt: string; receiptId: string | null }

function eligibility(mode: EligibilityEvent, c: SaleCtx): Elig {
  const confirmed = c.sale.confirmedAt;
  if (mode === 'sale_confirmation') return { ratio: new D(1), eligibleAt: confirmed, receiptId: null };
  const last = c.receiptsSorted[c.receiptsSorted.length - 1] ?? null;
  if (c.dueNet.lte(0)) return { ratio: ZERO, eligibleAt: confirmed, receiptId: null };
  if (mode === 'full_receipt') {
    let cum = new D(0);
    for (const r of c.receiptsSorted) {
      cum = cum.plus(r.amountCents);
      if (cum.gte(c.dueNet)) return { ratio: new D(1), eligibleAt: r.date > confirmed ? r.date : confirmed, receiptId: r.id };
    }
    return { ratio: ZERO, eligibleAt: confirmed, receiptId: null };
  }
  const ratio = c.received.div(c.dueNet);
  return { ratio: ratio.gt(1) ? new D(1) : ratio, eligibleAt: last && last.date > confirmed ? last.date : confirmed, receiptId: last?.id ?? null };
}

// ------------------------------------------------------------------------------------------------ base por item
function marginBase(it: ItemFacts): Dec | null {
  if (it.costCents === null) return null;
  const m = it.commissionableCents - it.costCents;
  return new D(Math.max(0, m));
}

function receiptAllocations(c: SaleCtx, items: ItemFacts[]): Map<string, Map<string, Cents>> {
  // receiptId -> itemId -> centavos (maior resto, determinístico)
  const out = new Map<string, Map<string, Cents>>();
  const weights = items.map((i) => String(i.commissionableCents));
  if (weights.every((w) => w === '0')) return out;
  for (const r of c.receiptsSorted) {
    const alloc = allocateByWeights(r.amountCents, weights);
    out.set(r.id, new Map(items.map((i, ix) => [i.id, alloc[ix] ?? 0])));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ função principal
export function computeCommissions(input: ComputeInput): ComputeOutput {
  const pendencies: Pendency[] = [];
  const comps: Comp[] = [];
  const tierEvents: TierEvent[] = [];
  const processed = new Map<string, SaleCtx>();
  const protect: string[] = [];
  const bookedAll = input.booked;
  const bookedBySaleOwner = (saleId: string, ownerId: string): boolean => bookedAll.some((b) => b.componentKey.startsWith(ownerPrefix(saleId, ownerId)) && b.amountCents !== 0);

  const sales = [...input.sales].filter((s) => s.status !== 'draft').sort((a, b) => cmp(a.date, b.date) || cmp(a.number, b.number) || cmp(a.id, b.id));

  for (const sale of sales) {
    const ctx = prepareSale(sale, pendencies);
    if (!ctx) { protect.push(`c:${sale.id}:`); continue; }
    processed.set(sale.id, ctx);
    const items = [...sale.items].sort((a, b) => a.position - b.position || cmp(a.id, b.id));
    const parts = [...sale.participants].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || cmp(a.seller.id, b.seller.id));
    if (parts.length === 0) {
      pendencies.push({ code: 'NO_PARTICIPANT', severity: 'critical', message: 'Venda sem vendedor participante.', saleId: sale.id });
      protect.push(`c:${sale.id}:`);
      continue;
    }
    if (new Set(parts.map((p) => p.seller.id)).size !== parts.length) {
      pendencies.push({ code: 'DUPLICATE_PARTICIPANT', severity: 'critical', message: 'Vendedor repetido na venda.', saleId: sale.id });
      protect.push(`c:${sale.id}:`);
      continue;
    }
    let owners: ParticipantFacts[];
    if (sale.splitModel === 'pool') {
      if (parts.filter((p) => p.isPrimary).length !== 1) {
        pendencies.push({ code: 'POOL_PRIMARY_REQUIRED', severity: 'critical', message: 'Rateio em pool exige exatamente um participante principal.', saleId: sale.id });
        protect.push(`c:${sale.id}:`);
        continue;
      }
      if (!poolSumsTo100(parts.map((p) => p.allocationPct))) {
        pendencies.push({ code: 'POOL_SUM_INVALID', severity: 'critical', message: 'As participações do pool devem somar exatamente 100%.', saleId: sale.id });
        protect.push(`c:${sale.id}:`);
        continue;
      }
      owners = [parts[0]!];
    } else {
      owners = parts;
    }

    for (const owner of owners) {
      const sid = owner.seller.id;
      const prefix = ownerPrefix(sale.id, sid);
      const plan = owner.plan;
      if (!plan) {
        pendencies.push({ code: 'NO_PLAN', severity: 'critical', message: 'Vendedor sem plano de comissão vigente na data da venda.', saleId: sale.id, sellerId: sid });
        protect.push(prefix);
        continue;
      }
      if (ctx.cancelled && plan.returnsPolicy === 'manual') {
        protect.push(prefix);
        if (bookedBySaleOwner(sale.id, sid)) {
          pendencies.push({ code: 'SALE_CANCELLED_NEEDS_REVERSAL', severity: 'critical', message: 'Venda cancelada com comissão lançada: o plano exige estorno manual.', saleId: sale.id, sellerId: sid });
        }
        continue;
      }
      const ignoreReturns = plan.returnsPolicy === 'manual';
      if (ctx.hasReturns && ignoreReturns) {
        pendencies.push({ code: 'RETURN_NEEDS_REVIEW', severity: 'warning', message: 'Devolução registrada: o plano exige estorno manual.', saleId: sale.id, sellerId: sid });
      }
      // Na base «valor recebido» o próprio recebimento já é a base: aplicar a razão de recebimento de novo contaria duas vezes.
      const eligRaw = eligibility(plan.eligibility, ctx);
      const elig = plan.basis === 'received_value' ? { ...eligRaw, ratio: new D(1) } : eligRaw;
      const sharers = sale.splitModel === 'pool' ? parts : [owner];
      const weights = sale.splitModel === 'pool' ? parts.map((p) => p.allocationPct) : ['1'];
      const split = (total: Cents): Cents[] => (sharers.length === 1 ? [total] : allocateByWeights(total, weights));
      const effectiveRet = (id: string): Cents => (ignoreReturns ? 0 : ctx.retByItem.get(id) ?? 0);
      const reversalAt = ctx.lastReturnDate ?? sale.date;
      const cause: Comp['cause'] = ctx.cancelled ? 'cancellation' : ctx.hasReturns && !ignoreReturns ? 'return' : 'normal';
      const recAlloc = plan.basis === 'received_value' ? receiptAllocations(ctx, items) : new Map<string, Map<string, Cents>>();

      const pushComp = (p: { key: string; itemId: string | null; rule: Rule; base: Cents; rateText: string | null; potential: Dec; ratio: Dec; basisInfo: Record<string, unknown>; resolution: unknown; extra?: Record<string, unknown> }): void => {
        const potC = roundCents(p.potential);
        const eligC = p.ratio.eq(1) ? potC : roundCents(p.potential.times(p.ratio));
        const potSplit = split(potC);
        const eligSplit = split(eligC);
        comps.push({
          key: p.key, saleId: sale.id, itemId: p.itemId, ruleId: p.rule.id, planVersionId: plan.id,
          participants: sharers.map((s) => s.seller.id), targets: eligSplit, potentials: potSplit,
          base: p.base, rate: p.rateText, entryKind: p.rule.entryKind, eligibleAt: elig.eligibleAt, reversalAt,
          sourceReceiptId: elig.receiptId, sourceReturnId: ctx.lastReturnId, isReturnEvent: false, originalKey: p.key, cause,
          snapshot: {
            engine: ENGINE_VERSION, plan: { id: plan.id, name: plan.planName, version: plan.versionNumber },
            rule: { id: p.rule.id, name: p.rule.name, kind: p.rule.kind, priority: p.rule.priority, scope: p.rule.scopeType },
            resolution: p.resolution, basis: { type: plan.basis, ...p.basisInfo }, rate: p.rateText,
            potentialCents: potC,
            eligibility: { mode: plan.eligibility, ratio: p.ratio.toString(), receivedCents: ctx.received.toString(), dueNetCents: ctx.dueNet.toString() },
            eligibleCents: eligC,
            split: { model: sale.splitModel, shares: sharers.map((s, ix) => ({ sellerId: s.seller.id, pct: weights[ix], potentialCents: potSplit[ix], eligibleCents: eligSplit[ix] })) },
            returns: { policy: plan.returnsPolicy, count: ctx.retEvents.length, cancelled: ctx.cancelled },
            rounding: 'HALF_UP por componente (centavos)', ...p.extra,
          },
        });
      };

      const ruleCtxBase: Omit<RuleContext, 'itemNetCents' | 'itemQuantity' | 'productId' | 'categoryId'> = {
        date: sale.date, seller: owner.seller, channel: sale.channel, customerId: sale.customerId, saleNetCents: sale.netCents,
      };

      if (plan.basis === 'fixed_per_sale') {
        const res = resolveRules(plan, { ...ruleCtxBase, productId: null, categoryId: null, itemNetCents: null, itemQuantity: null });
        if (res.conflict) { pendencies.push({ code: 'RULE_CONFLICT', severity: 'critical', message: 'Regras em conflito para a venda.', saleId: sale.id, sellerId: sid }); protect.push(prefix); continue; }
        const rules = [res.winner, ...res.stackers].filter((r): r is Rule => r !== null);
        if (rules.length === 0) { pendencies.push({ code: 'NO_RULE_MATCH', severity: 'warning', message: 'Nenhuma regra se aplica à venda.', saleId: sale.id, sellerId: sid }); protect.push(prefix); continue; }
        for (const rule of rules) {
          const potential = ctx.remFrac.gt(0) || ignoreReturns ? new D(rule.fixedAmountCents ?? 0) : ZERO;
          pushComp({ key: baseKey(sale.id, sid, '-', rule.id), itemId: null, rule, base: sale.commissionableCents, rateText: null, potential, ratio: elig.ratio, basisInfo: { fixedAmountCents: rule.fixedAmountCents, perSale: true }, resolution: res.considered });
        }
        continue;
      }

      for (const item of items) {
        const res = resolveRules(plan, { ...ruleCtxBase, productId: item.productId, categoryId: item.categoryId, itemNetCents: item.netCents, itemQuantity: item.quantity });
        const itemPrefix = `c:${sale.id}:${sid}:${item.id}:`;
        if (res.conflict) { pendencies.push({ code: 'RULE_CONFLICT', severity: 'critical', message: `Regras em conflito para o item ${item.position}.`, saleId: sale.id, sellerId: sid }); protect.push(itemPrefix); continue; }
        const rules = [res.winner, ...res.stackers].filter((r): r is Rule => r !== null);
        if (rules.length === 0) { pendencies.push({ code: 'NO_RULE_MATCH', severity: 'warning', message: `Nenhuma regra se aplica ao item ${item.position}.`, saleId: sale.id, sellerId: sid }); protect.push(itemPrefix); continue; }

        const ret = effectiveRet(item.id);
        const remItem = item.commissionableCents - ret;
        // base por item (Dec exato) conforme a base do plano
        let itemBase: Dec;
        let basisInfo: Record<string, unknown>;
        if (plan.basis === 'net_value') {
          itemBase = new D(remItem);
          basisInfo = { commissionableCents: item.commissionableCents, returnedCents: ret, baseCents: remItem };
        } else if (plan.basis === 'gross_margin') {
          const m = marginBase(item);
          if (m === null) {
            pendencies.push({ code: 'MISSING_COST', severity: 'critical', message: `Item ${item.position} sem custo: base margem exige custo informado (nunca presumido zero).`, saleId: sale.id, sellerId: sid });
            protect.push(itemPrefix);
            continue;
          }
          itemBase = item.commissionableCents > 0 ? m.times(remItem).div(item.commissionableCents) : ZERO;
          basisInfo = { commissionableCents: item.commissionableCents, costCents: item.costCents, marginCents: m.toString(), returnedCents: ret, baseCents: itemBase.toString() };
        } else if (plan.basis === 'received_value') {
          let got = 0;
          for (const m of recAlloc.values()) got += m.get(item.id) ?? 0;
          const capped = Math.min(got, Math.max(0, remItem));
          itemBase = new D(capped);
          basisInfo = { receivedAllocatedCents: got, cappedAtCents: remItem, baseCents: capped };
        } else {
          // fixed_per_unit
          itemBase = ZERO;
          basisInfo = {};
        }

        for (const rule of rules) {
          const key = baseKey(sale.id, sid, item.id, rule.id);
          if (rule.kind === 'tiered') {
            if (!rule.tier) { pendencies.push({ code: 'RULE_TIER_MISSING', severity: 'critical', message: 'Regra por faixas sem faixas.', saleId: sale.id, sellerId: sid }); protect.push(itemPrefix); continue; }
            const t = rule.tier;
            const groupScope = t.scope === 'team' ? `team:${owner.seller.teamId ?? 'none'}` : `seller:${sid}`;
            const mk = (kind: TierEvent['kind'], eventId: string, date: string, base: Dec, periodDate: string, k: string): void => {
              tierEvents.push({
                ctx, owner, plan, rule, itemId: item.id, key: k, originalKey: key, kind, eventId, date, period: periodKey(periodDate, t.period), base,
                groupKey: `${rule.id}|${groupScope}|${periodKey(periodDate, t.period)}`,
                order: `${date}|${sale.number}|${String(item.position).padStart(6, '0')}|${kind === 'item' ? 0 : kind === 'rcpt' ? 1 : 2}|${eventId}`,
                ratio: elig.ratio, eligibleAt: elig.eligibleAt, participants: sharers, resolution: res.considered,
              });
            };
            if (plan.basis === 'received_value') {
              for (const r of ctx.receiptsSorted) {
                const a = recAlloc.get(r.id)?.get(item.id) ?? 0;
                if (a !== 0) mk('rcpt', r.id, r.date, new D(a), r.date, `${key}:rcpt:${r.id}`);
              }
              if (ctx.hasReturns && !ignoreReturns) {
                pendencies.push({ code: 'RETURN_NEEDS_REVIEW', severity: 'warning', message: 'Base «valor recebido» com faixas: registre o reembolso estornando o recebimento.', saleId: sale.id, sellerId: sid });
              }
            } else {
              const positive = plan.basis === 'gross_margin' ? (marginBase(item) ?? ZERO) : new D(item.commissionableCents);
              mk('item', item.id, sale.date, positive, sale.date, key);
              if (!ignoreReturns) {
                for (const ev of ctx.retEvents) {
                  const c = ev.perItem.get(item.id) ?? 0;
                  if (c === 0) continue;
                  const neg = plan.basis === 'gross_margin' ? (item.commissionableCents > 0 ? positive.times(c).div(item.commissionableCents) : ZERO) : new D(c);
                  mk('ret', ev.id, ev.date, neg.negated(), sale.date, `${key}:ret:${ev.id}`);
                }
              }
            }
            continue;
          }
          if (rule.kind === 'percentage') {
            const r = parseRate(rule.rate ?? '0');
            pushComp({ key, itemId: item.id, rule, base: roundCents(itemBase), rateText: rule.rate, potential: itemBase.times(r), ratio: elig.ratio, basisInfo, resolution: res.considered });
          } else {
            // fixed (por unidade)
            const qtyValid = dec(item.quantity).minus(ignoreReturns ? 0 : ctx.retQtyByItem.get(item.id) ?? 0);
            const q = qtyValid.lt(0) ? ZERO : qtyValid;
            pushComp({ key, itemId: item.id, rule, base: item.commissionableCents, rateText: null, potential: q.times(rule.fixedAmountCents ?? 0), ratio: elig.ratio, basisInfo: { quantity: item.quantity, validQuantity: q.toString(), fixedAmountCents: rule.fixedAmountCents }, resolution: res.considered });
          }
        }
      }
    }
  }

  // ---- faixas: eventos agrupados por (regra, escopo, período), acumulados em ordem cronológica determinística
  const groups = new Map<string, TierEvent[]>();
  for (const e of tierEvents) groups.set(e.groupKey, [...(groups.get(e.groupKey) ?? []), e]);
  for (const [gk, evs] of [...groups.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    evs.sort((a, b) => cmp(a.order, b.order) || cmp(a.key, b.key));
    const t = evs[0]!.rule.tier!;
    let cum = new D(0);
    let prevR = 0;
    for (const e of evs) {
      const before = cum;
      cum = cum.plus(e.base);
      const exact = tierAmount(cum, t.bands, t.mode);
      const rounded = roundCents(exact);
      const inc = rounded - prevR;
      prevR = rounded;
      const elC = e.ratio.eq(1) ? inc : roundCents(new D(inc).times(e.ratio));
      const sharers = e.participants;
      const weights = e.ctx.sale.splitModel === 'pool' ? sharers.map((p) => p.allocationPct) : ['1'];
      const split = (total: Cents): Cents[] => (sharers.length === 1 ? [total] : allocateByWeights(total, weights));
      const potSplit = split(inc);
      const eligSplit = split(elC);
      comps.push({
        key: e.key, saleId: e.ctx.sale.id, itemId: e.itemId, ruleId: e.rule.id, planVersionId: e.plan.id,
        participants: sharers.map((s) => s.seller.id), targets: eligSplit, potentials: potSplit,
        base: roundCents(e.base), rate: null, entryKind: e.rule.entryKind, eligibleAt: e.kind === 'ret' ? e.date : e.eligibleAt, reversalAt: e.date,
        sourceReceiptId: e.kind === 'rcpt' ? e.eventId : null, sourceReturnId: e.kind === 'ret' ? e.eventId : null, isReturnEvent: e.kind === 'ret',
        originalKey: e.originalKey, cause: e.kind === 'ret' ? (e.ctx.cancelled ? 'cancellation' : 'return') : 'normal',
        snapshot: {
          engine: ENGINE_VERSION, plan: { id: e.plan.id, name: e.plan.planName, version: e.plan.versionNumber },
          rule: { id: e.rule.id, name: e.rule.name, kind: 'tiered', mode: t.mode, period: t.period, scope: t.scope }, resolution: e.resolution,
          basis: { type: e.plan.basis, eventKind: e.kind, eventId: e.eventId, baseCents: e.base.toString() },
          tier: { group: gk, cumulativeBeforeCents: before.toString(), cumulativeAfterCents: cum.toString(), exactCommission: exact.toString(), roundedCumulativeCents: rounded, rows: tierBreakdown(cum, t.bands, t.mode) },
          potentialCents: inc,
          eligibility: { mode: e.plan.eligibility, ratio: e.ratio.toString() }, eligibleCents: elC,
          split: { model: e.ctx.sale.splitModel, shares: sharers.map((s, ix) => ({ sellerId: s.seller.id, pct: weights[ix], potentialCents: potSplit[ix], eligibleCents: eligSplit[ix] })) },
          rounding: 'HALF_UP sobre o acumulado da faixa; lançamento = diferença entre acumulados arredondados',
        },
      });
    }
  }

  return reconcile(comps, bookedAll, processed, protect, pendencies);
}

// ------------------------------------------------------------------------------------------------ alvo × livro
export function reconcile(comps: Comp[], booked: BookedEntry[], processed: Map<string, SaleCtx>, protect: string[], pendencies: Pendency[]): ComputeOutput {
  const bookedBy = new Map<string, BookedEntry[]>();
  for (const b of booked) bookedBy.set(`${b.componentKey}|${b.sellerId}`, [...(bookedBy.get(`${b.componentKey}|${b.sellerId}`) ?? []), b]);
  const entries: NewEntry[] = [];
  const details: CalcDetail[] = [];
  const firstPositive = new Map<string, string>(); // `${key}|${seller}` -> idempotencyKey do 1º lançamento positivo

  for (const [k, list] of bookedBy) {
    const pos = list.find((b) => b.amountCents > 0);
    if (pos) firstPositive.set(k, pos.idempotencyKey);
  }
  const have = new Set(comps.map((c) => c.key));
  const ordered = [...comps].sort((a, b) => Number(a.isReturnEvent) - Number(b.isReturnEvent) || cmp(a.key, b.key));

  const emit = (c: { key: string; saleId: string | null; itemId: string | null; ruleId: string | null; planVersionId: string; entryKind: EntryKind; eligibleAt: string; reversalAt: string; sourceReceiptId: string | null; sourceReturnId: string | null; isReturnEvent: boolean; originalKey: string; cause: Comp['cause'] }, sellerId: string, target: Cents): void => {
    const here = bookedBy.get(`${c.key}|${sellerId}`) ?? [];
    const sum = here.reduce((a, b) => a + b.amountCents, 0);
    const delta = target - sum;
    if (delta === 0) return;
    const n = here.length + 1;
    let cause: EntryCause;
    let type: EntryType;
    let date: string;
    let source: string | null;
    if (delta > 0) {
      cause = here.length === 0 ? 'initial' : c.sourceReceiptId ? 'receipt' : 'recalculation';
      type = here.length > 0 && cause === 'recalculation' ? 'adjustment_positive' : c.entryKind;
      date = c.eligibleAt;
      source = cause === 'receipt' || cause === 'initial' ? c.sourceReceiptId : null;
    } else {
      cause = c.cause === 'cancellation' ? 'cancellation' : c.cause === 'return' ? 'return' : 'recalculation';
      type = cause === 'recalculation' ? 'adjustment_negative' : 'reversal';
      date = c.reversalAt;
      source = cause === 'recalculation' ? null : c.sourceReturnId;
    }
    const origin = c.isReturnEvent ? firstPositive.get(`${c.originalKey}|${sellerId}`) ?? null : firstPositive.get(`${c.key}|${sellerId}`) ?? null;
    const idem = `${c.key}|${sellerId}#${n}`;
    entries.push({
      idempotencyKey: idem, componentKey: c.key, sellerId, saleId: c.saleId, itemId: c.itemId, planVersionId: c.planVersionId, ruleId: c.ruleId,
      entryType: type, amountCents: delta, effectiveAt: date, eligibleAt: date, originalIdempotencyKey: delta < 0 ? origin : null,
      cause, sourceEventId: source,
    });
    if (delta > 0 && !firstPositive.has(`${c.key}|${sellerId}`)) firstPositive.set(`${c.key}|${sellerId}`, idem);
    // próximo ciclo da mesma execução enxerga o lançamento (evita 2 lançamentos para o mesmo par)
    bookedBy.set(`${c.key}|${sellerId}`, [...here, { id: '', idempotencyKey: idem, componentKey: c.key, saleId: c.saleId, itemId: c.itemId, planVersionId: c.planVersionId, ruleId: c.ruleId, sellerId, entryType: type, amountCents: delta }]);
  };

  for (const c of ordered) {
    c.participants.forEach((sellerId, ix) => {
      details.push({
        componentKey: c.key, saleId: c.saleId, itemId: c.itemId, sellerId, planVersionId: c.planVersionId, ruleId: c.ruleId, baseCents: c.base, rate: c.rate,
        potentialCents: c.potentials[ix] ?? 0, eligibleCents: c.targets[ix] ?? 0, snapshot: c.snapshot,
      });
      emit(c, sellerId, c.targets[ix] ?? 0);
    });
  }

  // Componentes que existiam no livro e sumiram dos fatos (ex.: recebimento estornado): alvo zero — nunca em vendas protegidas.
  const seen = new Set<string>();
  for (const b of booked) {
    if (!b.componentKey.startsWith('c:') || have.has(b.componentKey) || !b.saleId) continue;
    const ctx = processed.get(b.saleId);
    if (!ctx || protect.some((p) => b.componentKey.startsWith(p))) continue;
    const dedupe = `${b.componentKey}|${b.sellerId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    emit(
      { key: b.componentKey, saleId: b.saleId, itemId: b.itemId, ruleId: b.ruleId, planVersionId: b.planVersionId, entryKind: 'commission', eligibleAt: ctx.sale.date, reversalAt: ctx.lastReturnDate ?? ctx.sale.date, sourceReceiptId: null, sourceReturnId: ctx.lastReturnId, isReturnEvent: false, originalKey: b.componentKey, cause: ctx.cancelled ? 'cancellation' : 'normal' },
      b.sellerId, 0,
    );
  }
  return { details, entries, pendencies };
}

export { CommissionError };
