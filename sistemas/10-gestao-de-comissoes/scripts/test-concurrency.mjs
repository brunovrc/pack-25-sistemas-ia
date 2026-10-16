#!/usr/bin/env node
// Concorrência REAL: várias sessões psql simultâneas contra o mesmo banco (dados confirmados, sem rollback).
// Prova (§37 do prompt mestre): a mesma venda processada ao mesmo tempo não duplica comissão; o mesmo estorno não se aplica duas vezes;
// aprovação, confirmação de venda, recebimento e fechamento têm UM vencedor; pagamentos simultâneos nunca passam do saldo aprovado.
// Uso: node scripts/test-concurrency.mjs   (requer Docker; banco descartável, sem porta publicada)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = join(root, 'supabase');
const name = `pack25-cm-conc-${randomBytes(4).toString('hex')}`;
const IMAGE = process.env.PG_TEST_IMAGE ?? 'postgres:17-alpine';
const OWNER = 'ffffffff-0000-4000-8000-0000000000a0';
const docker = (a, o = {}) => spawnSync('docker', a, { encoding: 'utf8', ...o });

// «Largada sincronizada»: toda chamada espera um alvo comum (advisory lock) liberado só quando o canhão termina — as sessões entram AO MESMO TEMPO.
const GUN_KEY = 7777010;
const GUN_MS = 3500;
let gunOn = false;
function psql(sql, { asOwner = false } = {}) {
  const wrapped = asOwner
    ? `begin; select set_config('request.jwt.claims', '{"sub":"${OWNER}","aal":"aal2","email":"oa@t.invalid"}', true); set local role authenticated; ${gunOn ? `select pg_advisory_xact_lock_shared(${GUN_KEY});` : ''} ${sql}; commit`
    : sql;
  return new Promise((resolve) => {
    const p = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'core'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.stdin.end(wrapped);
  });
}
async function armGun() {
  gunOn = true;
  spawn('docker', ['exec', '-i', name, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', 'core', '-c', `select pg_advisory_lock(${GUN_KEY}); select pg_sleep(${GUN_MS / 1000});`], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const r = await psql("select count(*) from pg_locks where locktype = 'advisory' and granted and mode = 'ExclusiveLock'");
    if (r.out.trim() === '1') return;
    await new Promise((res) => setTimeout(res, 100));
  }
}
const one = async (sql, opts) => { const r = await psql(sql, opts); if (r.code !== 0) throw new Error(r.err); return r.out.split('\n').filter(Boolean).pop(); };
const fire = async (n, make) => { await armGun(); const rs = await Promise.all(Array.from({ length: n }, (_, k) => make(k))); gunOn = false; await new Promise((r) => setTimeout(r, GUN_MS + 200)); return rs; };
const oks = (rs) => rs.filter((r) => r.code === 0).length;
let failed = 0;
const check = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FALHOU'}: ${label}`); if (!cond) failed++; };

try {
  if (docker(['version', '--format', '{{.Server.Version}}']).status !== 0) throw new Error('Docker indisponível');
  const run = docker(['run', '-d', '--rm', '--name', name, '-e', `POSTGRES_PASSWORD=${randomBytes(16).toString('hex')}`, '-e', 'POSTGRES_DB=core', IMAGE, '-c', 'max_connections=200']);
  if (run.status !== 0) throw new Error(run.stderr);
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'core']).status === 0) break;
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);
  }
  for (const f of ['tests/00_harness.sql', ...readdirSync(join(dbDir, 'migrations')).filter((x) => x.endsWith('.sql')).sort().map((x) => `migrations/${x}`)]) {
    const r = await psql(readFileSync(join(dbDir, f), 'utf8'));
    if (r.code !== 0) throw new Error(`${f}: ${r.err}`);
  }
  await psql(`insert into auth.users (id, email) values ('${OWNER}', 'oa@t.invalid')`);
  const org = await one(`select public.create_organization('Empresa Concorrência', 'empresa-conc-cm')`, { asOwner: true });
  const O = `'${org}'`;
  const seller = await one(`select public.cm_save_seller(${O}, null, 'Vendedora Conc', 'VC1', 'internal', null, null, date '2026-01-01', null, null, 'active', null)`, { asOwner: true });
  const plan = JSON.parse(await one(`select public.cm_create_plan(${O}, 'Plano conc', null, 'net_value', 'sale_confirmation', 'individual', 'proportional')::text`, { asOwner: true }));
  await one(`select public.cm_save_plan_draft(${O}, '${plan.version_id}', '{"rules":[{"name":"Global 5%","rule_type":"percentage","rate":"0.05"}]}'::jsonb)`, { asOwner: true });
  await one(`select public.cm_publish_plan_version(${O}, '${plan.version_id}', date '2026-01-01')`, { asOwner: true });
  await one(`select public.cm_assign_plan(${O}, '${seller}', '${plan.plan_id}', date '2026-01-01')`, { asOwner: true });
  const mkSale = async (no, amount) => {
    const id = await one(`select public.cm_save_sale_draft(${O}, null, '{"sale_number":"${no}","sale_date":"2026-03-10","split_model":"independent"}', '[{"quantity":"1","unit_price_cents":${amount},"discount_cents":0}]', '[{"seller_id":"${seller}","allocation_percentage":"100","participation_type":"primary"}]')`, { asOwner: true });
    return id;
  };
  const ruleId = await one(`select id from public.commission_rules where plan_version_id = '${plan.version_id}'`);
  const payload = async (saleId, amount) => {
    const item = await one(`select id from public.sale_items where sale_id = '${saleId}'`);
    const key = `c:${saleId}:${seller}:${item}:${ruleId}`;
    return { key, item, details: JSON.stringify([{ componentKey: key, saleId, itemId: item, sellerId: seller, planVersionId: plan.version_id, ruleId, baseCents: amount, rate: '0.05', potentialCents: amount / 20, eligibleCents: amount / 20, snapshot: { engine: '1.0.0' } }]),
      entry: (n, type = 'commission', cents = amount / 20, extra = {}) => ({ idempotencyKey: `${key}|${seller}#${n}`, componentKey: key, sellerId: seller, saleId, itemId: item, planVersionId: plan.version_id, ruleId, entryType: type, amountCents: cents, effectiveAt: '2026-03-10', eligibleAt: '2026-03-10', cause: type === 'reversal' ? 'return' : 'initial', ...extra }) };
  };
  const post = (p, entries) => `select public.cm_post_calculation(${O}, 'sale', date '2026-03-01', date '2026-03-31', '1', repeat('a', 64), null, '${p.details}'::jsonb, '${JSON.stringify(entries)}'::jsonb, '[]')`;

  console.log('> mesma venda processada por 8 sessões ao mesmo tempo');
  const sale1 = await mkSale('V-C1', 2000000);
  await one(`select public.cm_confirm_sale(${O}, '${sale1}')`, { asOwner: true });
  const p1 = await payload(sale1, 2000000);
  const r1 = await fire(8, () => psql(post(p1, [p1.entry(1)]), { asOwner: true }));
  check(oks(r1) === 8, 'todas as 8 chamadas terminam sem erro (idempotentes)');
  check((await one(`select count(*) from public.commission_entries where sale_id = '${sale1}'`)) === '1', 'exatamente UM lançamento de comissão (sem duplicar)');
  check((await one(`select sum(amount_cents) from public.commission_entries where sale_id = '${sale1}'`)) === '100000', 'soma exata R$ 1.000,00');
  check((await one(`select count(*) from public.commission_calculation_details where sale_id = '${sale1}'`)) === '1', 'memória de cálculo gravada UMA vez (processamentos simultâneos se enfileiram)');

  console.log('> o mesmo estorno (mesmo evento) em 6 sessões, com chaves diferentes');
  const orig = `${p1.key}|${seller}#1`;
  const r2 = await fire(6, (k) => psql(post(p1, [p1.entry(10 + k, 'reversal', -10000, { originalIdempotencyKey: orig, sourceEventId: 'dev-1' })]), { asOwner: true }));
  check(oks(r2) === 6, 'nenhuma chamada falha');
  check((await one(`select count(*) from public.commission_entries where entry_type = 'reversal' and sale_id = '${sale1}'`)) === '1', 'o estorno do evento é aplicado UMA vez');

  console.log('> aprovação do mesmo lançamento em 6 sessões');
  const entry1 = await one(`select id from public.commission_entries where entry_type = 'commission' and sale_id = '${sale1}'`);
  const rev1 = await one(`select id from public.commission_entries where entry_type = 'reversal' and sale_id = '${sale1}'`);
  const r3 = await fire(6, () => psql(`select public.cm_review_entries(${O}, array['${entry1}']::uuid[], 'approve', null)`, { asOwner: true }));
  check(oks(r3) === 1, 'só UMA aprovação vence; as demais são recusadas (estado inválido)');
  check(r3.filter((r) => r.code !== 0).every((r) => /estado inválido/.test(r.err)), 'as perdedoras recebem a mensagem da regra (estado inválido), não um erro técnico');
  check((await one(`select count(*) from public.commission_approval_events where commission_entry_id = '${entry1}' and decision = 'approved'`)) === '1', 'uma única decisão registrada');
  await one(`select public.cm_review_entries(${O}, array['${rev1}']::uuid[], 'approve', null)`, { asOwner: true });

  console.log('> confirmação da mesma venda em 6 sessões');
  const draft = await mkSale('V-C2', 1000000);
  const r4 = await fire(6, () => psql(`select public.cm_confirm_sale(${O}, '${draft}')`, { asOwner: true }));
  check(oks(r4) === 1, 'só UMA confirmação vence');
  check(r4.filter((r) => r.code !== 0).every((r) => /já foi confirmada/.test(r.err)), 'as perdedoras recebem a mensagem da regra (já foi confirmada), não um erro técnico');
  check((await one(`select count(*) from public.sale_events where sale_id = '${draft}' and event_type = 'confirmed'`)) === '1', 'um único evento de confirmação');

  console.log('> mesmo recebimento (mesma referência) em 6 sessões');
  const r5 = await fire(6, () => psql(`select public.cm_register_receipt(${O}, '${draft}', 400000, date '2026-03-12', 'REC-C2', null)`, { asOwner: true }));
  check(oks(r5) >= 1, 'chamadas idempotentes');
  check((await one(`select count(*) from public.customer_receipts where sale_id = '${draft}' and status = 'confirmed'`)) === '1', 'um único recebimento');
  check((await one(`select coalesce(sum(amount_cents),0) from public.customer_receipts where sale_id = '${draft}' and status = 'confirmed'`)) === '400000', 'valor recebido não dobra');

  console.log('> fechamento: 4 sessões tentam fechar o mesmo período');
  const per = await one(`select public.cm_open_period(${O}, date '2026-03-01', date '2026-03-31')`, { asOwner: true });
  const prep = JSON.parse(await one(`select public.cm_prepare_closings(${O}, '${per}')::text`, { asOwner: true }));
  check(prep.closings === 1, 'um fechamento montado com o lançamento aprovado');
  await one(`select public.cm_submit_period(${O}, '${per}')`, { asOwner: true });
  const r6 = await fire(4, () => psql(`select public.cm_close_period(${O}, '${per}')`, { asOwner: true }));
  check(oks(r6) === 1, 'só UM fechamento vence');
  check((await one(`select count(*) from public.commission_closing_items where voided_at is null`)) === '2', 'cada lançamento em UM fechamento (comissão + estorno)');
  const closing = await one(`select id from public.commission_closings where period_id = '${per}' and status = 'closed'`);
  const payable = Number(await one(`select payable_amount_cents from public.commission_closings where id = '${closing}'`));
  check(payable === 90000, 'a pagar R$ 900,00 (1.000 − 100 de estorno)');

  console.log('> 5 pagamentos simultâneos de 60% do saldo cada');
  const part = Math.round(payable * 0.6);
  const r7 = await fire(5, (k) => psql(`select public.cm_record_payout(${O}, '${seller}', date '2026-04-05', 'pix', 'PIX-${k}', null, '[{"closing_id":"${closing}","amount_cents":${part}}]'::jsonb)`, { asOwner: true }));
  check(oks(r7) === 1, 'só UM pagamento cabe no saldo; os outros são recusados');
  check(r7.filter((r) => r.code !== 0).every((r) => /excede o saldo/.test(r.err)), 'os recusados recebem a mensagem da regra (excede o saldo)');
  const paid = Number(await one(`select coalesce(sum(a.amount_cents),0) from public.payout_allocations a join public.payout_records p on p.id = a.payout_id where a.closing_id = '${closing}' and p.status = 'recorded'`));
  check(paid <= payable, `total registrado (${paid}) não passa do saldo aprovado (${payable})`);

  console.log('> mesma referência de pagamento em 4 sessões (restante do saldo)');
  const rest = payable - paid;
  const r8 = await fire(4, () => psql(`select public.cm_record_payout(${O}, '${seller}', date '2026-04-06', 'ted', 'TED-UNICA', null, '[{"closing_id":"${closing}","amount_cents":${rest}}]'::jsonb)`, { asOwner: true }));
  check(oks(r8) === 1, 'só UM registro com a mesma referência');
  check((await one(`select count(*) from public.payout_records where external_reference = 'TED-UNICA' and status = 'recorded'`)) === '1', 'uma única linha de pagamento');
  const total = Number(await one(`select coalesce(sum(a.amount_cents),0) from public.payout_allocations a join public.payout_records p on p.id = a.payout_id where a.closing_id = '${closing}' and p.status = 'recorded'`));
  check(total === payable, 'saldo quitado exatamente, sem excesso');
} catch (e) {
  console.error(String(e.message ?? e));
  failed++;
} finally {
  docker(['rm', '-f', name]);
}
console.log(failed ? `CONCORRÊNCIA: ${failed} FALHA(S)` : 'CONCORRÊNCIA: TODOS OS TESTES PASSARAM');
process.exit(failed ? 1 : 0);
