'use client';

import { useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/ui/client';
import { Alert, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { assignPlan, checkVersion, createPlan, newVersion, publishVersion, savePlanDraft, updatePlan } from '@/lib/commissions/actions/plans';
import { BASIS_HELP, BASIS_LABEL, ELIGIBILITY_HELP, ELIGIBILITY_LABEL, PLAN_TYPE_LABEL, RETURNS_LABEL, RULE_TYPE_LABEL, SCOPE_LABEL, STACK_LABEL, TIER_MODE_LABEL, TIER_PERIOD_LABEL, TIER_SCOPE_LABEL } from '@/lib/commissions/labels';
import type { Opt } from './bits';
import { ActionButton, CmForm, SelectF, TextF } from './fields';
import { useCmAction } from './use-cm-action';

const entries = (o: Record<string, string>): Opt[] => Object.entries(o).map(([value, label]) => ({ value, label }));

export function PlanCreateForm() {
  const [basis, setBasis] = useState('net_value');
  const [elig, setElig] = useState('sale_confirmation');
  return (
    <CmForm action={createPlan} submit="Criar plano" className="grid gap-4 sm:grid-cols-4">
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome do plano" required max={100} span />
          <TextF f={f} name="description" label="Descrição" max={500} span />
          <div className="sm:col-span-2">
            <Field label="Base de comissionamento" name={f.id('basis')} errors={f.e.basis} hint={BASIS_HELP[basis]}>
              <Select id={f.id('basis')} name="basis" value={basis} onChange={(e) => { setBasis(e.target.value); if (e.target.value === 'received_value') setElig('proportional_receipt'); }}>
                {entries(BASIS_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Quando a comissão fica elegível" name={f.id('eligibility')} errors={f.e.eligibility} hint={ELIGIBILITY_HELP[elig]}>
              <Select id={f.id('eligibility')} name="eligibility" value={elig} onChange={(e) => setElig(e.target.value)} disabled={basis === 'received_value'}>
                {entries(ELIGIBILITY_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              {basis === 'received_value' ? <input type="hidden" name="eligibility" value="proportional_receipt" /> : null}
            </Field>
          </div>
          <SelectF f={f} name="plan_type" label="Tipo (rótulo)" def="individual" opts={entries(PLAN_TYPE_LABEL)} />
          <SelectF f={f} name="returns_policy" label="Devoluções" def="proportional" opts={entries(RETURNS_LABEL)} hint="Estorno proporcional só vale sobre a mesma base do plano." span />
        </>
      )}
    </CmForm>
  );
}

export function PlanMetaForm({ plan }: { plan: { id: string; name: string; description: string | null; status: string } }) {
  return (
    <CmForm action={updatePlan} submit="Salvar" reset={false} className="grid gap-4 sm:grid-cols-4" hidden={{ id: plan.id }}>
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome" def={plan.name} required max={100} span />
          <TextF f={f} name="description" label="Descrição" def={plan.description} max={500} span />
          <SelectF f={f} name="status" label="Situação" def={plan.status} opts={[{ value: 'active', label: 'Ativo' }, { value: 'archived', label: 'Arquivado (não recebe novos vendedores)' }]} />
        </>
      )}
    </CmForm>
  );
}

export function AssignPlanForm({ sellerId, plans, today }: { sellerId: string; plans: Opt[]; today: string }) {
  return (
    <CmForm action={assignPlan} submit="Atribuir plano" className="grid gap-3 sm:grid-cols-3" hidden={{ seller_id: sellerId }}>
      {(f) => (
        <>
          <SelectF f={f} name="plan_id" label="Plano" opts={plans} placeholder="Escolha…" required />
          <TextF f={f} name="valid_from" label="Vale a partir de" type="date" def={today} required />
        </>
      )}
    </CmForm>
  );
}

export function PublishForm({ versionId, defaultFrom }: { versionId: string; defaultFrom: string }) {
  return (
    <CmForm action={publishVersion} submit="Publicar versão" reset={false} className="flex flex-wrap items-end gap-3" hidden={{ version_id: versionId }}>
      {(f) => <TextF f={f} name="valid_from" label="Vigência a partir de" type="date" def={defaultFrom} required hint="Depois de publicada a versão é imutável." />}
    </CmForm>
  );
}
export const NewVersionButton = ({ planId }: { planId: string }) => <ActionButton action={newVersion} fields={{ id: planId }} label="Criar nova versão (cópia da última publicada)" />;
export const CheckVersionButton = ({ versionId }: { versionId: string }) => <ActionButton action={checkVersion} fields={{ id: versionId }} label="Validar rascunho" variant="secondary" />;

// =============================================================================================== editor de regras
type Band = { to: string; rate: string };
type Rule = {
  name: string; rule_type: 'percentage' | 'fixed' | 'tiered'; scope_type: string; scope_reference: string; conditions: string; rate: string; fixed: string;
  tier_mode: 'marginal' | 'reached'; tier_period: 'month' | 'quarter' | 'year'; tier_scope: 'individual' | 'team'; bands: Band[]; priority: string; stack: 'exclusive' | 'stack';
  entry_kind: 'commission' | 'bonus'; enabled: boolean; valid_from: string; valid_until: string;
};
export type RuleSeed = {
  name: string; rule_type: Rule['rule_type']; scope_type: string; scope_reference: string | null; conditions_json: unknown; rate_decimal: number | null; fixed_amount_cents: number | null;
  tier_mode: Rule['tier_mode'] | null; tier_period: Rule['tier_period'] | null; tier_scope: Rule['tier_scope'] | null; bands: Array<{ order: number; from: number; to: number | null; rate: number }>;
  priority: number; stack_behavior: Rule['stack']; entry_kind: Rule['entry_kind']; enabled: boolean; valid_from: string | null; valid_until: string | null;
};
const DIM_LABEL: Record<string, string> = { seller: 'Vendedor', team: 'Equipe', product: 'Produto', category: 'Categoria', channel: 'Canal' };
const DEFAULT_PREC: string[][] = [['product', 'seller'], ['category', 'seller'], ['channel', 'product'], ['product'], ['category'], ['seller'], ['channel'], ['team'], []];
const cents = (c: number): string => `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;
const rateTxt = (r: number): string => String(Number((r * 100).toFixed(6))).replace('.', ',');
const precLabel = (p: string[]): string => (p.length ? [...p].sort().map((d) => DIM_LABEL[d]).join(' + ') : 'Global (toda a empresa)');

function seedRule(r: RuleSeed): Rule {
  const bands = [...r.bands].sort((a, b) => a.order - b.order).map((b) => ({ to: b.to === null ? '' : cents(b.to), rate: rateTxt(b.rate) }));
  return {
    name: r.name, rule_type: r.rule_type, scope_type: r.scope_type, scope_reference: r.scope_reference ?? '', conditions: r.conditions_json ? JSON.stringify(r.conditions_json) : '',
    rate: r.rate_decimal === null ? '' : rateTxt(r.rate_decimal), fixed: r.fixed_amount_cents === null ? '' : cents(r.fixed_amount_cents),
    tier_mode: r.tier_mode ?? 'marginal', tier_period: r.tier_period ?? 'month', tier_scope: r.tier_scope ?? 'individual', bands: bands.length ? bands : [{ to: '', rate: '' }],
    priority: String(r.priority), stack: r.stack_behavior, entry_kind: r.entry_kind, enabled: r.enabled, valid_from: r.valid_from ?? '', valid_until: r.valid_until ?? '',
  };
}
const blank = (fixedBasis: boolean): Rule => ({
  name: '', rule_type: fixedBasis ? 'fixed' : 'percentage', scope_type: 'organization', scope_reference: '', conditions: '', rate: '', fixed: '', tier_mode: 'marginal', tier_period: 'month', tier_scope: 'individual',
  bands: [{ to: '10.000,00', rate: '2' }, { to: '20.000,00', rate: '4' }, { to: '', rate: '6' }], priority: '0', stack: 'exclusive', entry_kind: 'commission', enabled: true, valid_from: '', valid_until: '',
});

/** Converte o modelo do editor no payload do servidor. As faixas se encadeiam: o início de cada uma é o fim da anterior (sem lacuna nem sobreposição por construção). */
function toPayload(versionId: string, prec: string[][], rules: Rule[]): { json: string; error?: string } {
  const out = [];
  for (const [i, r] of rules.entries()) {
    let conditions: unknown = null;
    if (r.conditions.trim()) { try { conditions = JSON.parse(r.conditions); } catch { return { json: '', error: `Regra ${i + 1}: o JSON das condições é inválido.` }; } }
    const prio = Number(r.priority);
    if (!Number.isInteger(prio)) return { json: '', error: `Regra ${i + 1}: a prioridade deve ser um número inteiro.` };
    const bands = r.bands.map((b, ix) => ({ order: ix + 1, from: ix === 0 ? '0,00' : r.bands[ix - 1]!.to, to: ix === r.bands.length - 1 ? null : b.to, rate: b.rate }));
    out.push({
      name: r.name, rule_type: r.rule_type, scope_type: r.scope_type, scope_reference: r.scope_type === 'organization' ? null : r.scope_reference, conditions, rate: r.rate, fixed: r.fixed,
      tier: r.rule_type === 'tiered' ? { mode: r.tier_mode, period: r.tier_period, scope: r.tier_scope, bands } : null,
      priority: prio, stack: r.stack, entry_kind: r.entry_kind, enabled: r.enabled, valid_from: r.valid_from || null, valid_until: r.valid_until || null,
    });
  }
  return { json: JSON.stringify({ version_id: versionId, precedence: prec, rules: out }) };
}

export function PlanEditor({ versionId, basis, seeds, precedence, options }: {
  versionId: string; basis: string; seeds: RuleSeed[]; precedence: string[][] | null;
  options: { sellers: Opt[]; teams: Opt[]; products: Opt[]; categories: Opt[] };
}) {
  const fixedBasis = basis === 'fixed_per_sale' || basis === 'fixed_per_unit';
  const [rules, setRules] = useState<Rule[]>(() => seeds.map(seedRule));
  const [prec, setPrec] = useState<string[][]>(() => precedence ?? DEFAULT_PREC);
  const [localError, setLocalError] = useState<string | null>(null);
  const [state, formAction, ref] = useCmAction(savePlanDraft, { reset: false });
  const payload = toPayload(versionId, prec, rules);

  const upd = (i: number, patch: Partial<Rule>) => setRules((rs) => rs.map((r, ix) => (ix === i ? { ...r, ...patch } : r)));
  const updBand = (i: number, j: number, patch: Partial<Band>) => setRules((rs) => rs.map((r, ix) => (ix === i ? { ...r, bands: r.bands.map((b, jx) => (jx === j ? { ...b, ...patch } : b)) } : r)));
  const move = (i: number, d: -1 | 1) => setPrec((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const refOpts = (t: string): Opt[] => (t === 'seller' ? options.sellers : t === 'team' ? options.teams : t === 'product' ? options.products : t === 'category' ? options.categories : []);

  return (
    <form ref={ref} action={(fd) => { if (payload.error) { setLocalError(payload.error); return; } setLocalError(null); fd.set('payload', payload.json); formAction(fd); }} noValidate className="space-y-6">
      <section aria-labelledby="prec-h" className="rounded-lg border border-border bg-card p-4">
        <h3 id="prec-h" className="font-semibold">Ordem de precedência</h3>
        <p className="mb-3 text-sm text-muted">Quando mais de uma regra exclusiva se aplica à mesma venda, vence a de combinação mais acima nesta lista. Empate de ordem e prioridade é tratado como <strong>conflito</strong> (a venda fica pendente, nunca se escolhe ao acaso).</p>
        <ol className="space-y-1">
          {prec.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <span className="w-6 text-muted">{i + 1}.</span>
              <span className="min-w-48 flex-1">{precLabel(p)}</span>
              <button type="button" onClick={() => move(i, -1)} className="rounded border border-border px-2 py-0.5 text-xs" aria-label={`Subir ${precLabel(p)}`} disabled={i === 0}>↑</button>
              <button type="button" onClick={() => move(i, 1)} className="rounded border border-border px-2 py-0.5 text-xs" aria-label={`Descer ${precLabel(p)}`} disabled={i === prec.length - 1}>↓</button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setPrec(DEFAULT_PREC)} className="mt-2 text-xs text-muted underline underline-offset-2">Restaurar ordem padrão</button>
      </section>

      {rules.map((r, i) => (
        <section key={i} aria-label={`Regra ${i + 1}`} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Regra {i + 1}</h3>
            <button type="button" onClick={() => setRules((rs) => rs.filter((_, ix) => ix !== i))} className="text-sm text-danger underline underline-offset-2">Remover</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2"><Field label="Nome da regra" name={`r${i}n`}><Input id={`r${i}n`} value={r.name} onChange={(e) => upd(i, { name: e.target.value })} maxLength={100} /></Field></div>
            <Field label="Tipo" name={`r${i}t`}>
              <Select id={`r${i}t`} value={r.rule_type} onChange={(e) => upd(i, { rule_type: e.target.value as Rule['rule_type'], entry_kind: e.target.value === 'fixed' ? r.entry_kind : 'commission' })}>
                {(fixedBasis ? ['fixed'] : ['percentage', 'tiered']).map((t) => <option key={t} value={t}>{RULE_TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Prioridade (desempate)" name={`r${i}p`} hint="Maior vence entre regras de mesma especificidade."><Input id={`r${i}p`} inputMode="numeric" value={r.priority} onChange={(e) => upd(i, { priority: e.target.value })} /></Field>

            <Field label="Aplica-se a" name={`r${i}s`}>
              <Select id={`r${i}s`} value={r.scope_type} onChange={(e) => upd(i, { scope_type: e.target.value, scope_reference: '' })}>
                {entries(SCOPE_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            {r.scope_type !== 'organization' ? (
              <div className="sm:col-span-2">
                <Field label={`${SCOPE_LABEL[r.scope_type]} da regra`} name={`r${i}ref`}>
                  {r.scope_type === 'channel'
                    ? <Input id={`r${i}ref`} value={r.scope_reference} onChange={(e) => upd(i, { scope_reference: e.target.value })} maxLength={40} placeholder="Ex.: Online" />
                    : <Select id={`r${i}ref`} value={r.scope_reference} onChange={(e) => upd(i, { scope_reference: e.target.value })}><option value="">Escolha…</option>{refOpts(r.scope_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}
                </Field>
              </div>
            ) : null}
            <Field label="Combinação com outras regras" name={`r${i}st`}>
              <Select id={`r${i}st`} value={r.stack} onChange={(e) => upd(i, { stack: e.target.value as Rule['stack'] })}>{entries(STACK_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>

            {r.rule_type === 'percentage' ? <Field label="Taxa (%)" name={`r${i}rate`} hint="Ex.: 5 ou 5,5"><Input id={`r${i}rate`} inputMode="decimal" value={r.rate} onChange={(e) => upd(i, { rate: e.target.value })} /></Field> : null}
            {r.rule_type === 'fixed' ? (
              <>
                <Field label={basis === 'fixed_per_unit' ? 'Valor por unidade (R$)' : 'Valor por venda (R$)'} name={`r${i}fx`} hint="Ex.: 100,00"><Input id={`r${i}fx`} inputMode="decimal" value={r.fixed} onChange={(e) => upd(i, { fixed: e.target.value })} /></Field>
                <Field label="Lançar como" name={`r${i}ek`}><Select id={`r${i}ek`} value={r.entry_kind} onChange={(e) => upd(i, { entry_kind: e.target.value as Rule['entry_kind'] })}><option value="commission">Comissão</option><option value="bonus">Bônus</option></Select></Field>
              </>
            ) : null}

            {r.rule_type === 'tiered' ? (
              <div className="sm:col-span-4 space-y-3 rounded-md border border-dashed border-border p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Método de cálculo" name={`r${i}tm`}><Select id={`r${i}tm`} value={r.tier_mode} onChange={(e) => upd(i, { tier_mode: e.target.value as Rule['tier_mode'] })}>{entries(TIER_MODE_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
                  <Field label="Período de acumulação" name={`r${i}tp`}><Select id={`r${i}tp`} value={r.tier_period} onChange={(e) => upd(i, { tier_period: e.target.value as Rule['tier_period'] })}>{entries(TIER_PERIOD_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
                  <Field label="Acumula por" name={`r${i}ts`}><Select id={`r${i}ts`} value={r.tier_scope} onChange={(e) => upd(i, { tier_scope: e.target.value as Rule['tier_scope'] })}>{entries(TIER_SCOPE_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
                </div>
                <p className="text-xs text-muted">Faixas valem de (início, fim]: a base exatamente igual ao teto pertence àquela faixa. O início de cada faixa é o fim da anterior; a última fica sem teto.</p>
                <table className="w-full text-sm">
                  <caption className="sr-only">Faixas da regra {i + 1}</caption>
                  <thead><tr className="text-left text-xs text-muted"><th className="py-1">Faixa</th><th>De (R$)</th><th>Até (R$)</th><th>Taxa (%)</th><th /></tr></thead>
                  <tbody>
                    {r.bands.map((b, j) => {
                      const last = j === r.bands.length - 1;
                      return (
                        <tr key={j}>
                          <td className="py-1 pr-2">{j + 1}</td>
                          <td className="pr-2 tabular-nums">{j === 0 ? '0,00' : r.bands[j - 1]!.to || '—'}</td>
                          <td className="pr-2">{last ? <span className="text-muted">sem teto</span> : <Input aria-label={`Teto da faixa ${j + 1}`} inputMode="decimal" value={b.to} onChange={(e) => updBand(i, j, { to: e.target.value })} />}</td>
                          <td className="pr-2"><Input aria-label={`Taxa da faixa ${j + 1}`} inputMode="decimal" value={b.rate} onChange={(e) => updBand(i, j, { rate: e.target.value })} /></td>
                          <td>{r.bands.length > 1 ? <button type="button" className="text-xs text-danger underline" onClick={() => upd(i, { bands: r.bands.filter((_, jx) => jx !== j) })}>remover</button> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" onClick={() => upd(i, { bands: [...r.bands.slice(0, -1), { to: '', rate: '' }, r.bands[r.bands.length - 1]!] })} className="text-sm underline underline-offset-2">Adicionar faixa</button>
              </div>
            ) : null}

            <Field label="Vigência da regra: início (opcional)" name={`r${i}vf`}><Input id={`r${i}vf`} type="date" value={r.valid_from} onChange={(e) => upd(i, { valid_from: e.target.value })} /></Field>
            <Field label="Fim (opcional)" name={`r${i}vu`} hint="Útil para campanhas temporárias."><Input id={`r${i}vu`} type="date" value={r.valid_until} onChange={(e) => upd(i, { valid_until: e.target.value })} /></Field>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={r.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} /> Regra ativa</label>
            <details className="sm:col-span-4 text-sm">
              <summary className="cursor-pointer text-muted">Condições avançadas (JSON, opcional)</summary>
              <p className="my-2 text-xs text-muted">Somente fatos e operadores autorizados (nenhum código é executado). Exemplo: <code>{'{"all":[{"fact":"sale.channel","op":"eq","value":"Online"},{"fact":"sale.net_cents","op":"gte","value":500000}]}'}</code>. Igualdades de vendedor, equipe, produto, categoria e canal entram na especificidade da regra.</p>
              <Textarea aria-label={`Condições da regra ${i + 1}`} rows={3} value={r.conditions} onChange={(e) => upd(i, { conditions: e.target.value })} className="font-mono text-xs" />
            </details>
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRules((rs) => [...rs, blank(fixedBasis)])} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Adicionar regra</button>
        <SubmitButton pendingText="Salvando…">Salvar rascunho</SubmitButton>
        <FormMessage state={state} />
      </div>
      {localError ? <Alert tone="error">{localError}</Alert> : null}
      <p className="text-xs text-muted">{rules.length} regra(s) no rascunho. Salvar não publica: use «Validar» e depois «Publicar versão». Versões publicadas nunca são alteradas — taxas novas entram em versão nova com vigência futura.</p>
    </form>
  );
}

