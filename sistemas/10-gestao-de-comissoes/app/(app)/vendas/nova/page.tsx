import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/primitives';
import { SaleForm } from '@/components/cm/sale-form';
import { loadOptions } from '@/lib/commissions/data';
import { CHANNEL_SUGGESTIONS } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Nova venda' };

export default async function NewSalePage() {
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const opts = await loadOptions(pc.ctx);
  return (
    <>
      <PageHeader title="Nova venda" description="Registre a venda, os itens e quem participa. Só vendedores ativos entram.">
        <Link href="/vendas" className="text-sm underline underline-offset-2">← Vendas</Link>
      </PageHeader>
      <SaleForm seed={{ id: null, sale_number: '', external_reference: '', sale_date: pc.today, channel: '', customer_id: '', split_model: 'pool', items: [], participants: [] }} sellers={opts.sellers} customers={opts.customers} products={opts.products} channels={CHANNEL_SUGGESTIONS} />
    </>
  );
}
