import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Disclosure, TableShell, TD, TH } from '@/components/cm/bits';
import { TeamForm } from '@/components/cm/forms-registry';
import { loadSellers, loadTeams } from '@/lib/commissions/data';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Equipes' };

export default async function TeamsPage() {
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx, org } = pc;
  const [teams, sellers] = await Promise.all([loadTeams(ctx), loadSellers(ctx)]);
  let managers: Array<{ value: string; label: string }> = [];
  const nameOf = new Map<string, string>();
  if (pc.perms.admin) {
    const { data } = await ctx.supabase.rpc('cm_org_members', { p_org: org });
    const ms = (data ?? []) as Array<{ user_id: string; role: string; email: string | null; name: string | null }>;
    for (const m of ms) nameOf.set(m.user_id, m.name ?? m.email ?? m.user_id);
    managers = ms.filter((m) => ['owner', 'admin', 'manager'].includes(m.role)).map((m) => ({ value: m.user_id, label: `${m.name ?? m.email} (${m.role})` }));
  }
  const visible = pc.profile === 'manager' ? teams.filter((t) => pc.managedTeamIds.includes(t.id)) : teams;
  return (
    <>
      <PageHeader title="Equipes" description="Cada equipe tem um gestor, que enxerga e aprova apenas as comissões da própria equipe. O histórico de pertencimento é preservado." />
      {pc.perms.admin ? <div className="mb-6"><Disclosure summary="Criar equipe" tone="primary"><TeamForm managers={managers} /></Disclosure></div> : null}
      <TableShell caption="Equipes" empty={visible.length === 0} emptyText="Nenhuma equipe sob sua gestão.">
        <thead><tr><th className={TH}>Equipe</th><th className={TH}>Gestor</th><th className={TH}>Vendedores ativos</th><th className={TH}>Situação</th><th className={TH}><span className="sr-only">Ações</span></th></tr></thead>
        <tbody className="divide-y divide-border">
          {visible.map((t) => (
            <tr key={t.id}>
              <td className={TD}><span className="font-medium">{t.name}</span>{t.description ? <span className="block text-xs text-muted">{t.description}</span> : null}</td>
              <td className={TD}>{t.manager_user_id ? nameOf.get(t.manager_user_id) ?? 'definido' : <span className="text-muted">sem gestor</span>}</td>
              <td className={TD}>{sellers.filter((s) => s.team_id === t.id && s.status === 'active').length}</td>
              <td className={TD}>{t.active ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}</td>
              <td className={TD}><div className="flex flex-wrap items-center gap-3"><Link className="text-sm underline underline-offset-2" href={`/dashboard?team=${t.id}`}>Desempenho</Link><Link className="text-sm underline underline-offset-2" href={`/vendedores?team=${t.id}`}>Vendedores</Link></div></td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      {pc.perms.admin ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold">Editar equipes</h2>
          {teams.map((t) => <Disclosure key={t.id} summary={t.name}><TeamForm team={t} managers={managers} /></Disclosure>)}
        </div>
      ) : null}
    </>
  );
}
