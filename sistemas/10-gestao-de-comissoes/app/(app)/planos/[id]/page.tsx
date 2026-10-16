import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Section, TableShell, TD, TH } from '@/components/cm/bits';
import { CheckVersionButton, NewVersionButton, PlanEditor, PlanMetaForm, PublishForm, type RuleSeed } from '@/components/cm/forms-plans';
import { DefinitionList } from '@/components/cm/page-bits';
import { RulesTable } from '@/components/cm/rules-table';
import { loadOptions } from '@/lib/commissions/data';
import type { RuleView, TierView } from '@/lib/commissions/describe';
import { dateBR } from '@/lib/commissions/format';
import { BASIS_HELP, BASIS_LABEL, ELIGIBILITY_HELP, ELIGIBILITY_LABEL, PLAN_TYPE_LABEL, RETURNS_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';
import { isUuid } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Plano de comissão' };

type VersionRow = { id: string; version_number: number; status: 'draft' | 'published'; valid_from: string | null; valid_until: string | null; published_at: string | null; precedence_json: string[][] | null };
const RULE_COLS = 'id, plan_version_id, name, rule_type, scope_type, scope_reference, conditions_json, rate_decimal, fixed_amount_cents, tier_mode, tier_period, tier_scope, priority, stack_behavior, entry_kind, enabled, valid_from, valid_until';

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pc = await pageCtx(['admin', 'finance', 'manager', 'seller']);
  const { ctx } = pc;
  const { data: p } = await ctx.supabase.from('commission_plans').select('id, name, description, calculation_basis, eligibility_event, plan_type, returns_policy, status').eq('id', id).maybeSingle();
  if (!p) notFound();
  const plan = p as { id: string; name: string; description: string | null; calculation_basis: string; eligibility_event: string; plan_type: string; returns_policy: string; status: string };
  const { data: vdata } = await ctx.supabase.from('commission_plan_versions').select('id, version_number, status, valid_from, valid_until, published_at, precedence_json').eq('plan_id', id).order('version_number', { ascending: false });
  const versions = (vdata ?? []) as VersionRow[];
  const vids = versions.map((v) => v.id);
  const { data: rdata } = vids.length ? await ctx.supabase.from('commission_rules').select(RULE_COLS).in('plan_version_id', vids).order('name') : { data: [] };
  const rules = (rdata ?? []) as Array<RuleView & { plan_version_id: string }>;
  const { data: tdata } = vids.length ? await ctx.supabase.from('commission_tiers').select('rule_id, tier_order, threshold_from_cents, threshold_to_cents, rate_decimal').in('plan_version_id', vids) : { data: [] };
  const tiers = (tdata ?? []) as TierView[];
  const draft = versions.find((v) => v.status === 'draft');
  const opts = pc.perms.managePlans ? await loadOptions(ctx) : null;
  const names = new Map<string, string>();
  if (opts) for (const o of [...opts.sellers, ...opts.teams, ...opts.products, ...opts.categories]) names.set(o.value, o.label);

  const seeds: RuleSeed[] = draft ? rules.filter((r) => r.plan_version_id === draft.id).map((r) => ({
    name: r.name, rule_type: r.rule_type as RuleSeed['rule_type'], scope_type: r.scope_type, scope_reference: r.scope_reference, conditions_json: r.conditions_json, rate_decimal: r.rate_decimal === null ? null : Number(r.rate_decimal),
    fixed_amount_cents: r.fixed_amount_cents, tier_mode: r.tier_mode as RuleSeed['tier_mode'], tier_period: r.tier_period as RuleSeed['tier_period'], tier_scope: r.tier_scope as RuleSeed['tier_scope'],
    bands: tiers.filter((t) => t.rule_id === r.id).map((t) => ({ order: t.tier_order, from: t.threshold_from_cents, to: t.threshold_to_cents, rate: Number(t.rate_decimal) })),
    priority: r.priority, stack_behavior: r.stack_behavior as RuleSeed['stack_behavior'], entry_kind: r.entry_kind as RuleSeed['entry_kind'], enabled: r.enabled, valid_from: r.valid_from, valid_until: r.valid_until,
  })) : [];

  const latestPublished = versions.find((v) => v.status === 'published');
  const suggestFrom = latestPublished?.valid_from && latestPublished.valid_from >= pc.today ? latestPublished.valid_from : pc.today;

  return (
    <>
      <PageHeader title={plan.name} description={plan.description ?? undefined}>
        <Link href="/planos" className="text-sm underline underline-offset-2">← Todos os planos</Link>
      </PageHeader>
      <Card>
        <DefinitionList items={[
          ['Base de comissionamento', <span key="b">{BASIS_LABEL[plan.calculation_basis]}<span className="block text-xs text-muted">{BASIS_HELP[plan.calculation_basis]}</span></span>],
          ['Elegibilidade', <span key="e">{ELIGIBILITY_LABEL[plan.eligibility_event]}<span className="block text-xs text-muted">{ELIGIBILITY_HELP[plan.eligibility_event]}</span></span>],
          ['Devoluções', RETURNS_LABEL[plan.returns_policy]], ['Tipo', PLAN_TYPE_LABEL[plan.plan_type]], ['Situação', plan.status === 'active' ? <Badge tone="success" key="s">Ativo</Badge> : <Badge key="s">Arquivado</Badge>],
        ]} />
        <p className="mt-3 text-xs text-muted">Base, elegibilidade e política de devolução não mudam depois da primeira publicação: para outra base, crie outro plano.</p>
      </Card>

      {pc.perms.managePlans ? <div className="mt-4"><Disclosure summary="Editar nome, descrição e situação"><PlanMetaForm plan={plan} /></Disclosure></div> : null}

      <Section title="Versões">
        <TableShell caption="Versões do plano" empty={versions.length === 0}>
          <thead><tr><th className={TH}>Versão</th><th className={TH}>Situação</th><th className={TH}>Vigência</th><th className={TH}>Publicada em</th><th className={TH}>Regras</th></tr></thead>
          <tbody className="divide-y divide-border">
            {versions.map((v) => (
              <tr key={v.id}>
                <td className={TD}>v{v.version_number}</td>
                <td className={TD}>{v.status === 'draft' ? <Badge tone="warning">Rascunho</Badge> : <Badge tone="success">Publicada (imutável)</Badge>}</td>
                <td className={TD}>{v.valid_from ? `${dateBR(v.valid_from)} a ${v.valid_until ? dateBR(v.valid_until) : 'sem fim'}` : '—'}</td>
                <td className={TD}>{dateBR(v.published_at)}</td><td className={TD}>{rules.filter((r) => r.plan_version_id === v.id).length}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Section>

      {versions.filter((v) => v.status === 'published').map((v) => (
        <Section key={v.id} title={`Regras da v${v.version_number}`} description="Somente leitura: esta versão foi publicada e preserva o cálculo de tudo o que foi apurado com ela.">
          <RulesTable rules={rules.filter((r) => r.plan_version_id === v.id)} tiers={tiers} basis={plan.calculation_basis} names={names} />
        </Section>
      ))}

      {pc.perms.managePlans ? (
        <Section title="Rascunho" description={draft ? `Versão v${draft.version_number} em edição.` : 'Não há rascunho aberto.'}>
          {plan.status !== 'active' ? <Alert tone="warning">Plano arquivado: reative-o para editar.</Alert> : draft && opts ? (
            <div className="space-y-5">
              <PlanEditor versionId={draft.id} basis={plan.calculation_basis} seeds={seeds} precedence={draft.precedence_json} options={{ sellers: opts.sellers, teams: opts.teams, products: opts.products, categories: opts.categories }} />
              <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
                <CheckVersionButton versionId={draft.id} />
                <PublishForm versionId={draft.id} defaultFrom={suggestFrom} />
              </div>
            </div>
          ) : (
            <NewVersionButton planId={plan.id} />
          )}
        </Section>
      ) : null}
    </>
  );
}
