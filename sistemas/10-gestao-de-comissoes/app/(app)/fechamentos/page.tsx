import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { OpenPeriodForm } from '@/components/cm/forms-closing';
import { Money, StatusPill } from '@/components/cm/page-bits';
import { dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { addMonths, monthEnd, monthStart } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Fechamentos' };

export default async function ClosingsPage() {
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const { data } = await ctx.supabase.from('commission_periods').select('id, period_start, period_end, status, closed_at, reopened_count').order('period_start', { ascending: false }).limit(60);
  const periods = (data ?? []) as Array<{ id: string; period_start: string; period_end: string; status: string; closed_at: string | null; reopened_count: number }>;
  const ids = periods.map((p) => p.id);
  const { data: cl } = ids.length ? await ctx.supabase.from('commission_closings').select('id, period_id, seller_id, payable_amount_cents, status').in('period_id', ids).neq('status', 'cancelled') : { data: [] };
  const closings = (cl ?? []) as Array<{ id: string; period_id: string; seller_id: string; payable_amount_cents: number; status: string }>;
  const last = periods.find((p) => p.status !== 'cancelled');
  const nextStart = last ? addMonths(monthStart(last.period_end), 1) : monthStart(addMonths(monthStart(pc.today), -1));
  return (
    <>
      <PageHeader title="Fechamentos" description="Fluxo mensal: abrir o período → montar a conferência com o que está aprovado → enviar para aprovação → fechar. Fechado é imutável; correções entram em períodos seguintes ou por reabertura formal." />
      {pc.perms.close ? <Section title="Abrir período"><div className="rounded-lg border border-border bg-card p-4"><OpenPeriodForm from={nextStart} to={monthEnd(nextStart)} /></div></Section> : null}
      <Section title="Períodos">
        <TableShell caption="Períodos de fechamento" empty={periods.length === 0} emptyText={pc.perms.close ? 'Nenhum período ainda. Abra o primeiro acima.' : 'Nenhum fechamento disponível para você ainda.'}>
          <thead><tr><th className={TH}>Período</th><th className={TH}>Situação</th><th className={TH}>Fechamentos</th><th className={THR}>A pagar (soma)</th><th className={TH}>Fechado em</th><th className={TH} /></tr></thead>
          <tbody className="divide-y divide-border">{periods.map((p) => {
            const mine = closings.filter((c) => c.period_id === p.id);
            return (
              <tr key={p.id}>
                <td className={TD}>{dateBR(p.period_start)} a {dateBR(p.period_end)}{p.reopened_count ? <span className="block text-xs text-muted">reaberto {p.reopened_count}×</span> : null}</td>
                <td className={TD}><StatusPill kind="period" status={p.status} /></td><td className={TD}>{mine.length}</td>
                <td className={TDR}><Money cents={mine.reduce((a, c) => a + c.payable_amount_cents, 0)} /></td><td className={TD}>{dateBR(p.closed_at)}</td>
                <td className={TD}><Link className="underline underline-offset-2" href={`/fechamentos/${p.id}`}>Abrir</Link></td>
              </tr>
            );
          })}</tbody>
        </TableShell>
      </Section>
      <Disclosure summary="Como o fechamento funciona">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Entram lançamentos <strong>aprovados</strong>, elegíveis até o fim do período e ainda fora de outro fechamento (um lançamento nunca entra em dois).</li>
          <li>Pendências críticas, contestações abertas e períodos anteriores em aberto bloqueiam o fechamento.</li>
          <li>Saldo negativo (estorno de comissão já paga) é compensado no período seguinte ou exige análise manual, conforme a configuração. Compensações de remuneração podem ter limites legais/contratuais.</li>
          <li>O sistema registra pagamentos feitos fora dele; não transfere dinheiro.</li>
        </ul>
      </Disclosure>
    </>
  );
}
