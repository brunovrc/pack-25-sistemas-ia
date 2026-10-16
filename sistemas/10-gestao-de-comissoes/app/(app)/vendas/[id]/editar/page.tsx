import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/primitives';
import { SaleForm } from '@/components/cm/sale-form';
import { loadOptions } from '@/lib/commissions/data';
import { centsToInput } from '@/lib/commissions/format';
import { CHANNEL_SUGGESTIONS } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Editar rascunho' };

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx } = pc;
  const { data: s } = await ctx.supabase.from('sales').select('id, sale_number, external_reference, sale_date, channel, customer_id, split_model, status').eq('id', id).maybeSingle();
  const sale = s as { id: string; sale_number: string; external_reference: string | null; sale_date: string; channel: string | null; customer_id: string | null; split_model: 'pool' | 'independent'; status: string } | null;
  if (!sale || sale.status !== 'draft') notFound();
  const [{ data: items }, { data: parts }, opts] = await Promise.all([
    ctx.supabase.from('sale_items').select('product_id, description, quantity_decimal, unit_price_cents, discount_cents, net_amount_cents, commissionable_amount_cents, cost_cents').eq('sale_id', id).order('position'),
    ctx.supabase.from('sale_participants').select('seller_id, participation_type, allocation_percentage').eq('sale_id', id),
    loadOptions(ctx),
  ]);
  return (
    <>
      <PageHeader title={`Editar rascunho ${sale.sale_number}`}><Link href={`/vendas/${id}`} className="text-sm underline underline-offset-2">← Voltar</Link></PageHeader>
      <SaleForm
        seed={{
          id, sale_number: sale.sale_number, external_reference: sale.external_reference ?? '', sale_date: sale.sale_date, channel: sale.channel ?? '', customer_id: sale.customer_id ?? '', split_model: sale.split_model,
          items: ((items ?? []) as Array<{ product_id: string | null; description: string | null; quantity_decimal: number; unit_price_cents: number; discount_cents: number; net_amount_cents: number; commissionable_amount_cents: number; cost_cents: number | null }>).map((i) => ({
            product_id: i.product_id ?? '', description: i.description ?? '', quantity: String(i.quantity_decimal).replace('.', ','), unit_price: centsToInput(i.unit_price_cents), discount: i.discount_cents ? centsToInput(i.discount_cents) : '',
            commissionable: i.commissionable_amount_cents === i.net_amount_cents ? '' : centsToInput(i.commissionable_amount_cents), cost: i.cost_cents === null ? '' : centsToInput(i.cost_cents),
          })),
          participants: ((parts ?? []) as Array<{ seller_id: string; participation_type: string; allocation_percentage: number }>).map((p) => ({ seller_id: p.seller_id, allocation: String(Number(p.allocation_percentage)).replace('.', ','), primary: p.participation_type === 'primary' })),
        }}
        sellers={opts.sellers} customers={opts.customers} products={opts.products} channels={CHANNEL_SUGGESTIONS}
      />
    </>
  );
}
