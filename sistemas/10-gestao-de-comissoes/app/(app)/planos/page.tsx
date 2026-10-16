import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Disclosure, TableShell, TD, TH } from '@/components/cm/bits';
import { PlanCreateForm } from '@/components/cm/forms-plans';
import { dateBR } from '@/lib/commissions/format';
import { BASIS_LABEL, ELIGIBILITY_LABEL, PLAN_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Planos de comissão' };

export default async function PlansPage() {
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const { data: plans } = await ctx.supabase.from('commission_plans').select('id, name, description, calculation_basis, eligibility_event, plan_type, status').order('name');
  const list = (plans ?? []) as Array<{ id: string; name: string; description: string | null; calculation_basis: string; eligibility_event: string; plan_type: string; status: string }>;
  const ids = list.map((p) => p.id);
  const { data: versions } = ids.length ? await ctx.supabase.from('commission_plan_versions').select('id, plan_id, version_number, status, valid_from, valid_until').in('plan_id', ids).order('version_number', { ascending: false }) : { data: [] };
  const vs = (versions ?? []) as Array<{ plan_id: string; version_number: number; status: string; valid_from: string | null; valid_until: string | null }>;
  const current = (pid: string) => vs.find((v) => v.plan_id === pid && v.status === 'published' && (v.valid_from ?? '') <= pc.today && (!v.valid_until || v.valid_until >= pc.today));

  return (
    <>
      <PageHeader title="Planos de comissão" description={pc.perms.seller ? 'Os planos que se aplicam a você. A regra publicada de uma versão nunca muda: mudanças entram em versões novas com vigência futura.' : 'Cada plano define a base, a elegibilidade e as regras. Versões publicadas são imutáveis; vendas já apuradas guardam o plano com que foram calculadas.'} />
      {pc.perms.managePlans ? <div className="mb-6"><Disclosure summary="Criar plano" tone="primary"><PlanCreateForm /></Disclosure></div> : null}
      {list.length === 0 ? <EmptyState title="Nenhum plano ainda" description={pc.perms.managePlans ? 'Crie o primeiro plano e publique uma versão para começar a calcular.' : 'Nenhum plano foi atribuído a você ainda.'} /> : (
        <TableShell caption="Planos">
          <thead><tr><th className={TH}>Plano</th><th className={TH}>Base</th><th className={TH}>Elegibilidade</th><th className={TH}>Tipo</th><th className={TH}>Versão vigente</th><th className={TH}>Situação</th></tr></thead>
          <tbody className="divide-y divide-border">
            {list.map((p) => {
              const cur = current(p.id);
              const draft = vs.some((v) => v.plan_id === p.id && v.status === 'draft');
              return (
                <tr key={p.id}>
                  <td className={TD}><Link className="font-medium underline underline-offset-2" href={`/planos/${p.id}`}>{p.name}</Link>{p.description ? <span className="block text-xs text-muted">{p.description}</span> : null}</td>
                  <td className={TD}>{BASIS_LABEL[p.calculation_basis]}</td><td className={TD}>{ELIGIBILITY_LABEL[p.eligibility_event]}</td><td className={TD}>{PLAN_TYPE_LABEL[p.plan_type]}</td>
                  <td className={TD}>{cur ? `v${cur.version_number} desde ${dateBR(cur.valid_from)}` : <span className="text-warning">sem versão vigente</span>}{draft ? <span className="ml-2"><Badge tone="warning">rascunho</Badge></span> : null}</td>
                  <td className={TD}>{p.status === 'active' ? <Badge tone="success">Ativo</Badge> : <Badge>Arquivado</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </>
  );
}
