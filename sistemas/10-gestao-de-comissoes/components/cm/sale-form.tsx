'use client';

import { useRef, useState } from 'react';
import { FormMessage } from '@/components/ui/client';
import { Field, Input, Select } from '@/components/ui/primitives';
import { saveSale } from '@/lib/commissions/actions/sales';
import { SPLIT_LABEL } from '@/lib/commissions/labels';
import type { Opt } from './bits';
import { useCmAction } from './use-cm-action';

type Item = { product_id: string; description: string; quantity: string; unit_price: string; discount: string; commissionable: string; cost: string };
type Part = { seller_id: string; allocation: string; primary: boolean };
export type SaleSeed = {
  id: string | null; sale_number: string; external_reference: string; sale_date: string; channel: string; customer_id: string; split_model: 'pool' | 'independent';
  items: Item[]; participants: Part[];
};

const emptyItem = (): Item => ({ product_id: '', description: '', quantity: '1', unit_price: '', discount: '', commissionable: '', cost: '' });

/** Venda em rascunho: itens e participantes. Totais e validações finais são feitos no servidor e no banco. */
export function SaleForm({ seed, sellers, customers, products, channels }: { seed: SaleSeed; sellers: Opt[]; customers: Opt[]; products: Opt[]; channels: string[] }) {
  const [h, setH] = useState({ sale_number: seed.sale_number, external_reference: seed.external_reference, sale_date: seed.sale_date, channel: seed.channel, customer_id: seed.customer_id, split_model: seed.split_model });
  const [items, setItems] = useState<Item[]>(seed.items.length ? seed.items : [emptyItem()]);
  const [parts, setParts] = useState<Part[]>(seed.participants.length ? seed.participants : [{ seller_id: '', allocation: '100', primary: true }]);
  const confirmRef = useRef(false);
  const [state, formAction, ref] = useCmAction(saveSale, { reset: false });
  const e = state.fieldErrors ?? {};

  const upItem = (i: number, p: Partial<Item>) => setItems((xs) => xs.map((x, ix) => (ix === i ? { ...x, ...p } : x)));
  const upPart = (i: number, p: Partial<Part>) => setParts((xs) => xs.map((x, ix) => (ix === i ? { ...x, ...p } : x)));
  const setPrimary = (i: number) => setParts((xs) => xs.map((x, ix) => ({ ...x, primary: ix === i })));
  const sum = parts.reduce((a, p) => a + (Number(p.allocation.replace(',', '.')) || 0), 0);

  const build = (confirm: boolean) => JSON.stringify({
    id: seed.id, sale_number: h.sale_number, external_reference: h.external_reference, sale_date: h.sale_date, channel: h.channel, customer_id: h.customer_id, split_model: h.split_model,
    items: items.map((i) => ({ product_id: i.product_id, description: i.description, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, commissionable: i.commissionable, cost: i.cost })),
    participants: parts, confirm,
  });

  return (
    <form ref={ref} action={(fd) => { fd.set('payload', build(confirmRef.current)); formAction(fd); }} noValidate className="space-y-6">
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-4" aria-label="Dados da venda">
        <Field label="Número da venda" name="sn" errors={e.sale_number}><Input id="sn" value={h.sale_number} onChange={(x) => setH({ ...h, sale_number: x.target.value })} maxLength={40} required /></Field>
        <Field label="Referência externa" name="er" hint="Impede importar/duplicar a mesma venda."><Input id="er" value={h.external_reference} onChange={(x) => setH({ ...h, external_reference: x.target.value })} maxLength={80} /></Field>
        <Field label="Data da venda" name="sd" errors={e.sale_date}><Input id="sd" type="date" value={h.sale_date} onChange={(x) => setH({ ...h, sale_date: x.target.value })} required /></Field>
        <Field label="Canal" name="ch"><Input id="ch" list="canais" value={h.channel} onChange={(x) => setH({ ...h, channel: x.target.value })} maxLength={40} /><datalist id="canais">{channels.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <div className="sm:col-span-2"><Field label="Cliente" name="cu"><Select id="cu" value={h.customer_id} onChange={(x) => setH({ ...h, customer_id: x.target.value })}><option value="">Sem cliente cadastrado</option>{customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field></div>
        <div className="sm:col-span-2"><Field label="Divisão entre vendedores" name="sm" hint="Pool: uma comissão dividida (participações somam 100%). Independentes: cada vendedor calcula pela própria regra."><Select id="sm" value={h.split_model} onChange={(x) => setH({ ...h, split_model: x.target.value as 'pool' | 'independent' })}>{Object.entries(SPLIT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field></div>
      </section>

      <section className="space-y-3" aria-label="Itens">
        <h2 className="text-lg font-semibold">Itens</h2>
        {items.map((it, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-6">
            <div className="sm:col-span-2"><Field label="Produto" name={`ip${i}`}><Select id={`ip${i}`} value={it.product_id} onChange={(x) => upItem(i, { product_id: x.target.value })}><option value="">Sem produto do catálogo</option>{products.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field></div>
            <div className="sm:col-span-2"><Field label="Descrição" name={`id${i}`}><Input id={`id${i}`} value={it.description} onChange={(x) => upItem(i, { description: x.target.value })} maxLength={200} /></Field></div>
            <Field label="Quantidade" name={`iq${i}`} errors={e[`items.${i}.quantity`]}><Input id={`iq${i}`} inputMode="decimal" value={it.quantity} onChange={(x) => upItem(i, { quantity: x.target.value })} /></Field>
            <Field label="Preço unitário (R$)" name={`iu${i}`} errors={e[`items.${i}.unit_price`]}><Input id={`iu${i}`} inputMode="decimal" value={it.unit_price} onChange={(x) => upItem(i, { unit_price: x.target.value })} placeholder="1.234,56" /></Field>
            <Field label="Desconto (R$)" name={`ix${i}`}><Input id={`ix${i}`} inputMode="decimal" value={it.discount} onChange={(x) => upItem(i, { discount: x.target.value })} /></Field>
            <Field label="Base comissionável (R$)" name={`ic${i}`} hint="Em branco = valor líquido."><Input id={`ic${i}`} inputMode="decimal" value={it.commissionable} onChange={(x) => upItem(i, { commissionable: x.target.value })} /></Field>
            <Field label="Custo direto (R$)" name={`ik${i}`} hint="Só para base margem."><Input id={`ik${i}`} inputMode="decimal" value={it.cost} onChange={(x) => upItem(i, { cost: x.target.value })} /></Field>
            <div className="flex items-end">{items.length > 1 ? <button type="button" className="text-sm text-danger underline underline-offset-2" onClick={() => setItems((xs) => xs.filter((_, ix) => ix !== i))}>Remover item</button> : null}</div>
          </div>
        ))}
        <button type="button" onClick={() => setItems((xs) => [...xs, emptyItem()])} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Adicionar item</button>
        {e.items ? <p className="text-sm text-danger" role="alert">{e.items[0]}</p> : null}
      </section>

      <section className="space-y-3" aria-label="Vendedores">
        <h2 className="text-lg font-semibold">Vendedores participantes</h2>
        {parts.map((p, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><Field label="Vendedor" name={`ps${i}`} errors={e[`participants.${i}.seller_id`]}><Select id={`ps${i}`} value={p.seller_id} onChange={(x) => upPart(i, { seller_id: x.target.value })}><option value="">Escolha…</option>{sellers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field></div>
            <Field label="Participação (%)" name={`pa${i}`} errors={e[`participants.${i}.allocation`]}><Input id={`pa${i}`} inputMode="decimal" value={p.allocation} onChange={(x) => upPart(i, { allocation: x.target.value })} /></Field>
            <div className="flex items-end gap-4">
              <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="primary" className="size-4" checked={p.primary} onChange={() => setPrimary(i)} /> Principal</label>
              {parts.length > 1 ? <button type="button" className="text-sm text-danger underline underline-offset-2" onClick={() => setParts((xs) => { const n = xs.filter((_, ix) => ix !== i); if (!n.some((x) => x.primary) && n[0]) n[0] = { ...n[0], primary: true }; return n; })}>Remover</button> : null}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => setParts((xs) => [...xs, { seller_id: '', allocation: '', primary: false }])} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Adicionar vendedor</button>
          <span className={`text-sm tabular-nums ${h.split_model === 'pool' && Math.abs(sum - 100) > 1e-9 ? 'text-danger' : 'text-muted'}`}>Soma das participações: {sum.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%{h.split_model === 'pool' ? ' (no pool deve ser exatamente 100%)' : ''}</span>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" onClick={() => { confirmRef.current = false; }} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Salvar rascunho</button>
        <button type="submit" onClick={() => { confirmRef.current = true; }} className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Salvar e confirmar venda</button>
        <FormMessage state={state} />
      </div>
      <p className="text-xs text-muted">Ao confirmar, o plano vigente de cada vendedor na data da venda é fixado. A venda confirmada não pode mais ser editada (use cancelamento ou devolução).</p>
    </form>
  );
}
