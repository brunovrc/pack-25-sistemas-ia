// Rótulos em português e matriz de permissões da interface (o BANCO decide de verdade; isto só mostra/oculta botões).

export type Profile = 'admin' | 'finance' | 'manager' | 'seller' | 'viewer';

export const PROFILE_LABEL: Record<Profile, string> = { admin: 'Administrador', finance: 'Financeiro', manager: 'Gestor comercial', seller: 'Vendedor', viewer: 'Consulta' };

export const BASIS_LABEL: Record<string, string> = {
  net_value: 'Valor líquido da venda', received_value: 'Valor efetivamente recebido', gross_margin: 'Margem bruta gerencial', fixed_per_sale: 'Valor fixo por venda', fixed_per_unit: 'Valor fixo por unidade',
};
export const BASIS_HELP: Record<string, string> = {
  net_value: 'Comissão sobre o valor comissionável da venda (após descontos documentados).',
  received_value: 'Comissão só sobre o que o cliente efetivamente pagou (recebimentos registrados).',
  gross_margin: 'Comissão sobre (receita − custo direto). Exige custo informado em cada item.',
  fixed_per_sale: 'Valor fixo por venda elegível.',
  fixed_per_unit: 'Valor fixo multiplicado pela quantidade válida (descontada a devolvida).',
};
export const ELIGIBILITY_LABEL: Record<string, string> = { sale_confirmation: 'Na confirmação da venda', full_receipt: 'No recebimento total', proportional_receipt: 'Proporcional aos recebimentos' };
export const ELIGIBILITY_HELP: Record<string, string> = {
  sale_confirmation: 'A comissão fica elegível assim que a venda é confirmada.',
  full_receipt: 'Só fica elegível quando o cliente pagou o valor devido por inteiro.',
  proportional_receipt: 'Libera a comissão na proporção do que o cliente já pagou.',
};
export const RETURNS_LABEL: Record<string, string> = { proportional: 'Estorno proporcional automático', manual: 'Estorno manual (análise)' };
export const PLAN_TYPE_LABEL: Record<string, string> = { individual: 'Individual', team: 'Equipe', campaign: 'Campanha' };
export const RULE_TYPE_LABEL: Record<string, string> = { percentage: 'Percentual', fixed: 'Valor fixo', tiered: 'Faixas' };
export const SCOPE_LABEL: Record<string, string> = { organization: 'Toda a empresa', team: 'Equipe', seller: 'Vendedor', category: 'Categoria', product: 'Produto', channel: 'Canal' };
export const TIER_MODE_LABEL: Record<string, string> = { marginal: 'Progressivo marginal (cada faixa só sobre a sua parte)', reached: 'Faixa atingida (taxa da faixa sobre a base inteira)' };
export const TIER_PERIOD_LABEL: Record<string, string> = { month: 'Mensal', quarter: 'Trimestral', year: 'Anual' };
export const TIER_SCOPE_LABEL: Record<string, string> = { individual: 'Individual (por vendedor)', team: 'Equipe (soma da equipe)' };
export const STACK_LABEL: Record<string, string> = { exclusive: 'Exclusiva (a mais específica vence)', stack: 'Soma às demais (empilha)' };
export const SPLIT_LABEL: Record<string, string> = { pool: 'Pool único (a comissão é dividida)', independent: 'Independentes (cada um pela própria regra)' };
export const SELLER_TYPE_LABEL: Record<string, string> = { internal: 'Interno', external: 'Representante externo', partner: 'Parceiro comercial' };
export const SELLER_STATUS_LABEL: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', archived: 'Arquivado' };
export const SALE_STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', confirmed: 'Confirmada', partially_returned: 'Parcialmente devolvida', cancelled: 'Cancelada', totally_returned: 'Totalmente devolvida' };
export const ENTRY_TYPE_LABEL: Record<string, string> = { commission: 'Comissão', bonus: 'Bônus', adjustment_positive: 'Ajuste (+)', adjustment_negative: 'Ajuste (−)', reversal: 'Estorno' };
export const APPROVAL_LABEL: Record<string, string> = {
  calculated: 'Calculada', pending_review: 'Em revisão', approved: 'Aprovada', contested: 'Contestada', rejected: 'Rejeitada', adjusted: 'Ajustada',
};
export const CAUSE_LABEL: Record<string, string> = { initial: 'Cálculo inicial', receipt: 'Recebimento', return: 'Devolução', cancellation: 'Cancelamento', recalculation: 'Recálculo', goal: 'Meta atingida', adjustment: 'Ajuste manual' };
export const PERIOD_STATUS_LABEL: Record<string, string> = { open: 'Aberto', in_review: 'Em conferência', awaiting_approval: 'Aguardando aprovação', closed: 'Fechado', cancelled: 'Cancelado' };
export const CLOSING_STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', awaiting_approval: 'Aguardando aprovação', closed: 'Fechado', cancelled: 'Cancelado' };
export const DISPUTE_STATUS_LABEL: Record<string, string> = { open: 'Aberta', in_review: 'Em análise', resolved: 'Resolvida', rejected: 'Rejeitada' };
export const ADJUSTMENT_TYPE_LABEL: Record<string, string> = { positive: 'Ajuste positivo', negative: 'Ajuste negativo', exceptional_bonus: 'Bônus excepcional', calculation_correction: 'Correção de cálculo', administrative_reversal: 'Reversão administrativa' };
export const ADJUSTMENT_STATUS_LABEL: Record<string, string> = { pending: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Rejeitado' };
export const PAYMENT_METHOD_LABEL: Record<string, string> = { pix: 'PIX (feito fora do sistema)', ted: 'TED', doc: 'DOC', boleto: 'Boleto', cash: 'Dinheiro', external_payroll: 'Folha externa', other: 'Outro' };
export const PAYOUT_STATUS_LABEL: Record<string, string> = { recorded: 'Registrado', reversed: 'Estornado' };
export const GOAL_TYPE_LABEL: Record<string, string> = {
  sold_value: 'Valor vendido', received_value: 'Valor recebido', sales_count: 'Número de vendas', new_customers: 'Novos clientes', product_value: 'Valor de um produto', product_units: 'Unidades de um produto',
};
export const GOAL_SCOPE_LABEL: Record<string, string> = { seller: 'Vendedor', team: 'Equipe', organization: 'Toda a empresa' };
export const CHANNEL_SUGGESTIONS = ['Loja', 'Online', 'Telefone', 'Representante', 'Parceiro'];
export const IMPORT_TYPE_LABEL: Record<string, string> = { sales: 'Vendas', customers: 'Clientes', sellers: 'Vendedores', receipts: 'Recebimentos', goals: 'Metas' };
export const PENDENCY_LABEL: Record<string, string> = {
  NO_PLAN: 'Vendedor sem plano vigente', NO_RULE_MATCH: 'Nenhuma regra se aplica', RULE_CONFLICT: 'Regras em conflito', MISSING_COST: 'Custo ausente (base margem)', POOL_SUM_INVALID: 'Pool não soma 100%',
  POOL_PRIMARY_REQUIRED: 'Pool sem vendedor principal', RETURN_NEEDS_REVIEW: 'Devolução exige estorno manual', SALE_CANCELLED_NEEDS_REVERSAL: 'Venda cancelada exige estorno manual', RETURN_INVALID: 'Devolução inválida',
  RETURN_EXCEEDS_SALE: 'Devolução acima do saldo', SALE_TOTAL_MISMATCH: 'Totais da venda inconsistentes', BONUS_BELOW_THRESHOLD: 'Bônus lançado, atingimento caiu', NO_PARTICIPANT: 'Venda sem vendedor', DUPLICATE_PARTICIPANT: 'Vendedor repetido',
  RULE_TIER_MISSING: 'Regra por faixas sem faixas',
};

/** O que cada perfil vê/faz na interface. O banco reaplica tudo (RLS + funções). */
export function can(profile: Profile | null) {
  const p = profile;
  const admin = p === 'admin';
  const finance = p === 'admin' || p === 'finance';
  const manager = finance || p === 'manager';
  return {
    admin, finance, manager, seller: p === 'seller', viewer: p === 'viewer',
    managePlans: admin, manageSellers: manager, manageCatalog: manager, manageSales: manager, manageReceipts: finance, runCalculation: finance, review: manager, adjust: finance,
    close: finance, payouts: finance, settings: admin, importData: manager, goals: manager, simulate: manager, disputes: p === 'seller', respondDisputes: manager, reports: finance || p === 'manager', seeAggregatesOnly: p === 'viewer',
  };
}
export type Perms = ReturnType<typeof can>;
