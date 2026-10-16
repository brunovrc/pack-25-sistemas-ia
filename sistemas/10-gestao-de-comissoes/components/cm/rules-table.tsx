import { Badge } from '@/components/ui/primitives';
import { describeTierMode, describeValue, ruleTypeLabel, scopeLabel, type RuleView, type TierView } from '@/lib/commissions/describe';
import { dateBR } from '@/lib/commissions/format';
import { STACK_LABEL } from '@/lib/commissions/labels';
import { TableShell, TD, TH } from './bits';

/** Leitura das regras de uma versão: o que cada uma faz, onde se aplica e como desempata. */
export function RulesTable({ rules, tiers, basis, names }: { rules: RuleView[]; tiers: TierView[]; basis?: string; names: Map<string, string> }) {
  return (
    <TableShell caption="Regras da versão do plano" empty={rules.length === 0} emptyText="Nenhuma regra nesta versão.">
      <thead><tr><th className={TH}>Regra</th><th className={TH}>Tipo</th><th className={TH}>Como calcula</th><th className={TH}>Aplica-se a</th><th className={TH}>Prioridade</th><th className={TH}>Vigência</th></tr></thead>
      <tbody className="divide-y divide-border">
        {rules.map((r) => (
          <tr key={r.id} className={r.enabled ? undefined : 'opacity-60'}>
            <td className={TD}><span className="font-medium">{r.name}</span>{!r.enabled ? <span className="ml-2"><Badge>inativa</Badge></span> : null}</td>
            <td className={TD}>{ruleTypeLabel(r.rule_type)}</td>
            <td className={TD}>{describeValue(r, tiers, basis)}{r.rule_type === 'tiered' ? <span className="block text-xs text-muted">{describeTierMode(r)}</span> : null}</td>
            <td className={TD}>{scopeLabel(r.scope_type)}{r.scope_reference ? `: ${names.get(r.scope_reference) ?? r.scope_reference}` : ''}{r.conditions_json ? <span className="block text-xs text-muted">com condições</span> : null}</td>
            <td className={TD}>{r.priority} · {STACK_LABEL[r.stack_behavior]?.split(' ')[0]}</td>
            <td className={TD}>{r.valid_from || r.valid_until ? `${dateBR(r.valid_from)} a ${r.valid_until ? dateBR(r.valid_until) : 'sem fim'}` : 'sempre'}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
