import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Pagination, Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { EntriesTable } from '@/components/cm/entries-table';
import { AdjustmentDecisionForm, ReviewForm } from '@/components/cm/forms-ledger';
import { FSelect, FilterForm, Money, StatusPill } from '@/components/cm/page-bits';
import { loadOptions } from '@/lib/commissions/data';
import { loadEntries } from '@/lib/commissions/entries';
import { dateBR } from '@/lib/commissions/format';
import { ADJUSTMENT_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import type { SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Aprovações' };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx } = pc;
  const list = await loadEntries(ctx, sp, ['calculated', 'pending_review', 'rejected']);
  const opts = await loadOptions(ctx);
  const { data: adj } = await ctx.supabase.from('commission_adjustments').select('id, seller_id, adjustment_type, direction, amount_cents, reason, reference, status, effective_at, created_by').eq('status', 'pending').order('created_at');
  const adjustments = (adj ?? []) as Array<{ id: string; seller_id: string; adjustment_type: string; direction: string; amount_cents: number; reason: string; reference: string | null; effective_at: string; created_by: string | null }>;
  const names = new Map(opts.sellers.map((s) => [s.value, s.label]));

  return (
    <>
      <PageHeader title="Aprovações" description="Revise os lançamentos calculados antes de entrarem no fechamento. Só lançamentos aprovados são incluídos. Decisões ficam registradas com quem decidiu e quando; aprovação repetida é recusada." />
      {pc.profile === 'manager' ? <div className="mb-4"><Alert tone="info">Você revisa os lançamentos das equipes que gere.</Alert></div> : null}
      <Section title="Lançamentos para revisar">
        <FilterForm clear="/aprovacoes"><FSelect name="seller" label="Vendedor" sp={sp} opts={opts.sellers} /></FilterForm>
        <EntriesTable rows={list.rows} sellers={list.sellers} sales={list.sales} selectable />
        <ReviewForm canReopen={pc.perms.finance} />
        <Pagination base="/aprovacoes" sp={sp} page={list.page} total={list.count} />
      </Section>
      {pc.perms.adjust ? (
        <Section title={`Ajustes aguardando aprovação (${adjustments.length})`} description="Ajustes manuais exigem justificativa e, conforme a configuração, aprovação de outra pessoa.">
          <TableShell caption="Ajustes pendentes" empty={adjustments.length === 0} emptyText="Nenhum ajuste pendente.">
            <thead><tr><th className={TH}>Vendedor</th><th className={TH}>Tipo</th><th className={TH}>Data</th><th className={THR}>Valor</th><th className={TH}>Motivo</th><th className={TH}>Decisão</th></tr></thead>
            <tbody className="divide-y divide-border">{adjustments.map((a) => (
              <tr key={a.id}><td className={TD}>{names.get(a.seller_id) ?? '—'}</td><td className={TD}>{ADJUSTMENT_TYPE_LABEL[a.adjustment_type]}</td><td className={TD}>{dateBR(a.effective_at)}</td>
                <td className={TDR}><Money cents={a.direction === 'debit' ? -a.amount_cents : a.amount_cents} /></td><td className={TD}>{a.reason}{a.reference ? <span className="block text-xs text-muted">Ref. {a.reference}</span> : null}</td>
                <td className={TD}><Disclosure summary="Decidir"><AdjustmentDecisionForm id={a.id} /></Disclosure></td></tr>
            ))}</tbody>
          </TableShell>
        </Section>
      ) : null}
      <p className="mt-4 text-xs text-muted">Status possíveis: <StatusPill kind="approval" status="calculated" /> <StatusPill kind="approval" status="pending_review" /> <StatusPill kind="approval" status="approved" /> <StatusPill kind="approval" status="rejected" /></p>
    </>
  );
}
