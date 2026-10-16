import type { Metadata } from 'next';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section } from '@/components/cm/bits';
import { CalculateGoalsButton } from '@/components/cm/forms-ledger';
import { ArchiveGoalButton, GoalForm } from '@/components/cm/forms-goals';
import { Progress } from '@/components/cm/page-bits';
import { goalLines, loadOptions } from '@/lib/commissions/data';
import { brl, dateBR, pctBR } from '@/lib/commissions/format';
import { GOAL_SCOPE_LABEL, GOAL_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Metas e bônus' };

export default async function GoalsPage() {
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const opts = await loadOptions(ctx);
  const visible = new Set(opts.sellers.map((s) => s.value));
  const lines = await goalLines(ctx, pc.profile!, visible, pc.managedTeamIds);
  const names = new Map([...opts.sellers, ...opts.teams].map((o) => [o.value, o.label]));
  const teams = pc.profile === 'manager' ? opts.teams.filter((t) => pc.managedTeamIds.includes(t.value)) : opts.teams;
  const money = (g: { type: string }) => ['sold_value', 'received_value', 'product_value'].includes(g.type);
  return (
    <>
      <PageHeader title="Metas e bônus" description="Metas por vendedor, equipe ou empresa, com bônus opcional. O atingimento usa o mesmo motor do cálculo; devoluções reduzem o realizado. Bônus já lançado nunca é estornado sozinho e a meta que gerou bônus fica congelada." />
      {pc.perms.runCalculation ? <div className="mb-4 flex flex-wrap items-center gap-3"><CalculateGoalsButton /><span className="text-xs text-muted">Lança o bônus das metas que já o merecem (o mesmo bônus nunca é lançado duas vezes).</span></div> : null}
      {pc.perms.goals ? <div className="mb-6"><Disclosure summary="Criar meta" tone="primary"><GoalForm sellers={opts.sellers} teams={teams} products={opts.products} plans={opts.plans} today={pc.today} canOrg={pc.perms.finance} /></Disclosure></div> : null}
      {pc.profile === 'manager' ? <div className="mb-4"><Alert tone="info">Você vê o atingimento das metas dos seus vendedores e equipes.</Alert></div> : null}
      <Section title="Atingimento">
        {lines.length === 0 ? <EmptyState title="Nenhuma meta ativa" /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => {
              const g = l.goal;
              const fmt = (v: string | number) => (money(g) ? brl(Math.round(Number(v))) : Number(v).toLocaleString('pt-BR'));
              return (
                <Card key={g.id}>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted">{GOAL_TYPE_LABEL[g.type]} · {GOAL_SCOPE_LABEL[g.scope]}{g.scopeReference ? `: ${names.get(g.scopeReference) ?? ''}` : ''}</p>
                  <p className="text-xs text-muted">{dateBR(g.periodStart)} a {dateBR(g.periodEnd)}</p>
                  <div className="mt-3"><Progress pct={l.attainment * 100} label={`Atingimento de ${g.name}`} /></div>
                  <p className="mt-1 text-sm tabular-nums">{fmt(l.value)} de {fmt(g.target)} · {pctBR(l.attainment * 100, 1)}</p>
                  {g.bonusRules.length ? <p className="mt-2 text-xs text-muted">Bônus: {g.bonusRules.map((b) => `${b.bonusType === 'fixed' ? brl(b.bonusAmountCents) : `${pctBR(Number(b.bonusRate) * 100, 2)} do realizado`} ao atingir ${b.thresholdPct}%`).join(' · ')}</p> : null}
                  {pc.perms.goals ? <div className="mt-3"><ArchiveGoalButton id={g.id} /></div> : null}
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
