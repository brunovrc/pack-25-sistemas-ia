import { resolveContext } from '@/lib/auth/session';
import { toCsv, type Col } from '@/lib/commissions/csv';
import { loadAccess } from '@/lib/commissions/page';
import { simulate } from '@/lib/commissions/simulate';
import { rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

/** CSV de uma simulação (cenário A). O resultado é sempre calculado de novo pelo motor, com o RLS do usuário. */
export async function GET(req: Request): Promise<Response> {
  const r = await resolveContext();
  if (r.kind !== 'ok') return new Response('Não autorizado', { status: 401, headers: noStore });
  const org = r.ctx.membership.organization_id;
  const access = await loadAccess(org);
  if (!access.profile || !['admin', 'finance', 'manager'].includes(access.profile)) return new Response('Sem permissão', { status: 403, headers: noStore });
  if (!rateLimit(`sim:${r.ctx.user.id}`, { limit: 30, windowMs: 60_000 }).allowed) return new Response('Muitas requisições.', { status: 429, headers: noStore });
  const q = new URL(req.url).searchParams;
  const g = (k: string) => q.get(k) ?? '';
  const res = await simulate(r.ctx, { sellerId: g('seller'), date: g('date'), amount: g('amount'), discount: g('discount'), productId: g('product'), channel: g('channel'), secondSellerId: g('seller2'), secondPct: g('pct2'), received: g('received'), accumulated: g('accum'), returned: g('returned') });
  if (!res.ok) return new Response(res.error, { status: 422, headers: noStore });
  const cols: Col[] = [{ key: 'tipo', label: 'Tipo', kind: 'text' }, { key: 'regra', label: 'Regra', kind: 'text' }, { key: 'base', label: 'Base', kind: 'money' }, { key: 'calc', label: 'Comissão calculada', kind: 'money' }, { key: 'eleg', label: 'Elegível agora', kind: 'money' }];
  const rows = res.rows.map((x) => ({ tipo: 'SIMULAÇÃO', regra: x.ruleName, base: x.baseCents, calc: x.potentialCents, eleg: x.eligibleCents }));
  await r.ctx.supabase.rpc('cm_log_export', { p_org: org, p_kind: 'simulacao:csv', p_rows: rows.length });
  return new Response(toCsv(cols, rows), { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="simulacao.csv"' } });
}
