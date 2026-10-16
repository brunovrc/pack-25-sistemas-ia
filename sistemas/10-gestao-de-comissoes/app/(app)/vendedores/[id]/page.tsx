import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { AssignPlanForm } from '@/components/cm/forms-plans';
import { SellerForm } from '@/components/cm/forms-registry';
import { Money, Progress, StatusPill } from '@/components/cm/page-bits';
import { goalLines, loadTeams } from '@/lib/commissions/data';
import { brl, dateBR, pctBR } from '@/lib/commissions/format';
import { ENTRY_TYPE_LABEL, GOAL_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Vendedor' };

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx, org } = pc;
  const { data: s } = await ctx.supabase.from('sellers').select('id, name, seller_code, seller_type, status, team_id, user_id, starts_at, ends_at, notes').eq('id', id).maybeSingle();
  if (!s) notFound();
  const seller = s as { id: string; name: string; seller_code: string; seller_type: string; status: string; team_id: string | null; user_id: string | null; starts_at: string; ends_at: string | null; notes: string | null };

  const teams = await loadTeams(ctx);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamOpts = (pc.profile === 'manager' ? teams.filter((t) => pc.managedTeamIds.includes(t.id)) : teams).map((t) => ({ value: t.id, label: t.name }));
  const [{ data: hist }, { data: asg }, { data: plans }, { data: parts }, { data: entries }] = await Promise.all([
    ctx.supabase.from('seller_team_history').select('team_id, valid_from, valid_until').eq('seller_id', id).order('valid_from', { ascending: false }),
    ctx.supabase.from('seller_plan_assignments').select('id, plan_id, valid_from, valid_until').eq('seller_id', id).order('valid_from', { ascending: false }),
    ctx.supabase.from('commission_plans').select('id, name').eq('status', 'active').order('name'),
    ctx.supabase.from('sale_participants').select('sale_id, allocation_percentage, participation_type').eq('seller_id', id).limit(200),
    ctx.supabase.from('commission_entries').select('id, entry_type, amount_cents, approval_status, effective_at, sale_id').eq('seller_id', id).order('effective_at', { ascending: false }).limit(15),
  ]);
  const planName = new Map(((plans ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const { data: allPlans } = await ctx.supabase.from('commission_plans').select('id, name');
  for (const p of (allPlans ?? []) as Array<{ id: string; name: string }>) planName.set(p.id, p.name);

  const saleIds = ((parts ?? []) as Array<{ sale_id: string }>).map((p) => p.sale_id);
  const { data: sales } = saleIds.length ? await ctx.supabase.from('sales').select('id, sale_number, sale_date, status, commissionable_amount_cents').in('id', saleIds.slice(0, 80)).order('sale_date', { ascending: false }).limit(10) : { data: [] };
  const alloc = new Map(((parts ?? []) as Array<{ sale_id: string; allocation_percentage: number }>).map((p) => [p.sale_id, Number(p.allocation_percentage)]));

  const lines = (await goalLines(ctx, pc.profile!, new Set([id]), pc.managedTeamIds)).filter((l) => l.goal.scope === 'seller' && l.goal.scopeReference === id);
  let users: Array<{ value: string; label: string }> = [];
  if (pc.perms.admin) {
    const { data: m } = await ctx.supabase.rpc('cm_org_members', { p_org: org });
    users = ((m ?? []) as Array<{ user_id: string; email: string | null; name: string | null; role: string }>).map((u) => ({ value: u.user_id, label: `${u.name ?? u.email ?? u.user_id} (${u.role})` }));
  }

  return (
    <>
      <PageHeader title={seller.name} description={`Código ${seller.seller_code} · ${seller.team_id ? teamName.get(seller.team_id) : 'sem equipe'}`}>
        <Link href={`/dashboard?seller=${id}`} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Ver desempenho</Link>
      </PageHeader>

      <Section title="Dados do vendedor">
        <Card><SellerForm seller={seller} teams={teamOpts} users={users} canLink={pc.perms.admin} canTeam /></Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Histórico de equipes" description="A equipe vigente na data de cada venda é a usada nos indicadores.">
          <TableShell caption="Histórico de equipes" empty={!(hist ?? []).length} emptyText="Sem equipe registrada.">
            <thead><tr><th className={TH}>Equipe</th><th className={TH}>De</th><th className={TH}>Até</th></tr></thead>
            <tbody className="divide-y divide-border">{((hist ?? []) as Array<{ team_id: string | null; valid_from: string; valid_until: string | null }>).map((h) => <tr key={h.valid_from}><td className={TD}>{h.team_id ? teamName.get(h.team_id) ?? '—' : '—'}</td><td className={TD}>{dateBR(h.valid_from)}</td><td className={TD}>{h.valid_until ? dateBR(h.valid_until) : 'vigente'}</td></tr>)}</tbody>
          </TableShell>
        </Section>
        <Section title="Planos de comissão" description="Uma atribuição por data. Trocar o plano encerra o anterior no dia anterior e não toca em vendas já apuradas.">
          <TableShell caption="Planos atribuídos" empty={!(asg ?? []).length} emptyText="Sem plano atribuído: o vendedor não gera comissão até receber um plano.">
            <thead><tr><th className={TH}>Plano</th><th className={TH}>De</th><th className={TH}>Até</th></tr></thead>
            <tbody className="divide-y divide-border">{((asg ?? []) as Array<{ id: string; plan_id: string; valid_from: string; valid_until: string | null }>).map((a) => <tr key={a.id}><td className={TD}><Link className="underline underline-offset-2" href={`/planos/${a.plan_id}`}>{planName.get(a.plan_id) ?? '—'}</Link></td><td className={TD}>{dateBR(a.valid_from)}</td><td className={TD}>{a.valid_until ? dateBR(a.valid_until) : 'vigente'}</td></tr>)}</tbody>
          </TableShell>
          {pc.perms.managePlans ? <div className="mt-3"><AssignPlanForm sellerId={id} plans={[...planName.entries()].filter(([pid]) => ((plans ?? []) as Array<{ id: string }>).some((p) => p.id === pid)).map(([value, label]) => ({ value, label }))} today={pc.today} /></div> : null}
        </Section>
      </div>

      <Section title="Metas">
        {lines.length === 0 ? <EmptyState title="Sem metas por vendedor para este vendedor" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => (
              <Card key={l.goal.id}><p className="font-medium">{l.goal.name}</p><p className="text-xs text-muted">{GOAL_TYPE_LABEL[l.goal.type]} · {dateBR(l.goal.periodStart)} a {dateBR(l.goal.periodEnd)}</p>
                <div className="mt-3"><Progress pct={l.attainment * 100} /></div><p className="mt-1 text-sm tabular-nums">{pctBR(l.attainment * 100, 1)}</p></Card>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Vendas recentes">
          <TableShell caption="Vendas recentes do vendedor" empty={!(sales ?? []).length}>
            <thead><tr><th className={TH}>Venda</th><th className={TH}>Data</th><th className={TH}>Status</th><th className={THR}>Participação</th><th className={THR}>Base</th></tr></thead>
            <tbody className="divide-y divide-border">{((sales ?? []) as Array<{ id: string; sale_number: string; sale_date: string; status: string; commissionable_amount_cents: number }>).map((x) => (
              <tr key={x.id}><td className={TD}><Link className="underline underline-offset-2" href={`/vendas/${x.id}`}>{x.sale_number}</Link></td><td className={TD}>{dateBR(x.sale_date)}</td><td className={TD}><StatusPill kind="sale" status={x.status} /></td><td className={TDR}>{pctBR(alloc.get(x.id) ?? 0, 1)}</td><td className={TDR}>{brl(x.commissionable_amount_cents)}</td></tr>
            ))}</tbody>
          </TableShell>
        </Section>
        <Section title="Últimos lançamentos" description="Extrato completo em Extrato de comissões.">
          <TableShell caption="Últimos lançamentos" empty={!(entries ?? []).length}>
            <thead><tr><th className={TH}>Data</th><th className={TH}>Tipo</th><th className={TH}>Status</th><th className={THR}>Valor</th></tr></thead>
            <tbody className="divide-y divide-border">{((entries ?? []) as Array<{ id: string; entry_type: string; amount_cents: number; approval_status: string; effective_at: string }>).map((e) => (
              <tr key={e.id}><td className={TD}><Link className="underline underline-offset-2" href={`/comissoes/${e.id}`}>{dateBR(e.effective_at)}</Link></td><td className={TD}>{ENTRY_TYPE_LABEL[e.entry_type]}</td><td className={TD}><StatusPill kind="approval" status={e.approval_status} /></td><td className={TDR}><Money cents={e.amount_cents} /></td></tr>
            ))}</tbody>
          </TableShell>
        </Section>
      </div>
    </>
  );
}
