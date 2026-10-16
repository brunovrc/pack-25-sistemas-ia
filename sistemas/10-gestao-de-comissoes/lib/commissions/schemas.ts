// Validação de entrada no servidor (Zod). Dinheiro e percentuais chegam como texto brasileiro e viram centavos/taxa decimal exatos pelo motor.
import { z } from 'zod';
import { isIsoDate } from './query';
import { parseCondition, parseMoneyToCents, parsePercentToRate } from './engine';

const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export const uuid = z.uuid('Identificador inválido.');
export const optUuid = z.preprocess((v) => (empty(v) ? null : v), z.uuid('Identificador inválido.').nullable());
export const text = (label: string, min = 1, max = 200) =>
  z.string({ error: `${label} é obrigatório.` }).trim().min(min, min === 1 ? `${label} é obrigatório.` : `${label}: mínimo de ${min} caracteres.`).max(max, `${label}: máximo de ${max} caracteres.`);
export const optText = (max = 300) => z.preprocess((v) => (empty(v) ? null : v), z.string().trim().max(max, `Máximo de ${max} caracteres.`).nullable());
export const bool = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

export const isoDate = (label = 'Data') => z.string({ error: `${label} é obrigatória.` }).trim().refine(isIsoDate, `${label} inválida.`);
export const optIsoDate = (label = 'Data') => z.preprocess((v) => (empty(v) ? null : v), z.string().trim().refine(isIsoDate, `${label} inválida.`).nullable());

const isMoney = (v: string) => { try { parseMoneyToCents(v); return true; } catch { return false; } };
/** Valor em reais («1.234,56») → centavos inteiros exatos. */
export const money = (label = 'Valor', opts: { positive?: boolean; allowZero?: boolean } = {}) =>
  z.string({ error: `${label} é obrigatório.` }).trim().min(1, `${label} é obrigatório.`).refine(isMoney, `${label}: use o formato 1.234,56.`).transform((v) => parseMoneyToCents(v))
    .refine((c) => (opts.allowZero ? c >= 0 : opts.positive === false ? true : c > 0), opts.allowZero ? `${label} não pode ser negativo.` : `${label} deve ser maior que zero.`);
export const optMoney = (label = 'Valor') => z.preprocess((v) => (empty(v) ? null : v), money(label, { allowZero: true }).nullable());

const isPercent = (v: string) => { try { parsePercentToRate(v); return true; } catch { return false; } };
/** «5%», «5,5» → taxa decimal em texto («0.05»). */
export const percent = (label = 'Percentual') => z.string({ error: `${label} é obrigatório.` }).trim().min(1, `${label} é obrigatório.`).refine(isPercent, `${label}: informe entre 0% e 100% (ex.: 5 ou 5,5).`).transform((v) => parsePercentToRate(v));
/** Percentual de participação (0–100, até 6 casas) em texto decimal. */
export const share = (label = 'Participação') => z.string({ error: `${label} é obrigatória.` }).trim().regex(/^\d{1,3}([.,]\d{1,6})?$/, `${label}: use um número entre 0 e 100.`)
  .transform((v) => v.replace(',', '.')).refine((v) => Number(v) > 0 && Number(v) <= 100, `${label} deve ficar entre 0 e 100.`);
export const decimalQty = (label = 'Quantidade') => z.string({ error: `${label} é obrigatória.` }).trim().regex(/^\d{1,10}([.,]\d{1,4})?$/, `${label}: use um número (até 4 casas).`)
  .transform((v) => v.replace(',', '.')).refine((v) => Number(v) > 0, `${label} deve ser maior que zero.`);

export const idSchema = z.object({ id: uuid });

// ----------------------------------------------------------------------------- cadastros
export const teamSchema = z.object({ id: optUuid, name: text('Nome da equipe', 2, 80), description: optText(300), manager_user: optUuid, active: bool });
export const sellerSchema = z.object({
  id: optUuid, name: text('Nome', 2, 120), seller_code: text('Código', 1, 30).regex(/^[A-Za-z0-9._-]+$/, 'Código: use letras, números, ponto, hífen ou sublinhado.'),
  seller_type: z.enum(['internal', 'external', 'partner'], { error: 'Tipo inválido.' }), team_id: optUuid, user_id: optUuid, starts_at: isoDate('Data de início'), ends_at: optIsoDate('Data de encerramento'),
  notes: optText(1000), status: z.enum(['active', 'inactive', 'archived'], { error: 'Status inválido.' }), effective: optIsoDate('Data efetiva'),
});
export const customerSchema = z.object({ id: optUuid, name: text('Nome', 2, 160), legal_name: optText(200), document_number: optText(20), email: optText(200), phone: optText(40) });
export const categorySchema = z.object({ id: optUuid, name: text('Nome', 2, 80), description: optText(300), active: bool });
export const productSchema = z.object({ id: optUuid, sku: text('SKU', 1, 40).regex(/^[A-Za-z0-9._-]+$/, 'SKU: use letras, números, ponto, hífen ou sublinhado.'), name: text('Nome', 2, 160), category_id: optUuid, description: optText(500), active: bool });
export const accessSchema = z.object({ user_id: uuid, profile: z.enum(['finance', 'seller', 'none'], { error: 'Perfil inválido.' }) });
export const settingsSchema = z.object({
  timezone: text('Fuso horário', 3, 60), date_format: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD']), negative_balance_policy: z.enum(['carry_forward', 'manual_review']),
  adjustment_approval_required: bool, segregation_of_duties: bool, allow_payout_over_balance: bool, allow_receipt_over_sale: bool, statement_template: z.enum(['standard', 'compact']), statement_footer: optText(300),
});

// ----------------------------------------------------------------------------- planos
export const planCreateSchema = z.object({
  name: text('Nome do plano', 2, 100), description: optText(500),
  basis: z.enum(['net_value', 'received_value', 'gross_margin', 'fixed_per_sale', 'fixed_per_unit'], { error: 'Base inválida.' }),
  eligibility: z.enum(['sale_confirmation', 'full_receipt', 'proportional_receipt'], { error: 'Elegibilidade inválida.' }),
  plan_type: z.enum(['individual', 'team', 'campaign']), returns_policy: z.enum(['proportional', 'manual']),
}).refine((v) => v.basis !== 'received_value' || v.eligibility === 'proportional_receipt', { path: ['eligibility'], message: 'A base «valor recebido» exige elegibilidade proporcional ao recebimento.' });
export const planUpdateSchema = z.object({ id: uuid, name: text('Nome do plano', 2, 100), description: optText(500), status: z.enum(['active', 'archived']) });

const dim = z.enum(['seller', 'team', 'product', 'category', 'channel']);
const bandSchema = z.object({ order: z.number().int().min(1).max(50), from: z.string(), to: z.string().nullable(), rate: z.string() });
export const ruleInputSchema = z.object({
  name: text('Nome da regra', 2, 100), rule_type: z.enum(['percentage', 'fixed', 'tiered']), scope_type: z.enum(['organization', 'team', 'seller', 'category', 'product', 'channel']).default('organization'),
  scope_reference: optText(80), conditions: z.unknown().optional(), rate: z.string().optional().nullable(), fixed: z.string().optional().nullable(),
  tier: z.object({ mode: z.enum(['marginal', 'reached']), period: z.enum(['month', 'quarter', 'year']), scope: z.enum(['individual', 'team']), bands: z.array(bandSchema).min(1).max(20) }).optional().nullable(),
  priority: z.number().int().min(-1000).max(1000).default(0), stack: z.enum(['exclusive', 'stack']).default('exclusive'), entry_kind: z.enum(['commission', 'bonus']).default('commission'),
  enabled: z.boolean().default(true), valid_from: optIsoDate('Início da vigência da regra'), valid_until: optIsoDate('Fim da vigência da regra'),
});
export const planDraftSchema = z.object({ version_id: uuid, precedence: z.array(z.array(dim).max(5)).max(20).optional(), rules: z.array(ruleInputSchema).max(60) });

export type RuleInput = z.infer<typeof ruleInputSchema>;
/** Converte o que o editor envia (textos brasileiros) no JSON normalizado que a função cm_save_plan_draft espera. */
export function normalizeRules(rules: RuleInput[]): { ok: true; rules: unknown[] } | { ok: false; message: string } {
  const out: unknown[] = [];
  for (const [i, r] of rules.entries()) {
    const tag = `Regra ${i + 1} («${r.name}»)`;
    try {
      let conditions: unknown = null;
      if (r.conditions !== undefined && r.conditions !== null && !(typeof r.conditions === 'object' && Object.keys(r.conditions as object).length === 0)) conditions = parseCondition(r.conditions);
      const base = { name: r.name, rule_type: r.rule_type, scope_type: r.scope_type, scope_reference: r.scope_type === 'organization' ? null : r.scope_reference, conditions, priority: r.priority, stack_behavior: r.stack, entry_kind: r.entry_kind, enabled: r.enabled, valid_from: r.valid_from, valid_until: r.valid_until };
      if (r.rule_type === 'percentage') out.push({ ...base, rate: parsePercentToRate(r.rate ?? '') });
      else if (r.rule_type === 'fixed') out.push({ ...base, fixed_amount_cents: parseMoneyToCents(r.fixed ?? '') });
      else {
        if (!r.tier) return { ok: false, message: `${tag}: informe as faixas.` };
        out.push({ ...base, tier: { mode: r.tier.mode, period: r.tier.period, scope: r.tier.scope, bands: r.tier.bands.map((b) => ({ order: b.order, from_cents: parseMoneyToCents(b.from), to_cents: b.to === null || b.to.trim() === '' ? null : parseMoneyToCents(b.to), rate: parsePercentToRate(b.rate) })) } });
      }
    } catch (e) {
      return { ok: false, message: `${tag}: ${e instanceof Error ? e.message : 'valor inválido'}` };
    }
  }
  return { ok: true, rules: out };
}
export const publishSchema = z.object({ version_id: uuid, valid_from: isoDate('Início da vigência') });
export const assignSchema = z.object({ seller_id: uuid, plan_id: uuid, valid_from: isoDate('Início da vigência') });

// ----------------------------------------------------------------------------- vendas
export const saleItemSchema = z.object({
  product_id: optUuid, description: optText(200), quantity: decimalQty('Quantidade'), unit_price: money('Preço unitário', { allowZero: true }), discount: optMoney('Desconto'),
  commissionable: optMoney('Base comissionável'), cost: optMoney('Custo'),
});
export const saleParticipantSchema = z.object({ seller_id: uuid, allocation: share('Participação'), primary: z.boolean() });
export const saleDraftSchema = z.object({
  id: optUuid, sale_number: text('Número da venda', 1, 40), external_reference: optText(80), sale_date: isoDate('Data da venda'), channel: optText(40), customer_id: optUuid,
  split_model: z.enum(['pool', 'independent']), items: z.array(saleItemSchema).min(1, 'Informe ao menos um item.').max(500), participants: z.array(saleParticipantSchema).min(1, 'Informe ao menos um vendedor.').max(20),
  confirm: z.boolean().default(false),
});
export const cancelSaleSchema = z.object({ id: uuid, reason: text('Motivo', 5, 500), date: optIsoDate('Data do cancelamento') });
export const returnSchema = z.object({ sale_id: uuid, amount: money('Valor devolvido'), date: isoDate('Data da devolução'), reason: optText(300), event_id: optText(80) });
export const receiptSchema = z.object({ sale_id: uuid, amount: money('Valor recebido'), date: isoDate('Data do recebimento'), reference: optText(80), notes: optText(300) });
export const reverseReceiptSchema = z.object({ id: uuid, reason: text('Motivo', 5, 300) });

// ----------------------------------------------------------------------------- aprovação, contestação, ajustes
export const reviewSchema = z.object({ ids: z.array(uuid).min(1, 'Selecione ao menos um lançamento.').max(500), decision: z.enum(['submit', 'approve', 'reject', 'reopen']), justification: optText(1000) });
export const disputeOpenSchema = z.object({ entry_id: uuid, description: text('Descrição', 10, 2000) });
export const disputeRespondSchema = z.object({ id: uuid, status: z.enum(['in_review', 'resolved', 'rejected']), resolution: optText(2000), adjustment_entry: optUuid });
export const adjustmentSchema = z.object({
  seller_id: uuid, type: z.enum(['positive', 'negative', 'exceptional_bonus', 'calculation_correction', 'administrative_reversal']), direction: z.enum(['credit', 'debit']).optional(),
  amount: money('Valor'), reason: text('Motivo', 10, 1000), reference: optText(120), related_entry: optUuid, effective_at: optIsoDate('Data efetiva'),
});
export const adjustmentDecisionSchema = z.object({ id: uuid, decision: z.enum(['approve', 'reject']), note: optText(500) });

// ----------------------------------------------------------------------------- fechamento e pagamentos
export const periodSchema = z.object({ start: isoDate('Início'), end: isoDate('Fim') }).refine((v) => v.end >= v.start, { path: ['end'], message: 'O fim deve ser igual ou posterior ao início.' });
export const periodIdSchema = z.object({ id: uuid });
export const reopenSchema = z.object({ id: uuid, reason: text('Justificativa', 20, 1000) });
export const cancelPeriodSchema = z.object({ id: uuid, reason: text('Motivo', 5, 1000) });
export const payoutSchema = z.object({
  seller_id: uuid, closing_id: uuid, amount: money('Valor pago'), date: isoDate('Data do pagamento'), method: z.enum(['pix', 'ted', 'doc', 'boleto', 'cash', 'external_payroll', 'other']),
  reference: optText(120), notes: optText(500),
});
export const reversePayoutSchema = z.object({ id: uuid, reason: text('Motivo', 5, 500) });

// ----------------------------------------------------------------------------- metas
export const goalSchema = z.object({
  id: optUuid, name: text('Nome da meta', 2, 100), goal_type: z.enum(['sold_value', 'received_value', 'sales_count', 'new_customers', 'product_value', 'product_units']),
  target: z.string().trim().min(1, 'Informe a meta.'), period_start: isoDate('Início do período'), period_end: isoDate('Fim do período'),
  scope_type: z.enum(['seller', 'team', 'organization']), scope_reference_id: optUuid, product_id: optUuid,
  bonus_plan_id: optUuid, threshold: z.string().trim().default('100'), bonus_type: z.enum(['fixed', 'rate']).default('fixed'), bonus_amount: z.string().trim().default(''), bonus_rate: z.string().trim().default(''),
  award_timing: z.enum(['on_attainment', 'period_end']).default('period_end'), distribution: z.enum(['each', 'proportional']).default('each'),
}).refine((v) => v.period_end >= v.period_start, { path: ['period_end'], message: 'O fim deve ser igual ou posterior ao início.' })
  .refine((v) => (v.scope_type === 'organization') === (v.scope_reference_id === null), { path: ['scope_reference_id'], message: 'Escolha o vendedor ou a equipe da meta.' })
  .refine((v) => !['product_value', 'product_units'].includes(v.goal_type) || !!v.product_id, { path: ['product_id'], message: 'Escolha o produto da meta.' });

// ----------------------------------------------------------------------------- avisos e simulações
export const prefSchema = z.object({ type: text('Tipo', 1, 60), enabled: bool });
export const simulationSaveSchema = z.object({ name: text('Nome', 2, 100), input: z.string().max(16000), result: z.string().max(60000) });
