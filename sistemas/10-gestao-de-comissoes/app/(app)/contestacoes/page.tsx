import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/primitives';
import { Disclosure, TableShell, TD, TH } from '@/components/cm/bits';
import { DisputeRespondForm } from '@/components/cm/forms-ledger';
import { FSelect, FilterForm, StatusPill } from '@/components/cm/page-bits';
import { dateBR } from '@/lib/commissions/format';
import { DISPUTE_STATUS_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { one, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Contestações' };

type D = { id: string; seller_id: string; commission_entry_id: string; description: string; status: string; resolution: string | null; opened_at: string; resolved_at: string | null };

export default async function DisputesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const status = one(sp.status);
  let q = pc.ctx.supabase.from('commission_disputes').select('id, seller_id, commission_entry_id, description, status, resolution, opened_at, resolved_at').order('opened_at', { ascending: false }).limit(100);
  if (status && Object.keys(DISPUTE_STATUS_LABEL).includes(status)) q = q.eq('status', status);
  const { data } = await q;
  const rows = (data ?? []) as D[];
  const ids = [...new Set(rows.map((r) => r.seller_id))];
  const { data: s } = ids.length ? await pc.ctx.supabase.from('sellers').select('id, name').in('id', ids) : { data: [] };
  const names = new Map(((s ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  return (
    <>
      <PageHeader title="Contestações" description={pc.perms.seller ? 'Suas contestações e as respostas. Contestar nunca altera valores: toda correção é um novo lançamento.' : 'Fila de contestações. Responder não altera valores; correções entram como ajuste aprovado, e a contestação aponta para ele.'} />
      <FilterForm clear="/contestacoes"><FSelect name="status" label="Status" sp={sp} opts={Object.entries(DISPUTE_STATUS_LABEL).map(([value, label]) => ({ value, label }))} /></FilterForm>
      <TableShell caption="Contestações" empty={rows.length === 0} emptyText="Nenhuma contestação.">
        <thead><tr><th className={TH}>Aberta em</th><th className={TH}>Vendedor</th><th className={TH}>Lançamento</th><th className={TH}>Descrição</th><th className={TH}>Status</th><th className={TH}>Resposta</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((d) => (
          <tr key={d.id}>
            <td className={TD}>{dateBR(d.opened_at)}</td><td className={TD}>{names.get(d.seller_id) ?? '—'}</td><td className={TD}><Link className="underline underline-offset-2" href={`/comissoes/${d.commission_entry_id}`}>abrir</Link></td>
            <td className={TD}>{d.description}</td><td className={TD}><StatusPill kind="dispute" status={d.status} /></td>
            <td className={TD}>{d.resolution ?? (pc.perms.respondDisputes && (d.status === 'open' || d.status === 'in_review') ? <Disclosure summary="Responder"><DisputeRespondForm id={d.id} adjustments={[]} /></Disclosure> : '—')}</td>
          </tr>
        ))}</tbody>
      </TableShell>
    </>
  );
}
