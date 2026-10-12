import type { Metadata } from 'next';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { GoalForm } from '@/components/crm/forms';
import { DeleteGoalButton } from '@/components/crm/row-actions';
import { requireContext } from '@/lib/auth/session';
import { isManager, personOptions } from '@/lib/crm/access';
import { goalLabel } from '@/lib/crm/chart-data';
import { labelMap, loadOptions, type GoalProgress } from '@/lib/crm/data';
import { addDays, todaySaoPaulo } from '@/lib/crm/filters';
import { formatBRL, formatDate, formatPct } from '@/lib/crm/format';

export const metadata: Metadata = { title: 'Metas' };

export default async function GoalsPage() {
  const ctx = await requireContext();
  const manager = isManager(ctx.membership.role);
  const today = todaySaoPaulo();
  const options = await loadOptions(ctx);
  const labels = labelMap(options.people);

  // janela larga: metas passadas, atuais e futuras
  const { data } = await ctx.supabase.rpc('crm_goals_progress', { p_org: ctx.membership.organization_id, p_from: addDays(today, -1100), p_to: addDays(today, 1100), p_owner: null, p_team: null });
  const goals = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    goal_id: String(r.goal_id), scope: r.scope as 'user' | 'team', user_id: (r.user_id as string | null) ?? null, team_id: (r.team_id as string | null) ?? null,
    team_name: (r.team_name as string | null) ?? null, period_start: String(r.period_start), period_end: String(r.period_end),
    target_amount: Number(r.target_amount), realized: Number(r.realized), pct: r.pct === null ? null : Number(r.pct), elapsed_pct: Number(r.elapsed_pct),
  })) satisfies GoalProgress[];
  const sorted = [...goals].sort((a, b) => (a.period_end < b.period_end ? 1 : -1));

  return (
    <>
      <PageHeader title="Metas" description="Metas de vendas ganhas por vendedor ou equipe. O realizado soma só os negócios ganhos dentro do período da própria meta." />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Acompanhamento">
          {sorted.length === 0 ? <EmptyState title="Nenhuma meta definida" description={manager ? 'Crie a primeira meta ao lado.' : 'Peça a um gerente para definir suas metas.'} /> : (
            <ul className="space-y-4">
              {sorted.map((g) => {
                const pct = g.pct ?? 0;
                const active = g.period_start <= today && today <= g.period_end;
                const behind = active && g.elapsed_pct >= 25 && pct < g.elapsed_pct - 15;
                return (
                  <li key={g.goal_id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{goalLabel(g, labels)} <span className="text-xs font-normal text-muted">({g.scope === 'team' ? 'equipe' : 'individual'})</span></p>
                        <p className="text-xs text-muted">{formatDate(g.period_start)} a {formatDate(g.period_end)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {pct >= 100 ? <Badge tone="success">Atingida</Badge> : behind ? <Badge tone="warning">Abaixo do ritmo</Badge> : active ? <Badge>Em andamento</Badge> : null}
                        {manager ? <DeleteGoalButton id={g.goal_id} /> : null}
                      </div>
                    </div>
                    <progress className="mt-2 h-3 w-full accent-[var(--accent)]" value={Math.min(pct, 100)} max={100} aria-label={`Progresso da meta de ${goalLabel(g, labels)}`} />
                    <p className="mt-1 text-sm tabular-nums">{formatBRL(g.realized)} de {formatBRL(g.target_amount)} · <strong>{formatPct(g.pct)}</strong>{active ? <span className="text-muted"> · {formatPct(g.elapsed_pct)} do período decorrido</span> : null}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        {manager ? <Card title="Nova meta"><GoalForm people={personOptions(options.people)} teams={options.teams.map((t) => ({ value: t.id, label: t.name }))} /></Card> : null}
      </div>
    </>
  );
}
