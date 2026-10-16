import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TH } from '@/components/cm/bits';
import { CalcMemory } from '@/components/cm/calc-memory';
import { AdjustmentForm, DisputeOpenForm } from '@/components/cm/forms-ledger';
import { DefinitionList, Money, StatusPill } from '@/components/cm/page-bits';
import { loadOptions } from '@/lib/commissions/data';
import { dateBR } from '@/lib/commissions/format';
import { CAUSE_LABEL, ENTRY_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Lançamento de comissão' };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const { data: e } = await ctx.supabase.from('commission_entries').select('*').eq('id', id).maybeSingle();
  if (!e) notFound();
  const en = e as { id: string; seller_id: string; sale_id: string | null; plan_version_id: string | null; rule_id: string | null; calculation_detail_id: string | null; entry_type: string; amount_cents: number; approval_status: string; effective_at: string; eligible_at: string; original_entry_id: string | null; cause: string; origin: string; component_key: string; idempotency_key: string; created_at: string };
  const [{ data: det }, { data: evs }, { data: disp }, { data: adjs }, { data: sel }, { data: sale }, opts] = await Promise.all([
    en.calculation_detail_id ? ctx.supabase.from('commission_calculation_details').select('base_amount_cents, rate_decimal, calculated_amount_cents, eligible_amount_cents, calculation_snapshot_json').eq('id', en.calculation_detail_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from('commission_approval_events').select('id, decision, justification, reviewed_at').eq('commission_entry_id', id).order('reviewed_at'),
    ctx.supabase.from('commission_disputes').select('id, status, description, resolution, opened_at, resolved_at').eq('commission_entry_id', id).order('opened_at'),
    ctx.supabase.from('commission_entries').select('id, entry_type, amount_cents, effective_at').eq('original_entry_id', id),
    ctx.supabase.from('sellers').select('id, name').eq('id', en.seller_id).maybeSingle(),
    en.sale_id ? ctx.supabase.from('sales').select('id, sale_number').eq('id', en.sale_id).maybeSingle() : Promise.resolve({ data: null }),
    pc.perms.adjust ? loadOptions(ctx) : Promise.resolve(null),
  ]);
  const detail = det as { base_amount_cents: number; rate_decimal: number | null; calculated_amount_cents: number; eligible_amount_cents: number; calculation_snapshot_json: unknown } | null;
  const events = (evs ?? []) as Array<{ id: string; decision: string; justification: string | null; reviewed_at: string }>;
  const disputes = (disp ?? []) as Array<{ id: string; status: string; description: string; resolution: string | null; opened_at: string; resolved_at: string | null }>;
  const children = (adjs ?? []) as Array<{ id: string; entry_type: string; amount_cents: number; effective_at: string }>;
  const sellerName = (sel as { name?: string } | null)?.name ?? '—';
  const saleNo = (sale as { sale_number?: string } | null)?.sale_number;
  const mine = pc.sellerId === en.seller_id;
  const openDispute = disputes.some((d) => d.status === 'open' || d.status === 'in_review');

  return (
    <>
      <PageHeader title={`${ENTRY_TYPE_LABEL[en.entry_type]} — ${sellerName}`} description={`Lançamento de ${dateBR(en.effective_at)}`}>
        <div className="flex items-center gap-3"><StatusPill kind="approval" status={en.approval_status} /><Link href="/comissoes" className="text-sm underline underline-offset-2">← Extrato</Link></div>
      </PageHeader>
      <Card>
        <DefinitionList items={[
          ['Valor', <Money key="v" cents={en.amount_cents} strong />], ['Vendedor', sellerName], ['Venda', en.sale_id ? <Link key="s" className="underline underline-offset-2" href={`/vendas/${en.sale_id}`}>{saleNo}</Link> : '—'],
          ['Origem', CAUSE_LABEL[en.cause]], ['Elegível desde', dateBR(en.eligible_at)], ['Criado em', dateBR(en.created_at)],
          ['Lançamento original', en.original_entry_id ? <Link key="o" className="underline underline-offset-2" href={`/comissoes/${en.original_entry_id}`}>ver original</Link> : '—'],
        ]} />
        <p className="mt-3 text-xs text-muted">Este lançamento é imutável. Qualquer correção entra como novo lançamento (estorno ou ajuste) que referencia este.</p>
      </Card>

      <Section title="Memória de cálculo" description="De onde veio o valor: plano, versão, regra, base, taxa, elegibilidade e arredondamento.">
        {detail ? <Card><CalcMemory snapshot={detail.calculation_snapshot_json} sellers={new Map([[en.seller_id, sellerName]])} /></Card> : <Alert tone="info">{en.origin === 'adjustment' ? 'Ajuste manual: veja a justificativa abaixo e no histórico de decisões.' : 'Memória de cálculo indisponível para este perfil ou lançamento.'}</Alert>}
      </Section>

      <Section title="Histórico de decisões">
        <TableShell caption="Decisões" empty={events.length === 0} emptyText="Sem decisões registradas ainda (lançamento calculado).">
          <thead><tr><th className={TH}>Quando</th><th className={TH}>Decisão</th><th className={TH}>Justificativa</th></tr></thead>
          <tbody className="divide-y divide-border">{events.map((x) => <tr key={x.id}><td className={TD}>{dateBR(x.reviewed_at)}</td><td className={TD}>{{ submitted: 'Enviado para revisão', approved: 'Aprovado', rejected: 'Rejeitado', contested: 'Contestado', restored: 'Estado restaurado', adjusted: 'Ajustado' }[x.decision] ?? x.decision}</td><td className={TD}>{x.justification ?? '—'}</td></tr>)}</tbody>
        </TableShell>
      </Section>

      {children.length > 0 ? (
        <Section title="Correções que referenciam este lançamento">
          <TableShell caption="Correções"><thead><tr><th className={TH}>Data</th><th className={TH}>Tipo</th><th className={TH}>Valor</th></tr></thead>
            <tbody className="divide-y divide-border">{children.map((c) => <tr key={c.id}><td className={TD}><Link className="underline underline-offset-2" href={`/comissoes/${c.id}`}>{dateBR(c.effective_at)}</Link></td><td className={TD}>{ENTRY_TYPE_LABEL[c.entry_type]}</td><td className={TD}><Money cents={c.amount_cents} /></td></tr>)}</tbody>
          </TableShell>
        </Section>
      ) : null}

      <Section title="Contestações">
        {disputes.length === 0 ? <p className="text-sm text-muted">Nenhuma contestação.</p> : disputes.map((d) => (
          <Card key={d.id} className="mb-3"><div className="flex items-center gap-2"><StatusPill kind="dispute" status={d.status} /><span className="text-xs text-muted">aberta em {dateBR(d.opened_at)}</span></div><p className="mt-2 text-sm">{d.description}</p>{d.resolution ? <p className="mt-2 text-sm"><strong>Resposta:</strong> {d.resolution}</p> : null}</Card>
        ))}
        {pc.perms.seller && mine && !openDispute ? <Disclosure summary="Abrir contestação"><DisputeOpenForm entryId={id} /></Disclosure> : null}
        {disputes.length > 0 ? <p className="mt-2 text-sm"><Link className="underline underline-offset-2" href="/contestacoes">Ir para a fila de contestações</Link></p> : null}
      </Section>

      {pc.perms.adjust && opts ? (
        <Section title="Ajuste manual relacionado" description="Cria um novo lançamento compensatório (nunca altera este). Exige justificativa e, conforme a configuração, aprovação.">
          <Disclosure summary="Registrar ajuste para este vendedor"><AdjustmentForm sellers={opts.sellers} sellerId={en.seller_id} relatedEntry={id} /></Disclosure>
        </Section>
      ) : null}
    </>
  );
}
