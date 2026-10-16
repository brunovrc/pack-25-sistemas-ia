// Dados FICTÍCIOS da «NovaSales Comercial Ltda.» (demonstração). Valores escolhidos para ter resultados matemáticos conhecidos.
// Datas são fixadas a partir de uma âncora (primeiro dia do mês corrente na geração): `node scripts/generate-seed.mjs --anchor AAAA-MM`.

export type Plan = {
  name: string; basis: 'net_value'; eligibility: 'sale_confirmation' | 'proportional_receipt'; returns: 'proportional';
  versions: Array<{ v: number; validFrom: 'start' | 'anchor-day'; rules: Array<{ name: string; kind: 'percentage' | 'tiered'; rate?: string; scope?: 'organization' | 'category'; scopeRef?: string; priority?: number; tier?: { mode: 'marginal'; period: 'month'; bands: Array<{ to: number | null; rate: string }> } }> }>;
};

export const PLANS: Plan[] = [
  { name: 'Plano A — 5% sobre vendas', basis: 'net_value', eligibility: 'sale_confirmation', returns: 'proportional', versions: [
    { v: 1, validFrom: 'start', rules: [{ name: 'Global 5%', kind: 'percentage', rate: '0.05' }] },
    { v: 2, validFrom: 'anchor-day', rules: [{ name: 'Global 7%', kind: 'percentage', rate: '0.07' }] },
  ] },
  { name: 'Plano B — faixas progressivas', basis: 'net_value', eligibility: 'sale_confirmation', returns: 'proportional', versions: [
    { v: 1, validFrom: 'start', rules: [{ name: 'Faixas 2/4/6%', kind: 'tiered', tier: { mode: 'marginal', period: 'month', bands: [{ to: 1_000_000, rate: '0.02' }, { to: 2_000_000, rate: '0.04' }, { to: null, rate: '0.06' }] } }] },
  ] },
  { name: 'Plano C — por recebimento', basis: 'net_value', eligibility: 'proportional_receipt', returns: 'proportional', versions: [
    { v: 1, validFrom: 'start', rules: [{ name: 'Global 5% proporcional', kind: 'percentage', rate: '0.05' }] },
  ] },
  { name: 'Plano D — equipe (pool)', basis: 'net_value', eligibility: 'sale_confirmation', returns: 'proportional', versions: [
    { v: 1, validFrom: 'start', rules: [{ name: 'Global 4%', kind: 'percentage', rate: '0.04' }, { name: 'Serviços 6%', kind: 'percentage', rate: '0.06', scope: 'category', scopeRef: 'Serviços' }] },
  ] },
];

export const TEAMS = [{ name: 'Equipe Norte', manager: 'gestor' }, { name: 'Equipe Sul', manager: 'gestor2' }];
export const SELLERS = [
  { code: 'V001', name: 'Marina Costa', team: 'Equipe Norte', login: 'vend1', plan: 'Plano A — 5% sobre vendas', type: 'internal' },
  { code: 'V002', name: 'Rafael Prado', team: 'Equipe Norte', login: 'vend2', plan: 'Plano B — faixas progressivas', type: 'internal' },
  { code: 'V003', name: 'Juliana Freitas', team: 'Equipe Sul', login: 'vend3', plan: 'Plano C — por recebimento', type: 'internal' },
  { code: 'V004', name: 'Bernardo Lopes', team: 'Equipe Sul', login: 'vend4', plan: 'Plano D — equipe (pool)', type: 'internal' },
  { code: 'V005', name: 'Aline Moura', team: null, login: null, plan: 'Plano A — 5% sobre vendas', type: 'external' },
] as const;
export const CATEGORIES = ['Produtos', 'Serviços', 'Acessórios'];
export const PRODUCTS = [
  { sku: 'NS-100', name: 'Licença de software', cat: 'Produtos' }, { sku: 'NS-200', name: 'Implantação', cat: 'Serviços' }, { sku: 'NS-300', name: 'Suporte mensal', cat: 'Serviços' },
  { sku: 'NS-400', name: 'Leitor de código de barras', cat: 'Acessórios' }, { sku: 'NS-500', name: 'Impressora térmica', cat: 'Acessórios' },
];
export const CUSTOMERS = ['Mercado Central Ltda', 'Farmácia Boa Saúde', 'Padaria Pão Quente', 'Auto Peças Veloz', 'Clínica Vida Plena', 'Escola Novo Saber', 'Hotel Mirante', 'Distribuidora Aurora'];

/** `day` = 'M-1:12' = dia 12 do mês (âncora − 1). */
export type Evt = { phase: number; kind: 'receipt' | 'return' | 'cancel'; ref: string; day: string; cents?: number };
export type SaleFx = {
  phase: number; no: string; monthOffset: -3 | -2 | -1 | 0; day: number | 'anchor-day'; customer: string; channel: string; split: 'pool' | 'independent';
  parts: Array<{ seller: string; pct: string; primary: boolean }>; items: Array<{ sku: string | null; qty: string; price: number; discount?: number }>; events: Evt[];
};
const r = (cents: number) => cents;
// phase 1 = ago/jul, 2 = set, 3 = mês corrente
export const SALES: SaleFx[] = [
  { phase: 1, no: 'V-2001', monthOffset: -3, day: 6, customer: 'Mercado Central Ltda', channel: 'Online', split: 'independent', parts: [{ seller: 'V001', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(800_000) }, { sku: 'NS-200', qty: '2', price: r(200_000) }], events: [{ phase: 2, kind: 'return', ref: 'DEV-V-2001-1', day: 'M-1:12', cents: 400_000 }] },
  { phase: 1, no: 'V-2002', monthOffset: -3, day: 14, customer: 'Farmácia Boa Saúde', channel: 'Loja', split: 'independent', parts: [{ seller: 'V002', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(1_800_000) }], events: [] },
  { phase: 1, no: 'V-2003', monthOffset: -3, day: 21, customer: 'Padaria Pão Quente', channel: 'Online', split: 'independent', parts: [{ seller: 'V002', pct: '100', primary: true }], items: [{ sku: 'NS-300', qty: '3', price: r(300_000) }], events: [] },
  { phase: 1, no: 'V-2004', monthOffset: -3, day: 9, customer: 'Auto Peças Veloz', channel: 'Telefone', split: 'independent', parts: [{ seller: 'V003', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(1_000_000) }], events: [{ phase: 1, kind: 'receipt', ref: 'REC-V-2004-1', day: 'M-3:25', cents: 1_000_000 }] },
  { phase: 1, no: 'V-2005', monthOffset: -3, day: 18, customer: 'Clínica Vida Plena', channel: 'Representante', split: 'pool', parts: [{ seller: 'V004', pct: '60', primary: true }, { seller: 'V003', pct: '40', primary: false }], items: [{ sku: 'NS-100', qty: '1', price: r(1_200_000) }, { sku: 'NS-200', qty: '1', price: r(800_000) }], events: [] },
  { phase: 1, no: 'V-2006', monthOffset: -3, day: 27, customer: 'Escola Novo Saber', channel: 'Representante', split: 'independent', parts: [{ seller: 'V005', pct: '100', primary: true }], items: [{ sku: 'NS-400', qty: '5', price: r(130_000) }], events: [] },
  { phase: 1, no: 'V-2011', monthOffset: -2, day: 4, customer: 'Hotel Mirante', channel: 'Online', split: 'independent', parts: [{ seller: 'V001', pct: '100', primary: true }], items: [{ sku: 'NS-500', qty: '4', price: r(250_000) }], events: [{ phase: 2, kind: 'cancel', ref: 'CANC-V-2011', day: 'M-1:20' }] },
  { phase: 1, no: 'V-2012', monthOffset: -2, day: 11, customer: 'Distribuidora Aurora', channel: 'Loja', split: 'independent', parts: [{ seller: 'V002', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(2_500_000) }], events: [] },
  { phase: 1, no: 'V-2013', monthOffset: -2, day: 16, customer: 'Mercado Central Ltda', channel: 'Telefone', split: 'independent', parts: [{ seller: 'V003', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(800_000) }], events: [{ phase: 1, kind: 'receipt', ref: 'REC-V-2013-1', day: 'M-2:28', cents: 300_000 }, { phase: 2, kind: 'receipt', ref: 'REC-V-2013-2', day: 'M-1:10', cents: 500_000 }] },
  { phase: 1, no: 'V-2014', monthOffset: -2, day: 23, customer: 'Padaria Pão Quente', channel: 'Online', split: 'pool', parts: [{ seller: 'V004', pct: '50', primary: true }, { seller: 'V001', pct: '50', primary: false }], items: [{ sku: 'NS-200', qty: '1', price: r(1_000_001) }], events: [] },
  { phase: 2, no: 'V-2021', monthOffset: -1, day: 3, customer: 'Auto Peças Veloz', channel: 'Online', split: 'independent', parts: [{ seller: 'V001', pct: '100', primary: true }], items: [{ sku: 'NS-300', qty: '1', price: r(200_000) }], events: [] },
  { phase: 2, no: 'V-2022', monthOffset: -1, day: 9, customer: 'Farmácia Boa Saúde', channel: 'Loja', split: 'independent', parts: [{ seller: 'V002', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(1_500_000) }], events: [] },
  { phase: 2, no: 'V-2023', monthOffset: -1, day: 17, customer: 'Clínica Vida Plena', channel: 'Online', split: 'independent', parts: [{ seller: 'V002', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(900_000) }, { sku: 'NS-300', qty: '1', price: r(200_000) }], events: [] },
  { phase: 2, no: 'V-2024', monthOffset: -1, day: 22, customer: 'Escola Novo Saber', channel: 'Telefone', split: 'independent', parts: [{ seller: 'V003', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(600_000) }], events: [{ phase: 2, kind: 'receipt', ref: 'REC-V-2024-1', day: 'M-1:28', cents: 600_000 }] },
  { phase: 3, no: 'V-2031', monthOffset: 0, day: 2, customer: 'Hotel Mirante', channel: 'Online', split: 'independent', parts: [{ seller: 'V001', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(1_000_000) }], events: [] },
  { phase: 3, no: 'V-2032', monthOffset: 0, day: 5, customer: 'Distribuidora Aurora', channel: 'Loja', split: 'independent', parts: [{ seller: 'V002', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(1_200_000) }], events: [] },
  { phase: 3, no: 'V-2033', monthOffset: 0, day: 8, customer: 'Mercado Central Ltda', channel: 'Telefone', split: 'independent', parts: [{ seller: 'V003', pct: '100', primary: true }], items: [{ sku: 'NS-300', qty: '2', price: r(500_000) }], events: [{ phase: 3, kind: 'receipt', ref: 'REC-V-2033-1', day: 'M0:12', cents: 400_000 }] },
  { phase: 3, no: 'V-2034', monthOffset: 0, day: 10, customer: 'Padaria Pão Quente', channel: 'Representante', split: 'pool', parts: [{ seller: 'V004', pct: '70', primary: true }, { seller: 'V003', pct: '30', primary: false }], items: [{ sku: 'NS-200', qty: '1', price: r(900_000) }], events: [] },
  { phase: 3, no: 'V-2035', monthOffset: 0, day: 'anchor-day', customer: 'Auto Peças Veloz', channel: 'Online', split: 'independent', parts: [{ seller: 'V001', pct: '100', primary: true }], items: [{ sku: 'NS-100', qty: '1', price: r(500_000) }], events: [] },
];
