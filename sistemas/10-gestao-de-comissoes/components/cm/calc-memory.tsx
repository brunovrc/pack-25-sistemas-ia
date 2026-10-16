import { brl, pctBR, rateBR } from '@/lib/commissions/format';
import { BASIS_LABEL, ELIGIBILITY_LABEL } from '@/lib/commissions/labels';
import { TableShell, TD, TDR, TH, THR } from './bits';

type Snap = {
  engine?: string; plan?: { name?: string; version?: number }; rule?: { name?: string; kind?: string; mode?: string; period?: string; scope?: string };
  resolution?: Array<{ ruleId: string; rank: number; role: string }>; basis?: Record<string, unknown> & { type?: string }; rate?: string | null;
  potentialCents?: number; eligibleCents?: number;
  eligibility?: { mode?: string; ratio?: string; receivedCents?: string; dueNetCents?: string };
  tier?: { group?: string; cumulativeBeforeCents?: string; cumulativeAfterCents?: string; roundedCumulativeCents?: number; rows?: Array<{ order: number; rate: string; amountCents: string; commission: string }> };
  split?: { model?: string; shares?: Array<{ sellerId: string; pct?: string; potentialCents?: number; eligibleCents?: number }> };
  returns?: { policy?: string; count?: number; cancelled?: boolean }; rounding?: string;
  goal?: { name?: string; type?: string; target?: string }; progress?: { value?: string; attainment?: string }; awarded?: boolean;
};

const num = (v: unknown): string => (v === undefined || v === null ? '—' : brl(Math.round(Number(v))));

/** Memória de cálculo legível: de onde veio cada centavo do lançamento. */
export function CalcMemory({ snapshot, sellers }: { snapshot: unknown; sellers: Map<string, string> }) {
  const s = (snapshot ?? {}) as Snap;
  if (s.goal) {
    return (
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Meta: <strong>{s.goal.name}</strong>.</li>
        <li>Realizado: {num(s.progress?.value)} · atingimento {s.progress?.attainment ? pctBR(Number(s.progress.attainment) * 100, 2) : '—'}.</li>
        <li>Bônus {s.awarded ? 'devido e lançado' : 'ainda não devido'}.</li>
      </ol>
    );
  }
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Plano: <strong>{s.plan?.name}</strong>, versão {s.plan?.version} (fixada na venda{s.engine ? `; motor ${s.engine}` : ''}).</li>
        <li>Regra aplicada: <strong>{s.rule?.name}</strong>{s.rule?.kind === 'tiered' ? ` — faixas ${s.rule.mode === 'marginal' ? 'progressivas marginais' : 'por faixa atingida'}, ${s.rule.period === 'month' ? 'mensais' : s.rule.period === 'quarter' ? 'trimestrais' : 'anuais'}` : ''}.</li>
        <li>Base ({BASIS_LABEL[s.basis?.type ?? ''] ?? '—'}): {s.basis?.baseCents !== undefined ? num(s.basis.baseCents) : s.basis?.fixedAmountCents !== undefined ? `valor fixo ${num(s.basis.fixedAmountCents)}` : '—'}.</li>
        {s.rate ? <li>Taxa: {rateBR(s.rate)}.</li> : null}
        <li>Comissão calculada (antes da elegibilidade): <strong>{num(s.potentialCents)}</strong>.</li>
        <li>Elegibilidade: {ELIGIBILITY_LABEL[s.eligibility?.mode ?? ''] ?? '—'} — liberado {s.eligibility?.ratio ? pctBR(Number(s.eligibility.ratio) * 100, 2) : '—'}{s.eligibility?.receivedCents ? ` (recebido ${num(s.eligibility.receivedCents)} de ${num(s.eligibility.dueNetCents)} devidos)` : ''}. Elegível: <strong>{num(s.eligibleCents)}</strong>.</li>
        {s.returns?.count ? <li>Devoluções consideradas: {s.returns.count}{s.returns.cancelled ? ' (venda cancelada/devolvida por inteiro)' : ''}; política: {s.returns.policy === 'manual' ? 'estorno manual' : 'estorno proporcional'}.</li> : null}
        <li>Arredondamento: {s.rounding ?? 'meio para cima, em centavos'}.</li>
      </ol>
      {s.tier ? (
        <div>
          <p className="mb-1 font-medium">Faixas no acumulado do período</p>
          <p className="mb-2 text-xs text-muted">Acumulado antes: {num(s.tier.cumulativeBeforeCents)} · depois: {num(s.tier.cumulativeAfterCents)}. O lançamento é a diferença entre os acumulados arredondados ({num(s.tier.roundedCumulativeCents)} no total).</p>
          <TableShell caption="Faixas aplicadas" empty={!s.tier.rows?.length}>
            <thead><tr><th className={TH}>Faixa</th><th className={THR}>Base na faixa</th><th className={THR}>Taxa</th><th className={THR}>Comissão exata</th></tr></thead>
            <tbody className="divide-y divide-border">{s.tier.rows?.map((r) => <tr key={r.order}><td className={TD}>{r.order}</td><td className={TDR}>{num(r.amountCents)}</td><td className={TDR}>{rateBR(r.rate)}</td><td className={TDR}>{(Number(r.commission) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 })}</td></tr>)}</tbody>
          </TableShell>
        </div>
      ) : null}
      {s.split?.shares && s.split.shares.length > 1 ? (
        <div>
          <p className="mb-1 font-medium">Rateio ({s.split.model === 'pool' ? 'pool único' : 'independentes'})</p>
          <TableShell caption="Rateio entre participantes">
            <thead><tr><th className={TH}>Vendedor</th><th className={THR}>Participação</th><th className={THR}>Calculada</th><th className={THR}>Elegível</th></tr></thead>
            <tbody className="divide-y divide-border">{s.split.shares.map((x) => <tr key={x.sellerId}><td className={TD}>{sellers.get(x.sellerId) ?? '—'}</td><td className={TDR}>{x.pct ? pctBR(x.pct, 2) : '—'}</td><td className={TDR}>{num(x.potentialCents)}</td><td className={TDR}>{num(x.eligibleCents)}</td></tr>)}</tbody>
          </TableShell>
          <p className="mt-1 text-xs text-muted">Centavos residuais vão a quem tem o maior resto fracionário; empate: participante principal, depois menor identificador. A soma é sempre exata.</p>
        </div>
      ) : null}
    </div>
  );
}
