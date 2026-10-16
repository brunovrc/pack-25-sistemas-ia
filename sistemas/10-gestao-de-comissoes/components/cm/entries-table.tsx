import Link from 'next/link';
import { brl, dateBR } from '@/lib/commissions/format';
import { CAUSE_LABEL, ENTRY_TYPE_LABEL } from '@/lib/commissions/labels';
import { TableShell, TD, TDR, TH, THR } from './bits';
import { Money, StatusPill } from './page-bits';

export type EntryRow = { id: string; seller_id: string; sale_id: string | null; entry_type: string; amount_cents: number; approval_status: string; effective_at: string; eligible_at: string; cause: string };

/** Extrato de lançamentos. Com `selectable`, as caixas apontam para o formulário #review-form. */
export function EntriesTable({ rows, sellers, sales, selectable }: { rows: EntryRow[]; sellers: Map<string, string>; sales: Map<string, string>; selectable?: boolean }) {
  const total = rows.reduce((a, r) => a + r.amount_cents, 0);
  return (
    <TableShell caption="Lançamentos de comissão" empty={rows.length === 0} emptyText="Nenhum lançamento encontrado com estes filtros.">
      <thead><tr>{selectable ? <th className={TH}><span className="sr-only">Selecionar</span></th> : null}<th className={TH}>Data</th><th className={TH}>Vendedor</th><th className={TH}>Venda</th><th className={TH}>Tipo</th><th className={TH}>Origem</th><th className={TH}>Status</th><th className={THR}>Valor</th></tr></thead>
      <tbody className="divide-y divide-border">
        {rows.map((r) => (
          <tr key={r.id}>
            {selectable ? <td className={TD}><input type="checkbox" name="ids" value={r.id} form="review-form" className="size-4" aria-label={`Selecionar lançamento de ${dateBR(r.effective_at)}`} /></td> : null}
            <td className={TD}><Link className="underline underline-offset-2" href={`/comissoes/${r.id}`}>{dateBR(r.effective_at)}</Link></td>
            <td className={TD}>{sellers.get(r.seller_id) ?? '—'}</td>
            <td className={TD}>{r.sale_id ? <Link className="underline underline-offset-2" href={`/vendas/${r.sale_id}`}>{sales.get(r.sale_id) ?? 'ver'}</Link> : '—'}</td>
            <td className={TD}>{ENTRY_TYPE_LABEL[r.entry_type]}</td><td className={TD}>{CAUSE_LABEL[r.cause]}</td>
            <td className={TD}><StatusPill kind="approval" status={r.approval_status} /></td><td className={TDR}><Money cents={r.amount_cents} /></td>
          </tr>
        ))}
      </tbody>
      {rows.length > 0 ? <tfoot><tr className="border-t border-border"><td className={TD} colSpan={selectable ? 7 : 6}><span className="text-xs text-muted">Total desta página</span></td><td className={TDR}><span className="font-semibold">{brl(total)}</span></td></tr></tfoot> : null}
    </TableShell>
  );
}
