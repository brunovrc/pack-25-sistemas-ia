import { resolveContext } from '@/lib/auth/session';
import { toCsv } from '@/lib/commissions/csv';
import { dateBR } from '@/lib/commissions/format';
import { finish, heading, para, startDoc, table } from '@/lib/commissions/pdf';
import { loadAccess } from '@/lib/commissions/page';
import { civilDateIn } from '@/lib/commissions/query';
import { prepareReport } from '@/lib/commissions/report-run';
import { rateLimit } from '@/lib/security/rate-limit';
import { nowMs } from '@/lib/time';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '').slice(0, 50);

/** Exportação de relatório (CSV/PDF). Mesmo escopo do RLS da tela; falha fechada sem sessão ou sem perfil. */
export async function GET(req: Request): Promise<Response> {
  const r = await resolveContext();
  if (r.kind !== 'ok') return new Response('Não autorizado', { status: 401, headers: noStore });
  const { ctx } = r;
  const org = ctx.membership.organization_id;
  const access = await loadAccess(org);
  if (!access.profile) return new Response('Sem permissão', { status: 403, headers: noStore });
  const rl = rateLimit(`export:${ctx.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return new Response('Muitas exportações em pouco tempo.', { status: 429, headers: { ...noStore, 'Retry-After': String(rl.retryAfterSeconds) } });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const { data: s } = await ctx.supabase.from('commission_settings').select('timezone').eq('organization_id', org).maybeSingle();
  const today = civilDateIn(new Date(nowMs()), (s as { timezone?: string } | null)?.timezone ?? 'America/Sao_Paulo');
  if (access.profile === 'seller') delete sp.seller;
  const prep = await prepareReport(ctx, org, access.profile, access.managedTeamIds, today, sp);
  if (!prep) return new Response('Relatório inexistente', { status: 404, headers: noStore });
  await ctx.supabase.rpc('cm_log_export', { p_org: org, p_kind: `${prep.def.key}:${sp.fmt === 'pdf' ? 'pdf' : 'csv'}`, p_rows: prep.result.rows.length });
  const file = `${slug(prep.def.title)}-${prep.period.from}-a-${prep.period.to}`;

  if (sp.fmt === 'pdf') {
    const doc = await startDoc(`${ctx.membership.name} · ${prep.def.title}`, 'Relatório gerencial de comissões — não substitui folha de pagamento');
    heading(doc, prep.def.title);
    para(doc, `${prep.def.description} Período ${dateBR(prep.period.from)} a ${dateBR(prep.period.to)}. Emitido em ${dateBR(today)}.`);
    table(doc, prep.result.cols, prep.result.rows.slice(0, 5000), { totals: prep.result.totals });
    const bytes = await finish(doc);
    return new Response(Buffer.from(bytes), { headers: { ...noStore, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}.pdf"` } });
  }
  return new Response(toCsv(prep.result.cols, prep.result.totals ? [...prep.result.rows, prep.result.totals] : prep.result.rows), { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}.csv"` } });
}
