import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { CancelPeriodForm, ClosePeriodButton, PrepareButton, ReopenForm, SubmitPeriodButton } from '@/components/cm/forms-closing';
import { DefinitionList, Money, StatusPill } from '@/components/cm/page-bits';
import { brl, dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Fechamento' };

type Checks = { critical_pendencies: number; open_disputes: number; pending_entries: number; pending_entries_cents: number; negative_balances_blocking: number; earlier_open_periods: number; period_in_future: boolean; blocked: boolean };

export default async function PeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx, org } = pc;
  const { data: p } = await ctx.supabase.from('commission_periods').select('id, period_start, period_end, status, closed_at, reopened_count').eq('id', id).maybeSingle();
  if (!p) notFound();
  const per = p as { id: string; period_start: string; period_end: string; status: string; closed_at: string | null; reopened_count: number };
  const { data: cl } = await ctx.supabase.from('commission_closings').select('id, seller_id, total_commissions_cents, total_bonuses_cents, total_adjustments_cents, total_reversals_cents, carryover_in_cents, carryover_out_cents, payable_amount_cents, status').eq('period_id', id).neq('status', 'cancelled').order('created_at');
  const closings = (cl ?? []) as Array<{ id: string; seller_id: string; total_commissions_cents: number; total_bonuses_cents: number; total_adjustments_cents: number; total_reversals_cents: number; carryover_in_cents: number; carryover_out_cents: number; payable_amount_cents: number; status: string }>;
  const sIds = closings.map((c) => c.seller_id);
  const { data: s } = sIds.length ? await ctx.supabase.from('sellers').select('id, name').in('id', sIds) : { data: [] };
  const names = new Map(((s ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  let checks: Checks | null = null;
  if (pc.perms.close && ['open', 'in_review', 'awaiting_approval'].includes(per.status)) {
    const { data: c } = await ctx.supabase.rpc('cm_period_checks', { p_org: org, p_period: id });
    checks = c as Checks;
  }
  const total = (k: keyof (typeof closings)[number]) => closings.reduce((a, c) => a + (c[k] as number), 0);

  return (
    <>
      <PageHeader title={`Período ${dateBR(per.period_start)} a ${dateBR(per.period_end)}`}>
        <div className="flex items-center gap-3"><StatusPill kind="period" status={per.status} /><Link href="/fechamentos" className="text-sm underline underline-offset-2">← Fechamentos</Link></div>
      </PageHeader>

      {checks ? (
        <Section title="Conferência antes de fechar">
          <Card>
            <DefinitionList items={[
              ['Pendências críticas de cálculo', <span key="1" className={checks.critical_pendencies ? 'text-danger' : ''}>{checks.critical_pendencies}</span>],
              ['Contestações abertas', <span key="2" className={checks.open_disputes ? 'text-danger' : ''}>{checks.open_disputes}</span>],
              ['Períodos anteriores em aberto', <span key="3" className={checks.earlier_open_periods ? 'text-danger' : ''}>{checks.earlier_open_periods}</span>],
              ['Saldos negativos a analisar', <span key="4" className={checks.negative_balances_blocking ? 'text-danger' : ''}>{checks.negative_balances_blocking}</span>],
              ['Lançamentos ainda não aprovados', `${checks.pending_entries} (${brl(checks.pending_entries_cents)}) — passam para o próximo fechamento`],
              ['Período já terminou?', checks.period_in_future ? <span key="5" className="text-danger">ainda não</span> : 'sim'],
            ]} />
            <div className="mt-3">{checks.blocked ? <Alert tone="error">Há inconsistências que impedem o fechamento. Resolva-as (Extrato de comissões → pendências; Contestações; períodos anteriores).</Alert> : <Alert tone="success">Nenhum bloqueio. Pendentes de aprovação seguem para o próximo período.</Alert>}</div>
          </Card>
        </Section>
      ) : null}

      <Section title="Fechamento por vendedor" description="Totais por tipo de lançamento. «A pagar» = soma − saldo devedor herdado (nunca negativo).">
        <TableShell caption="Fechamentos individuais" empty={closings.length === 0} emptyText="Nenhum fechamento montado. Use «Montar conferência» para incluir os lançamentos aprovados.">
          <thead><tr><th className={TH}>Vendedor</th><th className={THR}>Comissões</th><th className={THR}>Bônus</th><th className={THR}>Ajustes</th><th className={THR}>Estornos</th><th className={THR}>Saldo anterior</th><th className={THR}>A pagar</th><th className={THR}>Saldo p/ próximo</th><th className={TH}>Situação</th></tr></thead>
          <tbody className="divide-y divide-border">{closings.map((c) => (
            <tr key={c.id}>
              <td className={TD}>{names.get(c.seller_id) ?? '—'}</td><td className={TDR}>{brl(c.total_commissions_cents)}</td><td className={TDR}>{brl(c.total_bonuses_cents)}</td><td className={TDR}><Money cents={c.total_adjustments_cents} /></td><td className={TDR}><Money cents={c.total_reversals_cents} /></td>
              <td className={TDR}>{brl(-c.carryover_in_cents)}</td><td className={TDR}><Money cents={c.payable_amount_cents} strong /></td><td className={TDR}>{c.carryover_out_cents ? <Money cents={-c.carryover_out_cents} /> : '—'}</td><td className={TD}><StatusPill kind="closing" status={c.status} /></td>
            </tr>
          ))}</tbody>
          {closings.length ? <tfoot><tr className="border-t border-border font-semibold"><td className={TD}>Total</td><td className={TDR}>{brl(total('total_commissions_cents'))}</td><td className={TDR}>{brl(total('total_bonuses_cents'))}</td><td className={TDR}>{brl(total('total_adjustments_cents'))}</td><td className={TDR}>{brl(total('total_reversals_cents'))}</td><td className={TDR}>{brl(-total('carryover_in_cents'))}</td><td className={TDR}>{brl(total('payable_amount_cents'))}</td><td className={TDR}>{brl(-total('carryover_out_cents'))}</td><td /></tr></tfoot> : null}
        </TableShell>
      </Section>

      {pc.perms.close ? (
        <Section title="Ações">
          <div className="flex flex-wrap items-start gap-3">
            {['open', 'in_review'].includes(per.status) ? <PrepareButton id={id} again={per.status === 'in_review'} /> : null}
            {per.status === 'in_review' ? <SubmitPeriodButton id={id} /> : null}
            {per.status === 'awaiting_approval' ? <><ClosePeriodButton id={id} /><PrepareButton id={id} again /></> : null}
            {per.status === 'closed' ? <Link href={`/demonstrativos?period=${id}`} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Demonstrativos</Link> : null}
            {per.status === 'closed' ? <Link href="/pagamentos" className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Registrar pagamentos</Link> : null}
          </div>
          <div className="mt-4 space-y-3">
            {['open', 'in_review', 'awaiting_approval'].includes(per.status) ? <Disclosure summary="Cancelar período" tone="danger"><CancelPeriodForm id={id} /></Disclosure> : null}
            {per.status === 'closed' && pc.perms.admin ? <Disclosure summary="Reabertura formal" tone="danger"><ReopenForm id={id} /></Disclosure> : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}
