#!/usr/bin/env node
// Teste de mutação das regras críticas (motor TypeScript E banco): quebra cada regra DE PROPÓSITO numa cópia do código
// e exige que a suíte reprove. Se alguma mutação sobreviver, falta teste.
//   suite 'unit' → vitest nos testes do motor (tests/unit/engine-*.test.ts)
//   Mutantes equivalentes (comportamento idêntico) foram removidos da lista: base ≤ 0 em faixas e primeira faixa «gt» vs «gte».
//   suite 'db'   → pnpm test:db (testes SQL com fixtures à mão)
//   suite 'conc' → pnpm test:concurrency (sessões simultâneas reais; rode SEM outra carga na máquina)
// Cada mutação aponta para a definição VIVA (as migrações não redefinem funções umas das outras).
// Uso: node scripts/mutation-check.mjs [--only <trecho do nome>] [--jobs 3] [--check]
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split('|') : null;
const wanted = (m) => !only || only.some((o) => m.name.includes(o));
const jobs = Number(args.includes('--jobs') ? args[args.indexOf('--jobs') + 1] : 3);

const E = 'lib/commissions/engine/';
// { name, file (trecho do arquivo de migração) | ts (caminho do arquivo TS), find, replace, nth (qual ocorrência; omitido = única), suite }
const M = [
  // ---------------------------------------------------------------- motor TS: dinheiro e arredondamento
  { name: 'dinheiro: arredondamento truncado', ts: `${E}decimal.ts`, find: 'd.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)', replace: 'd.toDecimalPlaces(0, Decimal.ROUND_DOWN)' },
  { name: 'dinheiro: taxa acima de 100% aceita', ts: `${E}decimal.ts`, find: 'if (d.isNegative() || d.gt(1)) throw', replace: 'if (d.isNegative()) throw' },
  { name: 'dinheiro: taxa negativa aceita', ts: `${E}decimal.ts`, find: 'if (d.isNegative() || d.gt(1)) throw', replace: 'if (d.gt(1)) throw' },
  { name: 'dinheiro: número fracionário binário aceito', ts: `${E}decimal.ts`, find: "if (typeof v === 'number' && !Number.isInteger(v)) {", replace: 'if (false) {' },
  { name: 'dinheiro: centavos não inteiros aceitos', ts: `${E}decimal.ts`, find: 'if (!Number.isSafeInteger(v)) throw new CommissionError(\'INVALID_CENTS\', `${what}', replace: 'if (false) throw new CommissionError(\'INVALID_CENTS\', `${what}' },
  { name: 'moeda: negativo perde o sinal na leitura', ts: `${E}money.ts`, find: 'return neg ? (n === 0 ? 0 : -n) : n;', replace: 'return n;' },
  { name: 'moeda: centavos sem zero à esquerda', ts: `${E}money.ts`, find: "const cent = String(abs % 100).padStart(2, '0');", replace: "const cent = String(abs % 100).padStart(1, '0');" },
  { name: 'moeda: percentual acima de 100% aceito', ts: `${E}money.ts`, find: "if (r.gt(1)) throw new CommissionError('INVALID_RATE'", replace: "if (false) throw new CommissionError('INVALID_RATE'" },
  { name: 'moeda: separador de milhar ambíguo aceito', ts: `${E}money.ts`, find: '} else if (/^\\d{1,3}(\\.\\d{3})+$/.test(s)) {', replace: '} else if (/^\\d+(\\.\\d{3})+$/.test(s) || /^\\d+\\.\\d{3}$/.test(s)) {' },
  // ---------------------------------------------------------------- motor TS: rateio
  { name: 'rateio: sobra sem distribuir o último centavo', ts: `${E}split.ts`, find: 'if (remaining <= 0) break;', replace: 'if (remaining <= 1) break;' },
  { name: 'rateio: sobra distribui além do resto', ts: `${E}split.ts`, find: 'if (remaining <= 0) break;', replace: 'if (remaining < 0) break;' },
  { name: 'rateio: desempate invertido', ts: `${E}split.ts`, find: ': a.i - b.i));', replace: ': b.i - a.i));' },
  { name: 'rateio: maior resto trocado por menor', ts: `${E}split.ts`, find: '(b.frac.comparedTo(a.frac) !== 0 ? b.frac.comparedTo(a.frac) :', replace: '(b.frac.comparedTo(a.frac) !== 0 ? a.frac.comparedTo(b.frac) :' },
  { name: 'rateio: valor negativo perde o sinal', ts: `${E}split.ts`, find: 'const sign = totalCents < 0 ? -1 : 1;', replace: 'const sign = 1;' },
  { name: 'rateio: peso negativo aceito', ts: `${E}split.ts`, find: 'if (w.some((x) => x.isNegative())) throw', replace: 'if (false) throw' },
  { name: 'rateio: pool que não soma 100% aceito', ts: `${E}split.ts`, find: '.eq(100);', replace: '.gte(100);' },
  // ---------------------------------------------------------------- motor TS: faixas
  { name: 'faixas: teto da faixa exclusivo (marginal)', ts: `${E}tiers.ts`, find: 'cumBaseCents.lte(t.toCents)', replace: 'cumBaseCents.lt(t.toCents)', nth: 1 },
  { name: 'faixas: teto da faixa exclusivo (memória)', ts: `${E}tiers.ts`, find: 'cumBaseCents.lte(t.toCents)', replace: 'cumBaseCents.lt(t.toCents)', nth: 2 },
  { name: 'faixas: marginal incide sobre a base toda', ts: `${E}tiers.ts`, find: 'total = total.plus(upper.minus(t.fromCents).times(rate(t.rate)));', replace: 'total = total.plus(upper.times(rate(t.rate)));' },
  { name: 'faixas: primeira faixa fora de zero aceita', ts: `${E}tiers.ts`, find: 'if (i === 0 && b.fromCents !== 0) issues.push', replace: 'if (false) issues.push' },
  { name: 'faixas: lacuna entre faixas aceita', ts: `${E}tiers.ts`, find: 'else if (b.fromCents > prev.toCents) issues.push', replace: 'else if (false) issues.push' },
  { name: 'faixas: sobreposição aceita', ts: `${E}tiers.ts`, find: 'else if (b.fromCents < prev.toCents) issues.push', replace: 'else if (false) issues.push' },
  { name: 'faixas: última faixa com teto aceita', ts: `${E}tiers.ts`, find: 'if (i === sorted.length - 1 && b.toCents !== null) issues.push', replace: 'if (false) issues.push' },
  { name: 'faixas: faixa aberta no meio aceita', ts: `${E}tiers.ts`, find: 'if (prev.toCents === null) issues.push', replace: 'if (false) issues.push' },
  { name: 'faixas: fim menor que o início aceito', ts: `${E}tiers.ts`, find: 'b.toCents <= b.fromCents)', replace: 'b.toCents < b.fromCents)' },
  { name: 'faixas: ordens duplicadas aceitas', ts: `${E}tiers.ts`, find: 'if (orders.size !== sorted.length) issues.push', replace: 'if (false) issues.push' },
  // ---------------------------------------------------------------- motor TS: condições e regras
  { name: 'condição: fato não autorizado aceito', ts: `${E}conditions.ts`, find: 'if (!FACTS.includes(o.fact as Fact)) bad(', replace: 'if (false) bad(' },
  { name: 'condição: operador não autorizado aceito', ts: `${E}conditions.ts`, find: 'if (!OPS.includes(o.op as Op)) bad(', replace: 'if (false) bad(' },
  { name: 'condição: sem limite de profundidade', ts: `${E}conditions.ts`, find: 'const MAX_DEPTH = 4;', replace: 'const MAX_DEPTH = 400;' },
  { name: 'condição: sem limite de tamanho', ts: `${E}conditions.ts`, find: 'const MAX_NODES = 30;', replace: 'const MAX_NODES = 3000;' },
  { name: 'condição: between exclusivo no teto', ts: `${E}conditions.ts`, find: 'a.gte(lo) && a.lte(hi)', replace: 'a.gte(lo) && a.lt(hi)' },
  { name: 'condição: between exclusivo no piso', ts: `${E}conditions.ts`, find: 'a.gte(lo) && a.lte(hi)', replace: 'a.gt(lo) && a.lte(hi)' },
  { name: 'condição: «diferente de» invertido', ts: `${E}conditions.ts`, find: "case 'ne': return !eq(actual, l.value);", replace: "case 'ne': return eq(actual, l.value);" },
  { name: 'condição: «não está em» invertido', ts: `${E}conditions.ts`, find: "case 'not_in': return !(l.value", replace: "case 'not_in': return (l.value" },
  { name: 'condição: comparação numérica em texto aceita', ts: `${E}conditions.ts`, find: "&& !NUMERIC.has(fact)) bad('Comparação numérica em fato não numérico.');", replace: "&& false) bad('Comparação numérica em fato não numérico.');" },
  { name: 'condição: «not» negação perdida', ts: `${E}conditions.ts`, find: 'return !evalCondition(c.not, facts);', replace: 'return evalCondition(c.not, facts);' },
  { name: 'condição: «all» vira «any»', ts: `${E}conditions.ts`, find: "if ('all' in c) return c.all.every(", replace: "if ('all' in c) return c.all.some(" },
  { name: 'regras: vence a menor especificidade', ts: `${E}rules.ts`, find: 'const bestRank = Math.min(', replace: 'const bestRank = Math.max(' },
  { name: 'regras: vence a menor prioridade', ts: `${E}rules.ts`, find: 'const bestPrio = Math.max(', replace: 'const bestPrio = Math.min(' },
  { name: 'regras: empate escolhe ao acaso', ts: `${E}rules.ts`, find: 'if (finalists.length > 1) return { winner: null', replace: 'if (finalists.length > 99) return { winner: null' },
  { name: 'regras: vigência inicial exclusiva', ts: `${E}rules.ts`, find: 'r.validFrom <= ctx.date', replace: 'r.validFrom < ctx.date' },
  { name: 'regras: vigência final exclusiva', ts: `${E}rules.ts`, find: 'ctx.date <= r.validUntil', replace: 'ctx.date < r.validUntil' },
  { name: 'regras: regra desativada aplicada', ts: `${E}rules.ts`, find: '.filter((r) => r.enabled && kindsOk(r))', replace: '.filter((r) => kindsOk(r))' },
  { name: 'regras: regras empilháveis ignoradas', ts: `${E}rules.ts`, find: "const stackers = matching.filter((r) => r.stack === 'stack');", replace: 'const stackers: typeof matching = [];' },
  { name: 'regras: escopo de equipe sem checar a equipe', ts: `${E}rules.ts`, find: "case 'team': return r.scopeReference !== null && r.scopeReference === ctx.seller.teamId;", replace: "case 'team': return true;" },
  { name: 'plano: publicação sem regra ativa', ts: `${E}rules.ts`, find: "if (plan.rules.filter((r) => r.enabled).length === 0) issues.push", replace: 'if (false) issues.push' },
  { name: 'plano: base recebida com elegibilidade errada', ts: `${E}rules.ts`, find: "plan.eligibility !== 'proportional_receipt'", replace: "plan.eligibility === 'proportional_receipt'" },
  { name: 'plano: conflito estático não detectado', ts: `${E}rules.ts`, find: 'if (a.priority === b.priority && a.scopeReference === b.scopeReference && overlap', replace: 'if (false && a.priority === b.priority && a.scopeReference === b.scopeReference && overlap' },
  { name: 'plano: bônus percentual aceito', ts: `${E}rules.ts`, find: "if (r.entryKind === 'bonus' && r.kind !== 'fixed') issues.push", replace: 'if (false) issues.push' },
  { name: 'plano: vigência invertida aceita', ts: `${E}rules.ts`, find: 'if (r.validFrom && r.validUntil && r.validFrom > r.validUntil) issues.push', replace: 'if (false) issues.push' },
  { name: 'plano: escopo sem alvo aceito', ts: `${E}rules.ts`, find: "if (r.scopeType !== 'organization' && !r.scopeReference) issues.push", replace: 'if (false) issues.push' },
  { name: 'plano: taxa inválida aceita', ts: `${E}rules.ts`, find: "try { if (r.rate === null) throw new Error(); parseRate(r.rate); }", replace: 'try { if (r.rate === null) throw new Error(); }' },
  // ---------------------------------------------------------------- motor TS: cálculo
  { name: 'cálculo: soma dos itens não conferida', ts: `${E}calculate.ts`, find: 'if (sumItems !== sale.commissionableCents) return fail(', replace: 'if (false) return fail(' },
  { name: 'cálculo: devolução por item não confere o total', ts: `${E}calculate.ts`, find: 'if (total !== r.amountCents) return fail(', replace: 'if (false) return fail(' },
  { name: 'cálculo: devolução acima do item não limitada', ts: `${E}calculate.ts`, find: 'if (c > room) {', replace: 'if (false) {' },
  { name: 'cálculo: venda devolvida por inteiro não cancela', ts: `${E}calculate.ts`, find: "const cancelled = sale.status === 'cancelled' || sale.status === 'totally_returned';", replace: "const cancelled = sale.status === 'cancelled';" },
  { name: 'cálculo: recebimento integral com «maior» em vez de «maior ou igual»', ts: `${E}calculate.ts`, find: 'if (cum.gte(c.dueNet))', replace: 'if (cum.gt(c.dueNet))' },
  { name: 'cálculo: razão de recebimento sem teto de 100%', ts: `${E}calculate.ts`, find: 'ratio: ratio.gt(1) ? new D(1) : ratio,', replace: 'ratio,' },
  { name: 'cálculo: base «recebido» conta a razão duas vezes', ts: `${E}calculate.ts`, find: "const elig = plan.basis === 'received_value' ? { ...eligRaw, ratio: new D(1) } : eligRaw;", replace: 'const elig = eligRaw;' },
  { name: 'cálculo: vendedor repetido aceito', ts: `${E}calculate.ts`, find: 'if (new Set(parts.map((p) => p.seller.id)).size !== parts.length) {', replace: 'if (false) {' },
  { name: 'cálculo: pool sem principal único aceito', ts: `${E}calculate.ts`, find: 'if (parts.filter((p) => p.isPrimary).length !== 1) {', replace: 'if (false) {' },
  { name: 'cálculo: pool que não soma 100% aceito', ts: `${E}calculate.ts`, find: 'if (!poolSumsTo100(parts.map((p) => p.allocationPct))) {', replace: 'if (false) {' },
  { name: 'cálculo: venda sem plano calcula', ts: `${E}calculate.ts`, find: 'if (!plan) {', replace: 'if (false as boolean && !plan) {' },
  { name: 'cálculo: cancelamento com estorno manual calcula sozinho', ts: `${E}calculate.ts`, find: "if (ctx.cancelled && plan.returnsPolicy === 'manual') {", replace: 'if (false) {' },
  { name: 'cálculo: margem sem custo presumida', ts: `${E}calculate.ts`, find: 'if (m === null) {', replace: 'if (false as boolean) {' },
  { name: 'cálculo: margem negativa aceita', ts: `${E}calculate.ts`, find: 'return new D(Math.max(0, m));', replace: 'return new D(m);' },
  { name: 'cálculo: margem ignora devoluções', ts: `${E}calculate.ts`, find: 'itemBase = item.commissionableCents > 0 ? m.times(remItem).div(item.commissionableCents) : ZERO;', replace: 'itemBase = m;' },
  { name: 'cálculo: recebido acima do item não limitado', ts: `${E}calculate.ts`, find: 'const capped = Math.min(got, Math.max(0, remItem));', replace: 'const capped = got;' },
  { name: 'cálculo: fixo por unidade conta unidades devolvidas', ts: `${E}calculate.ts`, find: 'const q = qtyValid.lt(0) ? ZERO : qtyValid;', replace: 'const q = dec(item.quantity);' },
  { name: 'cálculo: fixo por venda paga em venda totalmente devolvida', ts: `${E}calculate.ts`, find: 'ctx.remFrac.gt(0) || ignoreReturns ? new D(rule.fixedAmountCents ?? 0) : ZERO', replace: 'new D(rule.fixedAmountCents ?? 0)' },
  { name: 'cálculo: elegível sem a razão', ts: `${E}calculate.ts`, find: 'const eligC = p.ratio.eq(1) ? potC : roundCents(p.potential.times(p.ratio));', replace: 'const eligC = potC;' },
  { name: 'cálculo: faixas sem acumular por período', ts: `${E}calculate.ts`, find: 'groupKey: `${rule.id}|${groupScope}|${periodKey(periodDate, t.period)}`,', replace: 'groupKey: `${rule.id}|${groupScope}`,' },
  { name: 'cálculo: faixa de equipe acumulada por vendedor', ts: `${E}calculate.ts`, find: "const groupScope = t.scope === 'team' ?", replace: "const groupScope = t.scope === 'team' && false ?" },
  { name: 'cálculo: trimestre errado', ts: `${E}calculate.ts`, find: 'Math.ceil(m / 3)', replace: 'Math.floor(m / 3)' },
  { name: 'cálculo: faixa lança o acumulado e não a diferença', ts: `${E}calculate.ts`, find: 'const inc = rounded - prevR;', replace: 'const inc = rounded;' },
  { name: 'cálculo: faixas fora da ordem cronológica', ts: `${E}calculate.ts`, find: 'evs.sort((a, b) => cmp(a.order, b.order) || cmp(a.key, b.key));', replace: 'evs.sort((a, b) => cmp(b.order, a.order) || cmp(a.key, b.key));' },
  { name: 'cálculo: devolução de faixa não reduz o acumulado', ts: `${E}calculate.ts`, find: 'mk(\'ret\', ev.id, ev.date, neg.negated(), sale.date,', replace: 'mk(\'ret\', ev.id, ev.date, ZERO, sale.date,' },
  // ---------------------------------------------------------------- motor TS: alvo × livro (idempotência, estorno)
  { name: 'livro: diferença zero gera lançamento', ts: `${E}calculate.ts`, find: 'if (delta === 0) return;', replace: 'if (false) return;' },
  { name: 'livro: lança o alvo inteiro, não a diferença', ts: `${E}calculate.ts`, find: 'const delta = target - sum;', replace: 'const delta = target;' },
  { name: 'livro: estorno sem referência ao original', ts: `${E}calculate.ts`, find: 'originalIdempotencyKey: delta < 0 ? origin : null,', replace: 'originalIdempotencyKey: null,' },
  { name: 'livro: ajuste negativo vira estorno', ts: `${E}calculate.ts`, find: "type = cause === 'recalculation' ? 'adjustment_negative' : 'reversal';", replace: "type = 'reversal';" },
  { name: 'livro: venda protegida é estornada', ts: `${E}calculate.ts`, find: 'if (!ctx || protect.some((p) => b.componentKey.startsWith(p))) continue;', replace: 'if (!ctx) continue;' },
  { name: 'livro: estorno antes do lançamento original', ts: `${E}calculate.ts`, find: 'Number(a.isReturnEvent) - Number(b.isReturnEvent)', replace: 'Number(b.isReturnEvent) - Number(a.isReturnEvent)' },
  { name: 'livro: chave de idempotência sem sequência', ts: `${E}calculate.ts`, find: 'const idem = `${c.key}|${sellerId}#${n}`;', replace: 'const idem = `${c.key}|${sellerId}#1`;' },
  // ---------------------------------------------------------------- motor TS: metas e bônus
  { name: 'meta: atingir exatamente a meta não conta', ts: `${E}goals.ts`, find: 'const reached = prog.attainment.gte(', replace: 'const reached = prog.attainment.gt(' },
  { name: 'meta: bônus de fim de período pago antes do fim', ts: `${E}goals.ts`, find: "|| asOf > goal.periodEnd;", replace: '|| true;' },
  { name: 'meta: bônus lançado é estornado sozinho', ts: `${E}goals.ts`, find: 'target = already; // nunca estorna automaticamente', replace: '' },
  { name: 'meta: pendência de bônus sem sustentação silenciada', ts: `${E}goals.ts`, find: "pendencies.push({ code: 'BONUS_BELOW_THRESHOLD'", replace: "[].push({ code: 'BONUS_BELOW_THRESHOLD'" },
  { name: 'meta: venda devolvida por inteiro conta', ts: `${E}goals.ts`, find: "s.status === 'confirmed' || s.status === 'partially_returned'", replace: "s.status === 'confirmed' || s.status === 'partially_returned' || s.status === 'totally_returned'" },
  { name: 'meta: crédito de equipe passa de 100%', ts: `${E}goals.ts`, find: 'return D.min(sum, new D(100)).div(100);', replace: 'return sum.div(100);' },
  { name: 'meta: período exclusivo no fim', ts: `${E}goals.ts`, find: 'date >= g.periodStart && date <= g.periodEnd', replace: 'date >= g.periodStart && date < g.periodEnd' },
  { name: 'meta: cliente novo contado em duplicidade', ts: `${E}goals.ts`, find: 'if (!seen.has(key) && !amountFor(goal, s, null).isZero())', replace: 'if (!amountFor(goal, s, null).isZero())' },
  { name: 'meta: devolução não reduz o valor vendido', ts: `${E}goals.ts`, find: 'const rem = sale.commissionableCents - [...prep.retByItem.values()].reduce((a, b) => a + b, 0);', replace: 'const rem = sale.commissionableCents;' },
  { name: 'meta: atingimento sem meta divide por zero', ts: `${E}goals.ts`, find: 'target.gt(0) ? total.div(target) : new D(0)', replace: 'total.div(target)' },

  // ---------------------------------------------------------------- E/S: exportação CSV e importação
  { name: 'exportação: «@» não neutralizado', ts: 'lib/commissions/csv.ts', find: 'const danger = /^[=+\\-@\\t\\r]/.test(s);', replace: 'const danger = /^[=+\\-\\t\\r]/.test(s);' },
  { name: "exportação: aspas não duplicadas", ts: 'lib/commissions/csv.ts', find: "`\"${safe.replace(/\"/g, '\"\"')}\"`", replace: "`\"${safe}\"`" },
  { name: "exportação: decimal com ponto", ts: 'lib/commissions/csv.ts', find: "centsToDecimalText(cents).replace('.', ',')", replace: "centsToDecimalText(cents)" },
  { name: "exportação: data sem formato brasileiro", ts: 'lib/commissions/csv.ts', find: "? `${m[3]}/${m[2]}/${m[1]}` :", replace: "? `${m[1]}-${m[2]}-${m[3]}` :" },
  { name: "importação: binário aceito", ts: 'lib/commissions/import-core.ts', find: "if (text.includes('\\u0000')) throw", replace: "if (false) throw" },
  { name: "importação: limite de linhas ignorado", ts: 'lib/commissions/import-core.ts', find: "if (data.length - 1 > MAX_ROWS) throw", replace: "if (false) throw" },
  { name: "importação: arquivo gigante aceito", ts: 'lib/commissions/import-core.ts', find: "if (text.length > MAX_BYTES) throw", replace: "if (false) throw" },
  { name: "importação: coluna repetida aceita", ts: 'lib/commissions/import-core.ts', find: "new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length", replace: "false" },
  { name: "importação: cabeçalho enorme aceito", ts: 'lib/commissions/import-core.ts', find: "headers.some((h) => h.length > 120) ||", replace: "false ||" },
  { name: "importação: célula sem corte", ts: 'lib/commissions/import-core.ts', find: ".trim().slice(0, 500))", replace: ".trim())" },
  { name: "importação: data inexistente aceita (31/02)", ts: 'lib/commissions/import-core.ts', find: "dt.toISOString().slice(0, 10) === iso ? iso : null", replace: "true ? iso : null" },
  { name: "importação: percentual acima de 100 aceito", ts: 'lib/commissions/import-core.ts', find: "Number(s) <= 100 ? s : null", replace: "Number(s) <= 1000 ? s : null" },
  { name: "importação: percentual zero aceito", ts: 'lib/commissions/import-core.ts', find: "&& Number(s) > 0 && Number(s) <= 100", replace: "&& Number(s) >= 0 && Number(s) <= 100" },
  { name: "importação: quantidade zero aceita", ts: 'lib/commissions/import-core.ts', find: "&& Number(s) > 0 ? s : null", replace: "&& Number(s) >= 0 ? s : null" },
  { name: 'importação: mesma coluna mapeada duas vezes', ts: 'lib/commissions/import-core.ts', find: 'const i = nh.findIndex((h, ix) => !used.has(ix) && names.includes(h));', replace: 'const i = nh.findIndex((h) => names.includes(h));' },
  // ---------------------------------------------------------------- banco: vendas, devoluções, recebimentos
  { name: 'banco/venda: confirmada pode ser editada', file: 'cm_sales.sql', find: "if st <> 'draft' then raise exception 'venda confirmada não pode ser editada", replace: "if false then raise exception 'venda confirmada não pode ser editada" },
  { name: 'banco/venda: confirmar duas vezes', file: 'cm_sales.sql', find: "if s.status <> 'draft' then raise exception 'a venda já foi confirmada'", replace: "if false then raise exception 'a venda já foi confirmada'" },
  { name: 'banco/venda: totais divergentes aceitos', file: 'cm_sales.sql', find: "raise exception 'os totais da venda não conferem com os itens'", replace: "null; -- 'os totais da venda não conferem com os itens'" },
  { name: 'banco/venda: pool que não soma 100% aceito', file: 'cm_sales.sql', find: "if s.split_model = 'pool' and sum_pct <> 100 then raise exception", replace: "if false then raise exception" },
  { name: 'banco/venda: principal único não exigido', file: 'cm_sales.sql', find: "if n_primary <> 1 then raise exception", replace: "if false then raise exception" },
  { name: 'banco/venda: vendedor inativo na data aceito', file: 'cm_sales.sql', find: "if p.sstatus <> 'active' or p.starts_at > s.sale_date", replace: "if false and p.starts_at > s.sale_date" },
  { name: 'banco/venda: venda sem plano vigente confirmada', file: 'cm_sales.sql', find: "if v_ver is null and (s.split_model = 'independent' or p.participation_type = 'primary') then", replace: 'if false then' },
  { name: 'banco/venda: devolução acima do saldo da venda', file: 'cm_sales.sql', find: 'if p_amount > rem then raise exception', replace: 'if false then raise exception' },
  { name: 'banco/venda: devolução acima do saldo do item', file: 'cm_sales.sql', find: 'if v > item_rem then raise exception', replace: 'if false then raise exception' },
  { name: 'banco/venda: devolução em venda não confirmada', file: 'cm_sales.sql', find: "if s.status not in ('confirmed', 'partially_returned') then raise exception 'só vendas confirmadas aceitam devolução'", replace: "if false then raise exception 'só vendas confirmadas aceitam devolução'" },
  { name: 'banco/venda: recebimento acima do devido', file: 'cm_sales.sql', find: 'if got + p_amount > due and not coalesce(allow, false) then', replace: 'if false then' },
  { name: 'banco/venda: recebimento no futuro', file: 'cm_sales.sql', find: "if d > private.cm_today(p_org) then raise exception 'data de recebimento no futuro'", replace: "if false then raise exception 'data de recebimento no futuro'" },
  // ---------------------------------------------------------------- banco: lançamentos, aprovação, contestação
  { name: 'banco/lançamento: plano diferente do fixado na venda', file: 'cm_ledger.sql', find: "if owner_ver is distinct from (e ->> 'planVersionId')::uuid then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/lançamento: regra de outro plano aceita', file: 'cm_ledger.sql', find: "r.plan_version_id = (e ->> 'planVersionId')::uuid) then\n      raise exception 'regra não pertence", replace: "r.plan_version_id = (e ->> 'planVersionId')::uuid) and false then\n      raise exception 'regra não pertence" },
  { name: 'banco/lançamento: plano não publicado aceito', file: 'cm_ledger.sql', find: "and v.status = 'published') then\n      raise exception 'plano não publicado'", replace: "and v.status = 'published') and false then\n      raise exception 'plano não publicado'" },
  { name: 'banco/lançamento: bônus acima do valor da regra', file: 'cm_ledger.sql', find: 'if booked_g + (e ->> \'amountCents\')::bigint > br.bonus_amount_cents and not exists', replace: "if false and not exists" },
  { name: 'banco/lançamento: estorno sem original', file: 'cm_ledger.sql', find: "if orig is null then raise exception 'lançamento original não encontrado para o estorno'", replace: "if false then raise exception 'lançamento original não encontrado para o estorno'" },
  { name: 'banco/aprovação: aprovar a própria comissão', file: 'cm_ledger.sql', find: "if e.seller_id = my_seller then raise exception 'ninguém aprova a própria comissão'", replace: "if false then raise exception 'ninguém aprova a própria comissão'" },
  { name: 'banco/aprovação: quem calculou aprova', file: 'cm_ledger.sql', find: "if initiator = (select auth.uid()) then raise exception 'segregação de funções: quem calculou não aprova'", replace: "if false then raise exception 'segregação de funções: quem calculou não aprova'" },
  { name: 'banco/aprovação: aprovar com contestação aberta', file: 'cm_ledger.sql', find: "if p_decision = 'approve' and exists (select 1 from public.commission_disputes x", replace: "if false and exists (select 1 from public.commission_disputes x" },
  { name: 'banco/aprovação: decisão repetida aceita', file: 'cm_ledger.sql', find: "or (p_decision in ('approve', 'reject') and e.approval_status not in ('calculated', 'pending_review'))", replace: "or (p_decision in ('approve', 'reject') and false)" },
  { name: 'banco/aprovação: rejeição sem justificativa', file: 'cm_ledger.sql', find: "if p_decision = 'reject' and char_length(btrim(coalesce(p_justification, ''))) < 10 then raise exception", replace: "if false then raise exception" },
  { name: 'banco/aprovação: gestor aprova fora da equipe', file: 'cm_ledger.sql', find: "if not private.cm_can_see_seller(p_org, e.seller_id) then raise exception 'sem permissão sobre este vendedor'", replace: "if false then raise exception 'sem permissão sobre este vendedor'" },
  { name: 'banco/contestação: duas abertas para o mesmo lançamento', file: 'cm_ledger.sql', find: "if exists (select 1 from public.commission_disputes where commission_entry_id = p_entry and status in ('open', 'in_review')) then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/contestação: encerrada reaberta', file: 'cm_ledger.sql', find: "if d.status in ('resolved', 'rejected') then raise exception 'contestação já encerrada'", replace: "if false then raise exception 'contestação já encerrada'" },
  { name: 'banco/ajuste: decidido duas vezes', file: 'cm_ledger.sql', find: "if a.status <> 'pending' then raise exception 'ajuste já decidido'", replace: "if false then raise exception 'ajuste já decidido'" },
  { name: 'banco/ajuste: quem criou aprova', file: 'cm_ledger.sql', find: "if coalesce(seg, false) and a.created_by = (select auth.uid()) then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/ajuste: valor não positivo', file: 'cm_ledger.sql', find: "if p_amount is null or p_amount <= 0 then raise exception 'o valor do ajuste deve ser positivo", replace: "if false then raise exception 'o valor do ajuste deve ser positivo" },
  // ---------------------------------------------------------------- banco: fechamento e pagamento
  { name: 'banco/fechamento: períodos anteriores abertos', file: 'cm_closing.sql', find: "if (chk ->> 'earlier_open_periods')::int > 0 then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/fechamento: período que não terminou', file: 'cm_closing.sql', find: "if (chk ->> 'period_in_future')::boolean then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/fechamento: inconsistência crítica ignorada (envio)', file: 'cm_closing.sql', find: "if (chk ->> 'blocked')::boolean then raise exception 'há inconsistências críticas que impedem o fechamento'", replace: "if false then raise exception 'há inconsistências críticas que impedem o fechamento'", nth: 1 },
  { name: 'banco/fechamento: inconsistência crítica ignorada (fechar)', file: 'cm_closing.sql', find: "if (chk ->> 'blocked')::boolean then raise exception 'há inconsistências críticas que impedem o fechamento'", replace: "if false then raise exception 'há inconsistências críticas que impedem o fechamento'", nth: 2 },
  { name: 'banco/fechamento: item deixou de estar aprovado', file: 'cm_closing.sql', find: "and e.approval_status <> 'approved') then", replace: "and e.approval_status <> 'approved' and false) then" },
  { name: 'banco/fechamento: quem preparou aprova', file: 'cm_closing.sql', find: "if coalesce(seg, false) and per.prepared_by = (select auth.uid()) then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/fechamento: fechar sem enviar para aprovação', file: 'cm_closing.sql', find: "if per.status <> 'awaiting_approval' then raise exception 'o período não está aguardando aprovação'", replace: "if false then raise exception 'o período não está aguardando aprovação'" },
  { name: 'banco/fechamento: reabrir com pagamento registrado', file: 'cm_closing.sql', find: "where c.period_id = p_period and p.status = 'recorded') then", replace: "where c.period_id = p_period and p.status = 'recorded' and false) then" },
  { name: 'banco/fechamento: reabrir antes dos posteriores', file: 'cm_closing.sql', find: "x.period_start > per.period_end and x.status <> 'cancelled') then", replace: "x.period_start > per.period_end and x.status <> 'cancelled' and false) then" },
  { name: 'banco/fechamento: reabrir sem justificativa', file: 'cm_closing.sql', find: "if char_length(btrim(coalesce(p_reason, ''))) < 20 then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/pagamento: acima do saldo aprovado', file: 'cm_closing.sql', find: 'if amt > bal and not coalesce(allow, false) then raise exception', replace: 'if false then raise exception' },
  { name: 'banco/pagamento: fechamento ainda não concluído', file: 'cm_closing.sql', find: "if c.status <> 'closed' then raise exception 'só fechamentos concluídos recebem pagamento'", replace: "if false then raise exception 'só fechamentos concluídos recebem pagamento'" },
  { name: 'banco/pagamento: quem aprovou o fechamento paga', file: 'cm_closing.sql', find: "if coalesce(seg, false) and c.approved_by = (select auth.uid()) then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/pagamento: data no futuro', file: 'cm_closing.sql', find: "if d > private.cm_today(p_org) then raise exception 'data de pagamento no futuro'", replace: "if false then raise exception 'data de pagamento no futuro'" },
  { name: 'banco/pagamento: fechamento repetido nas alocações', file: 'cm_closing.sql', find: "if array_length(ids, 1) <> jsonb_array_length(p_alloc) then raise exception", replace: 'if false then raise exception' },
  { name: 'banco/pagamento: fechamento de outro vendedor', file: 'cm_closing.sql', find: "if not found or c.seller_id <> p_seller then raise exception", replace: 'if not found then raise exception' },
  // (removido por equivalência: «pagamento já estornado» também é levantado pelo trigger cm_payout_guard, com a mesma mensagem — defesa em duas camadas)
  { name: 'banco/pagamento: referência repetida aceita', file: 'cm_closing.sql', find: "exception when unique_violation then raise exception 'já existe pagamento registrado com esta referência para o vendedor'", replace: "exception when unique_violation then null; -- 'já existe pagamento registrado com esta referência para o vendedor'" },
  // ---------------------------------------------------------------- banco: concorrência (travas de linha)
  { name: 'concorrência: pagamento sem trava do fechamento', file: 'cm_closing.sql', suite: 'conc', find: 'select * into c from public.commission_closings where id = cid and organization_id = p_org for update;', replace: 'select * into c from public.commission_closings where id = cid and organization_id = p_org;' },
  { name: 'concorrência: aprovação sem trava do lançamento', file: 'cm_ledger.sql', suite: 'conc', find: 'select * into e from public.commission_entries where commission_entries.id = v_eid and organization_id = p_org for update;', replace: 'select * into e from public.commission_entries where commission_entries.id = v_eid and organization_id = p_org;' },
  { name: 'concorrência: confirmação sem trava da venda', file: 'cm_sales.sql', suite: 'conc', find: 'select * into s from public.sales where id = p_id and organization_id = p_org for update;\n  if not found then raise exception \'venda não encontrada\' using errcode = \'P0002\'; end if;\n  if s.status <> \'draft\' then raise exception \'a venda já foi confirmada\'', replace: 'select * into s from public.sales where id = p_id and organization_id = p_org;\n  if not found then raise exception \'venda não encontrada\' using errcode = \'P0002\'; end if;\n  if s.status <> \'draft\' then raise exception \'a venda já foi confirmada\'' },
  { name: 'concorrência: processamento da mesma venda sem trava', file: 'cm_ledger.sql', suite: 'conc', find: 'foreach sid in array sale_ids loop perform pg_advisory_xact_lock(hashtextextended(p_org::text || sid::text, 7)); end loop;', replace: 'null;' },
  // (removido por equivalência: «on conflict do nothing» é redundante com o tratamento de unique_violation logo abaixo; a chave única é a defesa real)
  { name: 'concorrência: fechamento do período sem trava', file: 'cm_closing.sql', suite: 'conc', find: "select * into per from public.commission_periods where id = p_period and organization_id = p_org for update;\n  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;\n  if per.status <> 'awaiting_approval'", replace: "select * into per from public.commission_periods where id = p_period and organization_id = p_org;\n  if not found then raise exception 'período não encontrado' using errcode = 'P0002'; end if;\n  if per.status <> 'awaiting_approval'" },
];

const migDir = join(root, 'supabase', 'migrations');
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
const SCRIPT = { db: 'test-db.mjs', conc: 'test-concurrency.mjs' };
const kindOf = (m) => m.suite ?? (m.ts ? 'unit' : 'db');

function runSuite(dir, suite) {
  return new Promise((resolve) => {
    const cmd = suite === 'unit'
      ? [join(dir, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/unit/engine-']
      : [join(dir, 'scripts', SCRIPT[suite])];
    const p = spawn(process.execPath, cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

function applyMutation(path, mutate) {
  const text = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const parts = text.split(mutate.find);
  const nth = mutate.nth ?? 1;
  if (parts.length < 2) throw new Error(`mutação sem alvo: ${mutate.name}`);
  if (parts.length > 2 && !mutate.nth) throw new Error(`mutação ambígua (${parts.length - 1} ocorrências): ${mutate.name}`);
  if (nth > parts.length - 1) throw new Error(`mutação sem a ocorrência ${nth}: ${mutate.name}`);
  writeFileSync(path, parts.slice(0, nth).join(mutate.find) + mutate.replace + parts.slice(nth).join(mutate.find));
}

function workspace(label, mutate, suite) {
  const dir = mkdtempSync(join(tmpdir(), `pack25-cm-mut-${label}-`));
  if (suite === 'unit') {
    for (const d of ['lib', 'tests', 'app', 'components']) cpSync(join(root, d), join(dir, d), { recursive: true });
    for (const f of ['vitest.config.ts', 'tsconfig.json', 'package.json']) cpSync(join(root, f), join(dir, f));
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
    if (mutate) applyMutation(join(dir, mutate.ts), mutate);
    return dir;
  }
  mkdirSync(join(dir, 'scripts'));
  for (const s of Object.values(SCRIPT)) cpSync(join(root, 'scripts', s), join(dir, 'scripts', s));
  cpSync(join(root, 'supabase'), join(dir, 'supabase'), { recursive: true });
  if (mutate) applyMutation(join(dir, 'supabase', 'migrations', files.find((x) => x.includes(mutate.file))), mutate);
  return dir;
}

if (args.includes('--check')) {
  // só confere se cada mutação encontra o seu alvo (rápido; não roda suítes)
  let bad = 0;
  for (const m of M) {
    const path = m.ts ? join(root, m.ts) : join(migDir, files.find((x) => x.includes(m.file)) ?? '');
    const n = readFileSync(path, 'utf8').replaceAll('\r\n', '\n').split(m.find).length - 1;
    if (!(n >= 1 && (m.nth ? m.nth <= n : n === 1))) { bad++; console.log(`SEM ALVO ÚNICO (${n} ocorrências): ${m.name}`); }
  }
  console.log(bad ? `${bad} mutação(ões) com alvo inválido` : `${M.length} mutações com alvo válido`);
  process.exit(bad ? 1 : 0);
}

const todo = M.filter(wanted);
for (const suite of new Set(todo.map(kindOf))) {
  const base = workspace(`base-${suite}`, null, suite);
  const baseline = await runSuite(base, suite);
  rmSync(base, { recursive: true, force: true });
  if (baseline.code !== 0) {
    console.error(`A suíte «${suite}» sem mutação já reprova; corrija antes.\n` + baseline.out.slice(-1500));
    process.exit(2);
  }
}

const survived = [];
const broken = [];
let next = 0;
async function worker() {
  while (next < todo.length) {
    const m = todo[next++];
    const suite = kindOf(m);
    let dir;
    try {
      dir = workspace(String(next), m, suite);
    } catch (e) {
      console.log(`SEM ALVO    ${m.name} — ${e.message}`);
      broken.push(m.name);
      continue;
    }
    const r = await runSuite(dir, suite);
    rmSync(dir, { recursive: true, force: true });
    const killed = r.code !== 0;
    console.log(`${killed ? 'MORTA     ' : 'SOBREVIVEU '} ${m.name}`);
    if (!killed) survived.push(m.name);
  }
}
// a suíte de concorrência é sensível a carga: roda sozinha, depois das demais
const light = todo.filter((m) => kindOf(m) !== 'conc');
const heavy = todo.filter((m) => kindOf(m) === 'conc');
const all = todo.slice();
todo.length = 0;
todo.push(...light);
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
todo.push(...heavy);
await Promise.all(Array.from({ length: 1 }, worker));
console.log(`\n${all.length - survived.length - broken.length}/${all.length} mutações reprovadas pela suíte.`);
if (broken.length) console.error('Mutações sem alvo (o texto mudou):\n- ' + broken.join('\n- '));
if (survived.length) console.error('Sobreviveram:\n- ' + survived.join('\n- '));
if (survived.length || broken.length) process.exit(1);
