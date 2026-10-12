// Preparação (pura e testável) dos dados dos gráficos e cartões do dashboard.
import type { GoalProgress, SalesPoint } from './data';
import { pctOf, sumMoney } from './money';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Mesma regra do banco: períodos de até 90 dias agrupam por semana; maiores, por mês. */
export function bucketUnit(from: string, to: string): 'week' | 'month' {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return days <= 90 ? 'week' : 'month';
}

/** 'YYYY-MM-DD' (início do bucket) -> "31/08" (semana) ou "set/26" (mês). */
export function bucketLabel(bucket: string, unit: 'week' | 'month'): string {
  const [y, m, d] = bucket.split('-');
  if (!y || !m || !d) return bucket;
  return unit === 'week' ? `${d}/${m}` : `${MONTHS[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

export type SeriesRow = { label: string; won_value: number; won_count: number; lost_count: number };

export function seriesRows(series: SalesPoint[], from: string, to: string): SeriesRow[] {
  const unit = bucketUnit(from, to);
  return series.map((p) => ({ label: bucketLabel(p.bucket, unit), won_value: p.won_value, won_count: p.won_count, lost_count: p.lost_count }));
}

export type GoalSummary = { count: number; target: number; realized: number; pct: number | null; met: number; scopeLabel: string };

/**
 * Meta consolidada do cartão do dashboard: soma das metas INDIVIDUAIS do período
 * (ou, se não houver, das de equipe). `pct = Σ realizado / Σ meta × 100`; `null` sem metas.
 */
export function summarizeGoals(goals: GoalProgress[]): GoalSummary {
  const users = goals.filter((g) => g.scope === 'user');
  const base = users.length > 0 ? users : goals.filter((g) => g.scope === 'team');
  const target = sumMoney(base.map((g) => g.target_amount));
  const realized = sumMoney(base.map((g) => g.realized));
  return {
    count: base.length,
    target,
    realized,
    pct: pctOf(realized, target),
    met: base.filter((g) => g.realized >= g.target_amount).length,
    scopeLabel: users.length > 0 ? 'individuais' : 'de equipe',
  };
}

export function goalLabel(g: GoalProgress, labels: Map<string, string>): string {
  const who = g.scope === 'team' ? g.team_name ?? 'Equipe' : g.user_id ? labels.get(g.user_id) ?? 'Usuário' : 'Meta';
  return who;
}
