import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Section } from '@/components/cm/bits';
import { RulesTable } from '@/components/cm/rules-table';
import { loadOptions } from '@/lib/commissions/data';
import type { RuleView, TierView } from '@/lib/commissions/describe';
import { BASIS_LABEL } from '@/lib/commissions/labels';
import { dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Regras vigentes' };

const COLS = 'id, plan_version_id, name, rule_type, scope_type, scope_reference, conditions_json, rate_decimal, fixed_amount_cents, tier_mode, tier_period, tier_scope, priority, stack_behavior, entry_kind, enabled, valid_from, valid_until';

export default async function RulesPage() {
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx } = pc;
  const { data: plans } = await ctx.supabase.from('commission_plans').select('id, name, calculation_basis').eq('status', 'active').order('name');
  const list = (plans ?? []) as Array<{ id: string; name: string; calculation_basis: string }>;
  const { data: vdata } = list.length ? await ctx.supabase.from('commission_plan_versions').select('id, plan_id, version_number, valid_from, valid_until').eq('status', 'published').in('plan_id', list.map((p) => p.id)).lte('valid_from', pc.today) : { data: [] };
  const current = ((vdata ?? []) as Array<{ id: string; plan_id: string; version_number: number; valid_from: string; valid_until: string | null }>).filter((v) => !v.valid_until || v.valid_until >= pc.today);
  const vids = current.map((v) => v.id);
  const { data: rdata } = vids.length ? await ctx.supabase.from('commission_rules').select(COLS).in('plan_version_id', vids).order('name') : { data: [] };
  const { data: tdata } = vids.length ? await ctx.supabase.from('commission_tiers').select('rule_id, tier_order, threshold_from_cents, threshold_to_cents, rate_decimal').in('plan_version_id', vids) : { data: [] };
  const rules = (rdata ?? []) as Array<RuleView & { plan_version_id: string }>;
  const tiers = (tdata ?? []) as TierView[];
  const opts = await loadOptions(ctx);
  const names = new Map<string, string>([...opts.sellers, ...opts.teams, ...opts.products, ...opts.categories].map((o) => [o.value, o.label]));

  return (
    <>
      <PageHeader title="Regras vigentes" description="Visão consolidada das regras das versões de plano em vigor hoje. Para alterar, edite o plano (nova versão com vigência futura)." />
      {current.length === 0 ? <EmptyState title="Nenhuma versão de plano em vigor" description="Publique uma versão em Planos." /> : list.map((p) => {
        const v = current.find((x) => x.plan_id === p.id);
        if (!v) return null;
        return (
          <Section key={p.id} title={`${p.name} · v${v.version_number}`} description={`${BASIS_LABEL[p.calculation_basis]} · vigente desde ${dateBR(v.valid_from)}`} actions={<Link className="text-sm underline underline-offset-2" href={`/planos/${p.id}`}>Abrir plano</Link>}>
            <RulesTable rules={rules.filter((r) => r.plan_version_id === v.id)} tiers={tiers} basis={p.calculation_basis} names={names} />
          </Section>
        );
      })}
    </>
  );
}
