// GERADOR do supabase/seed.sql (rodado via vitest: `node scripts/generate-seed.mjs`). Não é teste do produto.
// Princípio: o seed nasce pelas MESMAS funções do sistema (cm_*) e os lançamentos vêm do MESMO motor TS de produção — nada é inserido «por fora».
// Os ids reais só existem no banco; por isso o motor roda com ids simbólicos (@@sale:V-2001@@) que o SQL troca pelos uuids antes de gravar.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import {
  DEFAULT_PRECEDENCE, allocateByWeights, computeCommissions, evaluateGoals, type BookedEntry, type ComputeOutput, type GoalFacts, type ParticipantFacts, type PlanVersionConfig, type SaleFacts,
} from '@/lib/commissions/engine';
import { CATEGORIES, CUSTOMERS, PLANS, PRODUCTS, SALES, SELLERS, TEAMS, type Evt, type SaleFx } from './fixtures';

const ORG = 'c0c0c0c0-0000-4000-8000-000000000001';
const UID: Record<string, string> = { admin: 'a1', gestor: 'a2', gestor2: 'a3', financeiro: 'a4', vend1: 'a5', vend2: 'a6', vend3: 'a7', vend4: 'a8', consulta: 'a9' };
const uid = (k: string) => `c0c0c0c0-0000-4000-8000-0000000000${UID[k]}`;
const USERS = [
  ['admin', 'admin@demo.exemplo', 'Camila Duarte'], ['gestor', 'gestor@demo.exemplo', 'Rodrigo Albuquerque'], ['gestor2', 'gestor2@demo.exemplo', 'Helena Sampaio'], ['financeiro', 'financeiro@demo.exemplo', 'Patrícia Sena'],
  ['vend1', 'vend1@demo.exemplo', 'Marina Costa'], ['vend2', 'vend2@demo.exemplo', 'Rafael Prado'], ['vend3', 'vend3@demo.exemplo', 'Juliana Freitas'], ['vend4', 'vend4@demo.exemplo', 'Bernardo Lopes'], ['consulta', 'consulta@demo.exemplo', 'Otávio Mendes'],
] as const;

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function anchor(): { y: number; m: number; todayDay: number } {
  const env = process.env.SEED_ANCHOR;
  const now = new Date();
  if (env && /^\d{4}-\d{2}$/.test(env)) return { y: Number(env.slice(0, 4)), m: Number(env.slice(5, 7)), todayDay: 28 };
  return { y: now.getFullYear(), m: now.getMonth() + 1, todayDay: now.getDate() };
}
const A = anchor();
const monthDate = (off: number, day: number): string => {
  const idx = A.y * 12 + (A.m - 1) + off;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const cap = off === 0 ? Math.min(day, A.todayDay) : Math.min(day, 28);
  return iso(y, m, Math.max(1, cap));
};
const monthStart = (off: number) => monthDate(off, 1);
const monthEndOf = (off: number) => { const idx = A.y * 12 + (A.m - 1) + off; const y = Math.floor(idx / 12); const m = (idx % 12) + 1; return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); };
const evDate = (s: string): string => { const m = /^M(-?\d+):(\d+)$/.exec(s)!; return monthDate(Number(m[1]), Number(m[2])); };
const saleDate = (s: SaleFx): string => monthDate(s.monthOffset, s.day === 'anchor-day' ? A.todayDay : s.day);
const PLAN_START = monthStart(-6);
const V2_FROM = monthDate(0, A.todayDay);

// ---------------------------------------------------------------------------------- planos para o motor (ids simbólicos)
const tok = (kind: string, ...parts: Array<string | number>) => `@@${kind}:${parts.join(':')}@@`;
function planConfig(planName: string, v: number): PlanVersionConfig {
  const p = PLANS.find((x) => x.name === planName)!;
  const ver = p.versions.find((x) => x.v === v)!;
  return {
    id: tok('pv', planName, v), planId: tok('plan', planName), planName, versionNumber: v, basis: p.basis, eligibility: p.eligibility, returnsPolicy: 'proportional', precedence: DEFAULT_PRECEDENCE,
    rules: ver.rules.map((r) => ({
      id: tok('rule', planName, v, r.name), name: r.name, kind: r.kind, scopeType: r.scope ?? 'organization', scopeReference: r.scopeRef ? tok('cat', r.scopeRef) : null, conditions: null, rate: r.rate ?? null, fixedAmountCents: null,
      tier: r.tier ? { mode: r.tier.mode, period: r.tier.period, scope: 'individual', bands: r.tier.bands.map((b, i) => ({ order: i + 1, fromCents: i === 0 ? 0 : r.tier!.bands[i - 1]!.to!, toCents: b.to, rate: b.rate })) } : null,
      priority: 0, stack: 'exclusive', entryKind: 'commission', enabled: true, validFrom: null, validUntil: null,
    })),
  };
}
const planFor = (sellerCode: string, date: string): PlanVersionConfig => {
  const name = SELLERS.find((s) => s.code === sellerCode)!.plan;
  const p = PLANS.find((x) => x.name === name)!;
  const v = p.versions.length > 1 && date >= V2_FROM ? 2 : 1;
  return planConfig(name, v);
};

// ---------------------------------------------------------------------------------- fatos do motor por fase
const itemNet = (i: SaleFx['items'][number]) => Math.round(Number(i.qty) * i.price) - (i.discount ?? 0);
function returnItems(s: SaleFx, cents: number, already: Record<string, number>): Record<string, number> {
  const rem = s.items.map((i, ix) => Math.max(0, itemNet(i) - (already[tok('item', s.no, ix + 1)] ?? 0)));
  const alloc = allocateByWeights(cents, rem.map(String));
  const out: Record<string, number> = {};
  s.items.forEach((_, ix) => { if ((alloc[ix] ?? 0) > 0) out[tok('item', s.no, ix + 1)] = alloc[ix]!; });
  return out;
}
function factsAt(phase: number): SaleFacts[] {
  const out: SaleFacts[] = [];
  for (const s of SALES.filter((x) => x.phase <= phase)) {
    const date = saleDate(s);
    const total = s.items.reduce((a, i) => a + itemNet(i), 0);
    const evs = s.events.filter((e) => e.phase <= phase);
    const returns: SaleFacts['returns'] = [];
    const retItems: Record<string, number> = {};
    let returnedSum = 0;
    for (const e of evs.filter((x) => x.kind === 'return')) {
      const items = returnItems(s, e.cents!, retItems);
      for (const [k, v] of Object.entries(items)) retItems[k] = (retItems[k] ?? 0) + v;
      returnedSum += e.cents!;
      returns.push({ id: tok('ev', e.ref), date: evDate(e.day), amountCents: e.cents!, itemAmounts: items });
    }
    const cancel = evs.find((x) => x.kind === 'cancel');
    const parts: ParticipantFacts[] = s.parts.map((p) => {
      const sel = SELLERS.find((x) => x.code === p.seller)!;
      return { seller: { id: tok('seller', p.seller), teamId: sel.team ? tok('team', sel.team) : null, type: sel.type }, isPrimary: p.primary, allocationPct: p.pct, plan: planFor(p.seller, date) };
    });
    out.push({
      id: tok('sale', s.no), number: s.no, date, confirmedAt: date, cancelledAt: cancel ? evDate(cancel.day) : null, newCustomer: false,
      status: cancel ? 'cancelled' : returnedSum >= total ? 'totally_returned' : returnedSum > 0 ? 'partially_returned' : 'confirmed', channel: s.channel, customerId: null, netCents: total, commissionableCents: total, splitModel: s.split,
      items: s.items.map((i, ix) => ({ id: tok('item', s.no, ix + 1), position: ix + 1, productId: i.sku ? tok('sku', i.sku) : null, categoryId: i.sku ? tok('cat', PRODUCTS.find((p) => p.sku === i.sku)!.cat) : null, quantity: i.qty, netCents: itemNet(i), commissionableCents: itemNet(i), costCents: null })),
      participants: parts,
      receipts: evs.filter((x) => x.kind === 'receipt').map((e) => ({ id: tok('rc', e.ref), date: evDate(e.day), amountCents: e.cents! })), returns,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------- emissão de SQL
const sql: string[] = [];
const L = (s: string) => sql.push(s);
const asUser = (k: string) => L(`  perform pg_temp.as_user(${lit(uid(k))}, ${lit(k === 'admin' ? 'aal2' : 'aal1')});`);
const J = (o: unknown) => JSON.stringify(o);
const saleId = (no: string) => `(select id from public.sales where organization_id = org and sale_number = ${lit(no)})`;

function emitPost(label: string, runType: 'period' | 'goals', from: string, to: string, out: ComputeOutput) {
  if (out.pendencies.some((p) => p.severity === 'critical')) throw new Error(`pendência crítica no seed (${label}): ${J(out.pendencies)}`);
  const hash = createHash('sha256').update(label).digest('hex');
  L(`  -- ${label}: ${out.entries.length} lançamento(s) e ${out.details.length} memória(s) de cálculo produzidos pelo motor`);
  L(`  perform public.cm_post_calculation(org, ${lit(runType)}, ${lit(from)}, ${lit(to)}, 'seed-1.0.0', ${lit(hash)}, array(select id from public.sales where organization_id = org and status <> 'draft'), pg_temp.res($d$${J(out.details)}$d$), pg_temp.res($e$${J(out.entries)}$e$), '[]'::jsonb);`);
}
const asBooked = (out: ComputeOutput): BookedEntry[] => out.entries.map((e, i) => ({ id: `${e.idempotencyKey}#${i}`, idempotencyKey: e.idempotencyKey, componentKey: e.componentKey, saleId: e.saleId, itemId: e.itemId, planVersionId: e.planVersionId, ruleId: e.ruleId, sellerId: e.sellerId, entryType: e.entryType, amountCents: e.amountCents }));

function mapSale(no: string) {
  L(`  insert into seedmap select ${lit(tok('sale', no))}, id from public.sales where organization_id = org and sale_number = ${lit(no)} on conflict do nothing;`);
  L(`  insert into seedmap select '@@item:' || ${lit(no)} || ':' || i.position || '@@', i.id from public.sale_items i where i.sale_id = ${saleId(no)} on conflict do nothing;`);
}
function emitSalesPhase(phase: number) {
  asUser('financeiro');
  for (const s of SALES.filter((x) => x.phase === phase)) {
    const date = saleDate(s);
    const items = s.items.map((i) => ({ product_id: i.sku ? tok('sku', i.sku) : '', description: i.sku ? '' : 'Item avulso', quantity: i.qty, unit_price_cents: i.price, discount_cents: i.discount ?? 0 }));
    const parts = s.parts.map((p) => ({ seller_id: tok('seller', p.seller), allocation_percentage: p.pct, participation_type: p.primary ? 'primary' : 'secondary' }));
    L(`  v_id := public.cm_save_sale_draft(org, null, pg_temp.res(${lit(J({ sale_number: s.no, external_reference: `ERP-${s.no}`, sale_date: date, channel: s.channel, customer_id: tok('cust', s.customer), split_model: s.split }))})::jsonb, pg_temp.res(${lit(J(items))})::jsonb, pg_temp.res(${lit(J(parts))})::jsonb);`);
    L(`  perform public.cm_confirm_sale(org, v_id);`);
    mapSale(s.no);
  }
  for (const s of SALES) for (const e of s.events.filter((x) => x.phase === phase)) emitEvent(s, e);
}
function emitEvent(s: SaleFx, e: Evt) {
  const sid = saleId(s.no);
  if (e.kind === 'receipt') {
    L(`  perform public.cm_register_receipt(org, ${sid}, ${e.cents}, ${lit(evDate(e.day))}, ${lit(e.ref)}, null);`);
    L(`  insert into seedmap select ${lit(tok('rc', e.ref))}, id from public.customer_receipts where organization_id = org and sale_id = ${sid} and external_reference = ${lit(e.ref)} on conflict do nothing;`);
  } else if (e.kind === 'return') {
    const prior: Record<string, number> = {};
    for (const x of s.events.filter((y) => y.kind === 'return' && y.phase < e.phase)) for (const [k, v] of Object.entries(returnItems(s, x.cents!, prior))) prior[k] = (prior[k] ?? 0) + v;
    const items = returnItems(s, e.cents!, prior);
    L(`  perform public.cm_register_return(org, ${sid}, ${e.cents}, ${lit(evDate(e.day))}, pg_temp.res(${lit(J(items))})::jsonb, 'Produto devolvido pelo cliente', ${lit(e.ref)});`);
    L(`  insert into seedmap select ${lit(tok('ev', e.ref))}, id from public.sale_events where organization_id = org and sale_id = ${sid} and external_event_id = ${lit(e.ref)} on conflict do nothing;`);
  } else {
    L(`  perform public.cm_cancel_sale(org, ${sid}, 'Cliente desistiu da compra', ${lit(evDate(e.day))}, ${lit(e.ref)});`);
  }
}
const approveAll = (until: string) => L(`  perform public.cm_review_entries(org, array(select id from public.commission_entries where organization_id = org and approval_status = 'calculated' and eligible_at <= ${lit(until)}), 'approve', null);`);
function closePeriod(off: number, payRule: 'all' | 'partial' | 'none') {
  const a = monthStart(off); const b = monthEndOf(off);
  L(`  v_per := public.cm_open_period(org, ${lit(a)}, ${lit(b)});`);
  L(`  perform public.cm_prepare_closings(org, v_per); perform public.cm_submit_period(org, v_per); perform public.cm_close_period(org, v_per);`);
  if (payRule !== 'none') {
    const pay = payRule === 'all' ? 'c.payable_amount_cents' : `case when s.seller_code = 'V003' then 0 when s.seller_code = 'V001' then c.payable_amount_cents / 2 else c.payable_amount_cents end`;
    L(`  for rec in select c.id as cid, c.seller_id, ${pay} as amt from public.commission_closings c join public.sellers s on s.id = c.seller_id where c.period_id = v_per and c.status = 'closed' and c.payable_amount_cents > 0 loop
    if rec.amt > 0 then perform public.cm_record_payout(org, rec.seller_id, ${lit(monthDate(off + 1, 5))}, 'pix', 'PIX-' || ${lit(String(off))} || '-' || substr(rec.cid::text, 1, 8), null, jsonb_build_array(jsonb_build_object('closing_id', rec.cid, 'amount_cents', rec.amt))); end if;
  end loop;`);
  }
}

describe('gerador do seed', () => {
  it('escreve supabase/seed.sql', () => {
    L(`-- Dados de DEMONSTRAÇÃO fictícios e determinísticos da «NovaSales Comercial Ltda. (dados fictícios)». Somente para uso LOCAL. Senha dos usuários @demo.exemplo: DemoLocal#2026
-- GERADO por scripts/generate-seed.mjs (âncora ${A.y}-${String(A.m).padStart(2, '0')}). Cadastros, vendas, recebimentos, devoluções, metas, fechamentos e pagamentos nascem pelas MESMAS funções do sistema (cm_*);
-- os lançamentos são produzidos pelo MESMO motor TS de produção. Usuários: admin, gestor, gestor2, financeiro, vend1..vend4, consulta. O administrador precisa cadastrar o 2º fator (TOTP) no primeiro acesso.
-- NUNCA use este arquivo em produção.

create function pg_temp.as_user(p_id text, p_aal text) returns void language sql as $f$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'aal', p_aal, 'role', 'authenticated')::text, true) $f$;
create temp table seedmap (tok text primary key, id uuid);
create function pg_temp.res(p text) returns jsonb language plpgsql as $f$
declare r record; t text := p;
begin
  for r in select m.tok, m.id from seedmap m loop t := replace(t, r.tok, r.id::text); end loop;
  if t like '%@@%' then raise exception 'token sem resolução no seed: %', substring(t from '@@[^@]+@@'); end if;
  return t::jsonb;
end $f$;

do $seed$
declare
  org uuid := ${lit(ORG)};
  pw text := extensions.crypt('DemoLocal#2026', extensions.gen_salt('bf'));
  v_id uuid; v_per uuid; v_plan jsonb; v_ver uuid; v_goal uuid; rec record;
begin
  if exists (select 1 from public.organizations where id = org) then return; end if; -- já semeado
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email, pw, now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v.nome), now(), now(), '', '', '', ''
  from (values ${USERS.map(([k, e, n]) => `(${lit(uid(k))}, ${lit(e)}, ${lit(n)})`).join(', ')}) as v(id, email, nome);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.email, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now() from auth.users u where u.email like '%@demo.exemplo';
  update public.profiles p set full_name = u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p.id and u.email like '%@demo.exemplo';
  insert into public.organizations (id, name, slug) values (org, 'NovaSales Comercial Ltda. (dados fictícios)', 'novasales');
  insert into public.organization_settings (organization_id, display_name, theme) values (org, 'NovaSales Comercial', '{"primary":"#0e7490"}'::jsonb);
  insert into public.organization_members (organization_id, user_id, role) values
    (org, ${lit(uid('admin'))}, 'owner'), (org, ${lit(uid('gestor'))}, 'manager'), (org, ${lit(uid('gestor2'))}, 'manager'), (org, ${lit(uid('financeiro'))}, 'member'),
    (org, ${lit(uid('vend1'))}, 'member'), (org, ${lit(uid('vend2'))}, 'member'), (org, ${lit(uid('vend3'))}, 'member'), (org, ${lit(uid('vend4'))}, 'member'), (org, ${lit(uid('consulta'))}, 'viewer');
`);
    // ---- cadastros (administrador)
    asUser('admin');
    L(`  perform public.cm_set_access(org, ${lit(uid('financeiro'))}, 'finance');`);
    for (const t of TEAMS) L(`  perform public.cm_save_team(org, null, ${lit(t.name)}, null, ${lit(uid(t.manager))}, true);`);
    L(`  insert into seedmap select '@@team:' || name || '@@', id from public.sales_teams where organization_id = org;`);
    for (const s of SELLERS) {
      L(`  perform public.cm_save_seller(org, null, ${lit(s.name)}, ${lit(s.code)}, ${lit(s.type)}, ${s.team ? `(select id from public.sales_teams where organization_id = org and name = ${lit(s.team)})` : 'null'}, ${s.login ? lit(uid(s.login)) : 'null'}, ${lit(PLAN_START)}, null, null, 'active', null);`);
    }
    L(`  insert into seedmap select '@@seller:' || seller_code || '@@', id from public.sellers where organization_id = org;`);
    for (const c of CATEGORIES) L(`  perform public.cm_save_category(org, null, ${lit(c)}, null, true);`);
    L(`  insert into seedmap select '@@cat:' || name || '@@', id from public.product_categories where organization_id = org;`);
    for (const p of PRODUCTS) L(`  perform public.cm_save_product(org, null, ${lit(p.sku)}, ${lit(p.name)}, (select id from public.product_categories where organization_id = org and name = ${lit(p.cat)}), null, true);`);
    L(`  insert into seedmap select '@@sku:' || sku || '@@', id from public.products where organization_id = org;`);
    CUSTOMERS.forEach((c, i) => L(`  perform public.cm_save_customer(org, null, ${lit(c)}, null, ${lit(`${String(10 + i)}.000.000/0001-0${i % 10}`)}, null, null);`));
    L(`  insert into seedmap select '@@cust:' || name || '@@', id from public.customers where organization_id = org;`);

    // ---- planos
    for (const p of PLANS) {
      L(`  v_plan := public.cm_create_plan(org, ${lit(p.name)}, null, ${lit(p.basis)}, ${lit(p.eligibility)}, 'individual', 'proportional');`);
      L(`  insert into seedmap values (${lit(tok('plan', p.name))}, (v_plan ->> 'plan_id')::uuid);`);
      p.versions.forEach((ver, ix) => {
        const rules = ver.rules.map((r) => ({
          name: r.name, rule_type: r.kind, rate: r.rate, scope_type: r.scope ?? 'organization', scope_reference: r.scopeRef ? tok('cat', r.scopeRef) : null, priority: r.priority ?? 0,
          tier: r.tier ? { mode: r.tier.mode, period: r.tier.period, scope: 'individual', bands: r.tier.bands.map((b, i) => ({ order: i + 1, from_cents: i === 0 ? 0 : r.tier!.bands[i - 1]!.to, to_cents: b.to, rate: b.rate })) } : undefined,
        }));
        L(ix === 0 ? `  v_ver := (v_plan ->> 'version_id')::uuid;` : `  v_ver := public.cm_new_plan_version(org, (v_plan ->> 'plan_id')::uuid);`);
        L(`  perform public.cm_save_plan_draft(org, v_ver, pg_temp.res(${lit(J({ rules }))})::jsonb);`);
        L(`  perform public.cm_publish_plan_version(org, v_ver, ${lit(ver.validFrom === 'start' ? PLAN_START : V2_FROM)});`);
        L(`  insert into seedmap values (${lit(tok('pv', p.name, ver.v))}, v_ver);`);
        for (const r of ver.rules) L(`  insert into seedmap select ${lit(tok('rule', p.name, ver.v, r.name))}, id from public.commission_rules where plan_version_id = v_ver and name = ${lit(r.name)};`);
      });
    }
    for (const s of SELLERS) L(`  perform public.cm_assign_plan(org, ${lit(tok('seller', s.code)).replace(/'(@@[^']+@@)'/, "(select id from seedmap where tok = '$1')")}, ${lit(tok('plan', s.plan)).replace(/'(@@[^']+@@)'/, "(select id from seedmap where tok = '$1')")}, ${lit(PLAN_START)});`);

    // ---- fase 1: meses -3 e -2
    L(`  -- ===== fase 1: vendas dos meses ${A.m - 3 <= 0 ? '' : ''}-3 e -2`);
    emitSalesPhase(1);
    let booked: BookedEntry[] = [];
    asUser('financeiro');
    let out = computeCommissions({ sales: factsAt(1), booked });
    emitPost('fase 1', 'period', monthStart(-3), monthEndOf(-2), out);
    booked = [...booked, ...asBooked(out)];
    approveAll(monthEndOf(-2));
    closePeriod(-3, 'all');
    closePeriod(-2, 'partial');

    // ---- fase 2: mês -1 (devolução de venda antiga, cancelamento, recebimento tardio, meta com bônus)
    L(`  -- ===== fase 2: mês -1`);
    emitSalesPhase(2);
    asUser('financeiro');
    out = computeCommissions({ sales: factsAt(2), booked });
    emitPost('fase 2', 'period', monthStart(-1), monthEndOf(-1), out);
    booked = [...booked, ...asBooked(out)];
    // meta de setembro do Rafael (V002) com bônus
    asUser('admin');
    L(`  v_goal := public.cm_save_goal(org, null, pg_temp.res(${lit(J({ name: 'Meta do mês anterior — Rafael', goal_type: 'sold_value', target_value: '2000000', period_start: monthStart(-1), period_end: monthEndOf(-1), scope_type: 'seller', scope_reference_id: tok('seller', 'V002') }))})::jsonb, pg_temp.res(${lit(J([{ plan_id: tok('plan', 'Plano B — faixas progressivas'), threshold_pct: '100', bonus_type: 'fixed', bonus_amount_cents: 30000, award_timing: 'period_end', distribution: 'each' }]))})::jsonb);`);
    L(`  insert into seedmap values ('@@goal:g1@@', v_goal);`);
    L(`  insert into seedmap select '@@gbr:g1@@', id from public.goal_bonus_rules where goal_id = v_goal;`);
    const goal: GoalFacts = { id: tok('goal', 'g1'), name: 'Meta do mês anterior — Rafael', type: 'sold_value', target: '2000000', periodStart: monthStart(-1), periodEnd: monthEndOf(-1), scope: 'seller', scopeReference: tok('seller', 'V002'), productId: null, sellerIds: [tok('seller', 'V002')],
      bonusRules: [{ id: tok('gbr', 'g1'), planVersionId: tok('pv', 'Plano B — faixas progressivas', 1), thresholdPct: '100', bonusType: 'fixed', bonusRate: null, bonusAmountCents: 30000, timing: 'period_end', distribution: 'each' }] };
    const gout = evaluateGoals([goal], factsAt(2), booked, monthStart(0));
    asUser('financeiro');
    emitPost('metas', 'goals', monthStart(-1), monthEndOf(-1), gout);
    booked = [...booked, ...asBooked(gout)];
    approveAll(monthEndOf(-1));
    closePeriod(-1, 'none');

    // ---- fase 3: mês corrente (em andamento: nada aprovado ainda)
    L(`  -- ===== fase 3: mês corrente`);
    emitSalesPhase(3);
    asUser('financeiro');
    out = computeCommissions({ sales: factsAt(3), booked });
    emitPost('fase 3', 'period', monthStart(0), monthDate(0, 28), out);
    booked = [...booked, ...asBooked(out)];
    L(`  perform public.cm_review_entries(org, array(select e.id from public.commission_entries e join public.sales s on s.id = e.sale_id where e.organization_id = org and e.approval_status = 'calculated' and s.sale_number = 'V-2032'), 'submit', null);`);
    L(`  perform public.cm_review_entries(org, array(select e.id from public.commission_entries e join public.sales s on s.id = e.sale_id where e.organization_id = org and e.approval_status = 'calculated' and s.sale_number = 'V-2033'), 'approve', null);`);
    L(`  perform public.cm_create_adjustment(org, ${lit(tok('seller', 'V004')).replace(/'(@@[^']+@@)'/, "(select id from seedmap where tok = '$1')")}, 'negative', 'debit', 15000, 'Desconto de amostra entregue ao cliente, acordado com a gestão.', 'AM-77', null, ${lit(monthDate(0, 3))});`);
    L(`  perform pg_temp.as_user(${lit(uid('vend1'))}, 'aal1');`);
    L(`  perform public.cm_open_dispute(org, (select e.id from public.commission_entries e join public.sales s on s.id = e.sale_id where e.organization_id = org and s.sale_number = 'V-2031' limit 1), 'A venda foi acordada com 7% e o lançamento mostra 5%: peço conferir a versão do plano.');`);
    asUser('admin');
    L(`  perform public.cm_save_goal(org, null, pg_temp.res(${lit(J({ name: 'Meta do mês — Equipe Norte', goal_type: 'sold_value', target_value: '4000000', period_start: monthStart(0), period_end: monthEndOf(0), scope_type: 'team', scope_reference_id: tok('team', 'Equipe Norte') }))})::jsonb, '[]'::jsonb);`);
    L(`  perform pg_temp.as_user(${lit(uid('financeiro'))}, 'aal1');`);
    L(`  perform public.cm_open_period(org, ${lit(monthStart(0))}, ${lit(monthEndOf(0))});`);
    L(`  perform set_config('request.jwt.claims', '', true);`);
    L(`end $seed$;`);
    writeFileSync('supabase/seed.sql', `${sql.join('\n')}\n`);
  });
});
