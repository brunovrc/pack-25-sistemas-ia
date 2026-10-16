import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Pagination, TableShell, TD, TH } from '@/components/cm/bits';
import { FInput, FSelect, FilterForm, StatusPill } from '@/components/cm/page-bits';
import { SellerForm } from '@/components/cm/forms-registry';
import { loadTeams } from '@/lib/commissions/data';
import { dateBR } from '@/lib/commissions/format';
import { SELLER_STATUS_LABEL, SELLER_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { PAGE_SIZE, one, pageFrom, safeSearch, uuidOrNull, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Vendedores' };

export default async function SellersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx, org } = pc;
  const page = pageFrom(one(sp.page));
  const q = safeSearch(one(sp.q));
  const status = one(sp.status);
  const team = uuidOrNull(one(sp.team));

  let query = ctx.supabase.from('sellers').select('id, name, seller_code, seller_type, status, team_id, user_id, starts_at, ends_at', { count: 'exact' }).order('name');
  if (q) query = query.or(`name.ilike.%${q}%,seller_code.ilike.%${q}%`);
  if (status && Object.keys(SELLER_STATUS_LABEL).includes(status)) query = query.eq('status', status);
  else query = query.neq('status', 'archived');
  if (team) query = query.eq('team_id', team);
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Array<{ id: string; name: string; seller_code: string; seller_type: string; status: string; team_id: string | null; user_id: string | null; starts_at: string; ends_at: string | null }>;

  const teams = await loadTeams(ctx);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const ids = rows.map((r) => r.id);
  const planOf = new Map<string, string>();
  if (ids.length) {
    const { data: asg } = await ctx.supabase.from('seller_plan_assignments').select('seller_id, plan_id, valid_from, valid_until').in('seller_id', ids).lte('valid_from', pc.today);
    const cur = ((asg ?? []) as Array<{ seller_id: string; plan_id: string; valid_until: string | null }>).filter((a) => a.valid_until === null || a.valid_until >= pc.today);
    const { data: plans } = cur.length ? await ctx.supabase.from('commission_plans').select('id, name').in('id', [...new Set(cur.map((a) => a.plan_id))]) : { data: [] };
    const pn = new Map(((plans ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
    for (const a of cur) planOf.set(a.seller_id, pn.get(a.plan_id) ?? '—');
  }

  const teamOpts = (pc.profile === 'manager' ? teams.filter((t) => pc.managedTeamIds.includes(t.id)) : teams).map((t) => ({ value: t.id, label: t.name }));
  let users: Array<{ value: string; label: string }> = [];
  if (pc.perms.admin) {
    const { data: m } = await ctx.supabase.rpc('cm_org_members', { p_org: org });
    users = ((m ?? []) as Array<{ user_id: string; email: string | null; name: string | null; role: string }>).map((u) => ({ value: u.user_id, label: `${u.name ?? u.email ?? u.user_id} (${u.role})` }));
  }

  return (
    <>
      <PageHeader title="Vendedores" description="Quem vende e recebe comissão. Mudanças de equipe e de plano têm data efetiva e nunca alteram comissões já apuradas." />
      {pc.profile === 'manager' ? <div className="mb-4"><Alert tone="info">Como gestor, você vê e gerencia os vendedores das equipes que gere e os ainda sem equipe.</Alert></div> : null}
      {pc.perms.manageSellers ? <div className="mb-6"><Disclosure summary="Cadastrar vendedor" tone="primary"><SellerForm teams={teamOpts} users={users} canLink={pc.perms.admin} canTeam /></Disclosure></div> : null}
      <FilterForm clear="/vendedores">
        <FInput name="q" label="Buscar por nome ou código" sp={sp} />
        <FSelect name="status" label="Status" sp={sp} opts={Object.entries(SELLER_STATUS_LABEL).map(([value, label]) => ({ value, label }))} placeholder="Ativos e inativos" />
        <FSelect name="team" label="Equipe" sp={sp} opts={teams.map((t) => ({ value: t.id, label: t.name }))} />
      </FilterForm>
      <TableShell caption="Vendedores" empty={rows.length === 0} emptyText="Nenhum vendedor encontrado com estes filtros.">
        <thead><tr><th className={TH}>Nome</th><th className={TH}>Código</th><th className={TH}>Tipo</th><th className={TH}>Equipe</th><th className={TH}>Plano atual</th><th className={TH}>Status</th><th className={TH}>Desde</th><th className={TH}><span className="sr-only">Ações</span></th></tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={TD}><Link className="font-medium underline underline-offset-2" href={`/vendedores/${r.id}`}>{r.name}</Link>{r.user_id ? <span className="ml-2 text-xs text-muted">com login</span> : null}</td>
              <td className={TD}>{r.seller_code}</td><td className={TD}>{SELLER_TYPE_LABEL[r.seller_type]}</td>
              <td className={TD}>{r.team_id ? teamName.get(r.team_id) ?? '—' : 'Sem equipe'}</td>
              <td className={TD}>{planOf.get(r.id) ?? <span className="text-warning">Sem plano</span>}</td>
              <td className={TD}><StatusPill kind="seller" status={r.status} /></td><td className={TD}>{dateBR(r.starts_at)}</td>
              <td className={TD}><Link className="text-sm underline underline-offset-2" href={`/vendedores/${r.id}`}>Abrir</Link></td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <Pagination base="/vendedores" sp={sp} page={page} total={count ?? 0} />
    </>
  );
}
