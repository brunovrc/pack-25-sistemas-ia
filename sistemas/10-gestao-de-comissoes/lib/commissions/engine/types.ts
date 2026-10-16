// Tipos do motor de comissões. Entradas são FATOS já resolvidos pelo servidor (datas no fuso da empresa, plano vigente por vendedor);
// o motor é puro: sem I/O, sem relógio, sem aleatoriedade. Mesma entrada + mesma versão do plano ⇒ mesmo resultado.
import type { Cents } from './decimal';

export type Basis = 'net_value' | 'received_value' | 'gross_margin' | 'fixed_per_sale' | 'fixed_per_unit';
export type EligibilityEvent = 'sale_confirmation' | 'full_receipt' | 'proportional_receipt';
export type RuleKind = 'percentage' | 'fixed' | 'tiered';
export type TierMode = 'marginal' | 'reached';
export type TierPeriod = 'month' | 'quarter' | 'year';
export type TierScope = 'individual' | 'team';
export type SplitModel = 'pool' | 'independent';
export type ReturnsPolicy = 'proportional' | 'manual';
export type Dimension = 'seller' | 'team' | 'product' | 'category' | 'channel';
export type ScopeType = 'organization' | Dimension;
export type StackBehavior = 'exclusive' | 'stack';
export type EntryKind = 'commission' | 'bonus';
export type EntryType = 'commission' | 'bonus' | 'adjustment_positive' | 'adjustment_negative' | 'reversal';
export type SaleStatus = 'draft' | 'confirmed' | 'partially_returned' | 'cancelled' | 'totally_returned';

// ---- condições (JSON declarativo; sem código arbitrário) ------------------------------------------------
export type Fact = 'seller.id' | 'seller.team_id' | 'seller.type' | 'product.id' | 'product.category_id' | 'sale.channel' | 'customer.id' | 'sale.net_cents' | 'item.net_cents' | 'item.quantity';
export type Op = 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
export type Leaf = { fact: Fact; op: Op; value: string | number | Array<string | number> };
export type Condition = Leaf | { all: Condition[] } | { any: Condition[] } | { not: Condition };

// ---- planos ---------------------------------------------------------------------------------------------
export interface Tier {
  order: number;
  /** Limite inferior EXCLUSIVO em centavos (a primeira faixa começa em 0). */
  fromCents: Cents;
  /** Limite superior INCLUSIVO em centavos; null = sem teto (obrigatório na última faixa). */
  toCents: Cents | null;
  rate: string;
}

export interface Rule {
  id: string;
  name: string;
  kind: RuleKind;
  scopeType: ScopeType;
  /** id do vendedor/equipe/produto/categoria ou nome do canal; null para escopo da organização. */
  scopeReference: string | null;
  conditions: Condition | null;
  rate: string | null;
  fixedAmountCents: Cents | null;
  tier: { mode: TierMode; period: TierPeriod; scope: TierScope; bands: Tier[] } | null;
  priority: number;
  stack: StackBehavior;
  entryKind: EntryKind;
  enabled: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

export interface PlanVersionConfig {
  id: string;
  planId: string;
  planName: string;
  versionNumber: number;
  basis: Basis;
  eligibility: EligibilityEvent;
  returnsPolicy: ReturnsPolicy;
  /** Ordem de precedência: conjuntos de dimensões, do mais específico ao mais geral. [] = escopo da organização. */
  precedence: Dimension[][];
  rules: Rule[];
}

// ---- fatos de venda -------------------------------------------------------------------------------------
export interface SellerFacts { id: string; teamId: string | null; type: 'internal' | 'external' | 'partner' }

export interface ParticipantFacts {
  seller: SellerFacts;
  isPrimary: boolean;
  /** Percentual de participação em texto decimal («60», «33.3333»). */
  allocationPct: string;
  /** Versão do plano vigente do vendedor na data da venda (resolvida no servidor); null = sem plano. */
  plan: PlanVersionConfig | null;
}

export interface ItemFacts {
  id: string;
  position: number;
  productId: string | null;
  categoryId: string | null;
  quantity: string;
  netCents: Cents;
  commissionableCents: Cents;
  /** Custo direto da linha (base margem). null = indisponível (nunca presumir zero). */
  costCents: Cents | null;
}

export interface ReceiptFact { id: string; date: string; amountCents: Cents }
export interface ReturnFact {
  id: string;
  date: string;
  amountCents: Cents;
  /** Valor devolvido por item (centavos, base comissionável). Ausente ⇒ rateio proporcional entre os itens. */
  itemAmounts?: Record<string, Cents>;
  /** Quantidade devolvida por item (texto decimal) — usada na comissão fixa por unidade. */
  itemQuantities?: Record<string, string>;
}

export interface SaleFacts {
  id: string;
  number: string;
  /** Data da venda (AAAA-MM-DD, fuso da empresa). */
  date: string;
  /** Data da confirmação (AAAA-MM-DD). */
  confirmedAt: string;
  /** Data do cancelamento (AAAA-MM-DD), quando status = cancelled/totally_returned. */
  cancelledAt?: string | null;
  /** Primeira venda do cliente (para metas de «novos clientes»). */
  newCustomer?: boolean;
  status: SaleStatus;
  channel: string | null;
  customerId: string | null;
  netCents: Cents;
  commissionableCents: Cents;
  splitModel: SplitModel;
  items: ItemFacts[];
  participants: ParticipantFacts[];
  /** Somente recebimentos ativos (não estornados) alocados a esta venda. */
  receipts: ReceiptFact[];
  returns: ReturnFact[];
}

// ---- livro (lançamentos) --------------------------------------------------------------------------------
export interface BookedEntry {
  id: string;
  idempotencyKey: string;
  componentKey: string;
  saleId: string | null;
  itemId: string | null;
  planVersionId: string;
  ruleId: string | null;
  sellerId: string;
  entryType: EntryType;
  amountCents: Cents;
}

export type EntryCause = 'initial' | 'receipt' | 'return' | 'cancellation' | 'recalculation' | 'goal';

export interface NewEntry {
  /** `${componentKey}|${sellerId}#${n}` — única por empresa: reprocessar/reimportar não duplica. */
  idempotencyKey: string;
  componentKey: string;
  sellerId: string;
  saleId: string | null;
  itemId: string | null;
  planVersionId: string;
  ruleId: string | null;
  entryType: EntryType;
  /** Com sinal: comissão/bônus/ajuste+ > 0; ajuste−/estorno < 0. */
  amountCents: Cents;
  effectiveAt: string;
  eligibleAt: string;
  /** Chave de idempotência do lançamento original (resolvida para id na persistência). */
  originalIdempotencyKey: string | null;
  cause: EntryCause;
  sourceEventId: string | null;
}

export interface CalcDetail {
  componentKey: string;
  saleId: string | null;
  itemId: string | null;
  sellerId: string;
  planVersionId: string;
  ruleId: string | null;
  baseCents: Cents;
  rate: string | null;
  /** Comissão calculada (potencial), antes da elegibilidade. */
  potentialCents: Cents;
  /** Parcela já elegível (alvo do livro). */
  eligibleCents: Cents;
  /** Memória de cálculo legível por máquina e por pessoas. */
  snapshot: Record<string, unknown>;
}

export interface Pendency {
  code: string;
  severity: 'critical' | 'warning';
  message: string;
  saleId?: string;
  sellerId?: string;
}

export interface ComputeInput {
  sales: SaleFacts[];
  booked: BookedEntry[];
}

export interface ComputeOutput {
  details: CalcDetail[];
  entries: NewEntry[];
  pendencies: Pendency[];
}
