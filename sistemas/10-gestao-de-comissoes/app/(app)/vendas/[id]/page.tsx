import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { CancelSaleForm, ConfirmSaleButton, DiscardDraftButton, ReceiptForm, ReturnForm, ReverseReceiptForm } from '@/components/cm/forms-sales';
import { DefinitionList, Money, StatusPill } from '@/components/cm/page-bits';
import { brl, dateBR, pctBR, qtyBR } from '@/lib/commissions/format';
import { CAUSE_LABEL, ENTRY_TYPE_LABEL, SPLIT_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Venda' };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const { data: s } = await ctx.supabase.from('sales').select('*').eq('id', id).maybeSingle();
  if (!s) notFound();
  const sale = s as { id: string; sale_number: string; external_reference: string | null; sale_date: string; status: string; channel: string | null; customer_id: string | null; split_model: string; gross_amount_cents: number; discount_amount_cents: number; net_amount_cents: number; commissionable_amount_cents: number; cancel_reason: string | null; cancelled_on: string | null; new_customer: boolean };
  const [{ data: items }, { data: parts }, { data: events }, { data: receipts }, { data: entries }] = await Promise.all([
    ctx.supabase.from('sale_items').select('id, position, product_id, description, quantity_decimal, unit_price_cents, discount_cents, net_amount_cents, commissionable_amount_cents, cost_cents').eq('sale_id', id).order('position'),
    ctx.supabase.from('sale_participants').select('seller_id, participation_type, allocation_percentage, allocated_amount_cents, plan_version_id').eq('sale_id', id),
    ctx.supabase.from('sale_events').select('id, event_type, event_amount_cents, effective_at, metadata_json, created_at').eq('sale_id', id).order('created_at'),
    ctx.supabase.from('customer_receipts').select('id, amount_cents, received_at, external_reference, status, reversal_reason').eq('sale_id', id).order('received_at'),
    ctx.supabase.from('commission_entries').select('id, seller_id, entry_type, amount_cents, approval_status, effective_at, cause').eq('sale_id', id).order('created_at'),
  ]);
  const itemRows = (items ?? []) as Array<{ id: string; position: number; product_id: string | null; description: string | null; quantity_decimal: number; unit_price_cents: number; discount_cents: number; net_amount_cents: number; commissionable_amount_cents: number; cost_cents: number | null }>;
  const partRows = (parts ?? []) as Array<{ seller_id: string; participation_type: string; allocation_percentage: number; allocated_amount_cents: number; plan_version_id: string | null }>;
  const evRows = (events ?? []) as Array<{ id: string; event_type: string; event_amount_cents: number; effective_at: string; metadata_json: { itemAmounts?: Record<string, number>; reason?: string } | null }>;
  const rcRows = (receipts ?? []) as Array<{ id: string; amount_cents: number; received_at: string; external_reference: string | null; status: string; reversal_reason: string | null }>;
  const enRows = (entries ?? []) as Array<{ id: string; seller_id: string; entry_type: string; amount_cents: number; approval_status: string; effective_at: string; cause: string }>;

  const sellerIds = [...new Set([...partRows.map((p) => p.seller_id), ...enRows.map((e) => e.seller_id)])];
  const { data: sellers } = sellerIds.length ? await ctx.supabase.from('sellers').select('id, name').in('id', sellerIds) : { data: [] };
  const sname = new Map(((sellers ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  const verIds = [...new Set(partRows.map((p) => p.plan_version_id).filter((x): x is string => !!x))];
  const { data: vers } = verIds.length ? await ctx.supabase.from('commission_plan_versions').select('id, version_number, plan_id').in('id', verIds) : { data: [] };
  const { data: plans } = (vers ?? []).length ? await ctx.supabase.from('commission_plans').select('id, name').in('id', [...new Set(((vers ?? []) as Array<{ plan_id: string }>).map((v) => v.plan_id))]) : { data: [] };
  const pname = new Map(((plans ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const vlabel = new Map(((vers ?? []) as Array<{ id: string; version_number: number; plan_id: string }>).map((v) => [v.id, `${pname.get(v.plan_id) ?? 'Plano'} v${v.version_number}`]));
  const pnames = new Map<string, string>();
  if (sale.customer_id) {
    const { data: c } = await ctx.supabase.from('customers').select('name').eq('id', sale.customer_id).maybeSingle();
    pnames.set('customer', (c as { name?: string } | null)?.name ?? '—');
  }
  const prodIds = itemRows.map((i) => i.product_id).filter((x): x is string => !!x);
  const { data: prods } = prodIds.length ? await ctx.supabase.from('products').select('id, name').in('id', prodIds) : { data: [] };
  const prodName = new Map(((prods ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));

  const returned = new Map<string, number>();
  for (const e of evRows) if (e.event_type === 'partially_returned' || e.event_type === 'totally_returned') for (const [k, v] of Object.entries(e.metadata_json?.itemAmounts ?? {})) returned.set(k, (returned.get(k) ?? 0) + Number(v));
  const remainingItems = itemRows.map((i) => ({ id: i.id, label: i.description || prodName.get(i.product_id ?? '') || `Item ${i.position}`, remaining: brl(i.commissionable_amount_cents - (returned.get(i.id) ?? 0)), rem: i.commissionable_amount_cents - (returned.get(i.id) ?? 0) })).filter((i) => i.rem > 0);
  const totalReceived = rcRows.filter((r) => r.status === 'confirmed').reduce((a, r) => a + r.amount_cents, 0);
  const live = sale.status === 'confirmed' || sale.status === 'partially_returned';
  const canEdit = sale.status === 'draft' && pc.perms.manageSales;

  return (
    <>
      <PageHeader title={`Venda ${sale.sale_number}`} description={sale.external_reference ? `Referência externa ${sale.external_reference}` : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind="sale" status={sale.status} />
          {canEdit ? <Link href={`/vendas/${id}/editar`} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Editar rascunho</Link> : null}
          {canEdit ? <ConfirmSaleButton id={id} /> : null}
          {canEdit ? <DiscardDraftButton id={id} /> : null}
        </div>
      </PageHeader>
      <Card>
        <DefinitionList items={[
          ['Data', dateBR(sale.sale_date)], ['Cliente', pnames.get('customer') ?? 'Sem cliente cadastrado'], ['Canal', sale.channel ?? '—'], ['Divisão', SPLIT_LABEL[sale.split_model]],
          ['Valor bruto', brl(sale.gross_amount_cents)], ['Descontos', brl(sale.discount_amount_cents)], ['Valor líquido', brl(sale.net_amount_cents)], ['Base comissionável', brl(sale.commissionable_amount_cents)],
          ['Recebido (registrado)', brl(totalReceived)], ['Novo cliente', sale.new_customer ? 'Sim' : 'Não'],
          ...(sale.cancel_reason ? [['Cancelamento', `${dateBR(sale.cancelled_on)} — ${sale.cancel_reason}`] as [string, string]] : []),
        ]} />
      </Card>

      <Section title="Itens">
        <TableShell caption="Itens da venda">
          <thead><tr><th className={TH}>#</th><th className={TH}>Produto</th><th className={THR}>Qtd.</th><th className={THR}>Preço</th><th className={THR}>Desconto</th><th className={THR}>Líquido</th><th className={THR}>Comissionável</th><th className={THR}>Devolvido</th></tr></thead>
          <tbody className="divide-y divide-border">{itemRows.map((i) => (
            <tr key={i.id}><td className={TD}>{i.position}</td><td className={TD}>{prodName.get(i.product_id ?? '') ?? i.description ?? '—'}</td><td className={TDR}>{qtyBR(i.quantity_decimal)}</td><td className={TDR}>{brl(i.unit_price_cents)}</td><td className={TDR}>{brl(i.discount_cents)}</td><td className={TDR}>{brl(i.net_amount_cents)}</td><td className={TDR}>{brl(i.commissionable_amount_cents)}</td><td className={TDR}>{brl(returned.get(i.id) ?? 0)}</td></tr>
          ))}</tbody>
        </TableShell>
      </Section>

      <Section title="Vendedores e plano fixado" description="O plano é fixado na confirmação: mudar taxas depois não altera esta venda.">
        <TableShell caption="Participantes">
          <thead><tr><th className={TH}>Vendedor</th><th className={TH}>Papel</th><th className={THR}>Participação</th><th className={THR}>Crédito atribuído</th><th className={TH}>Plano fixado</th></tr></thead>
          <tbody className="divide-y divide-border">{partRows.map((p) => (
            <tr key={p.seller_id}><td className={TD}>{pc.perms.manager ? <Link className="underline underline-offset-2" href={`/vendedores/${p.seller_id}`}>{sname.get(p.seller_id) ?? '—'}</Link> : sname.get(p.seller_id) ?? '—'}</td><td className={TD}>{p.participation_type === 'primary' ? 'Principal' : 'Participante'}</td><td className={TDR}>{pctBR(p.allocation_percentage, 2)}</td><td className={TDR}>{brl(p.allocated_amount_cents)}</td><td className={TD}>{p.plan_version_id ? vlabel.get(p.plan_version_id) ?? '—' : sale.status === 'draft' ? 'definido ao confirmar' : '—'}</td></tr>
          ))}</tbody>
        </TableShell>
      </Section>

      <Section title="Comissões desta venda" description="Cada lançamento aponta a memória de cálculo. Você só vê os lançamentos que seu perfil permite.">
        <TableShell caption="Lançamentos da venda" empty={enRows.length === 0} emptyText={live ? 'Ainda não há lançamentos: a venda aguarda o cálculo do financeiro.' : 'Sem lançamentos.'}>
          <thead><tr><th className={TH}>Data</th><th className={TH}>Vendedor</th><th className={TH}>Tipo</th><th className={TH}>Origem</th><th className={TH}>Status</th><th className={THR}>Valor</th></tr></thead>
          <tbody className="divide-y divide-border">{enRows.map((e) => (
            <tr key={e.id}><td className={TD}><Link className="underline underline-offset-2" href={`/comissoes/${e.id}`}>{dateBR(e.effective_at)}</Link></td><td className={TD}>{sname.get(e.seller_id) ?? '—'}</td><td className={TD}>{ENTRY_TYPE_LABEL[e.entry_type]}</td><td className={TD}>{CAUSE_LABEL[e.cause]}</td><td className={TD}><StatusPill kind="approval" status={e.approval_status} /></td><td className={TDR}><Money cents={e.amount_cents} /></td></tr>
          ))}</tbody>
        </TableShell>
      </Section>

      <Section title="Recebimentos" description="Registro gerencial dos pagamentos do cliente (não é conciliação bancária). Servem para planos com elegibilidade por recebimento.">
        <TableShell caption="Recebimentos" empty={rcRows.length === 0}>
          <thead><tr><th className={TH}>Data</th><th className={TH}>Referência</th><th className={TH}>Situação</th><th className={THR}>Valor</th><th className={TH}><span className="sr-only">Ações</span></th></tr></thead>
          <tbody className="divide-y divide-border">{rcRows.map((r) => (
            <tr key={r.id}><td className={TD}>{dateBR(r.received_at)}</td><td className={TD}>{r.external_reference ?? '—'}</td><td className={TD}>{r.status === 'confirmed' ? 'Confirmado' : `Estornado — ${r.reversal_reason ?? ''}`}</td><td className={TDR}><Money cents={r.amount_cents} /></td>
              <td className={TD}>{r.status === 'confirmed' && pc.perms.manageReceipts ? <Disclosure summary="Estornar"><ReverseReceiptForm id={r.id} /></Disclosure> : null}</td></tr>
          ))}</tbody>
        </TableShell>
        {live && pc.perms.manageReceipts ? <div className="mt-3"><Disclosure summary="Registrar recebimento"><ReceiptForm saleId={id} today={pc.today} /></Disclosure></div> : null}
      </Section>

      <Section title="Histórico de eventos">
        <TableShell caption="Eventos" empty={evRows.length === 0}>
          <thead><tr><th className={TH}>Data</th><th className={TH}>Evento</th><th className={THR}>Valor</th><th className={TH}>Detalhe</th></tr></thead>
          <tbody className="divide-y divide-border">{evRows.map((e) => (
            <tr key={e.id}><td className={TD}>{dateBR(e.effective_at)}</td><td className={TD}>{{ confirmed: 'Confirmada', cancelled: 'Cancelada', partially_returned: 'Devolução parcial', totally_returned: 'Devolução total', corrected: 'Corrigida' }[e.event_type] ?? e.event_type}</td><td className={TDR}>{brl(e.event_amount_cents)}</td><td className={TD}>{e.metadata_json?.reason ?? '—'}</td></tr>
          ))}</tbody>
        </TableShell>
        {live && pc.perms.manageSales ? (
          <div className="mt-3 space-y-3">
            <Disclosure summary="Registrar devolução"><ReturnForm saleId={id} today={pc.today} items={remainingItems} /></Disclosure>
            <Disclosure summary="Cancelar venda" tone="danger"><CancelSaleForm saleId={id} today={pc.today} /></Disclosure>
          </div>
        ) : null}
      </Section>
    </>
  );
}
