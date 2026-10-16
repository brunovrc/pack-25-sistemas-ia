import { resolveContext } from '@/lib/auth/session';
import { isUuid } from '@/lib/commissions/query';
import { loadAccess } from '@/lib/commissions/page';
import { loadStatement, statementCsv } from '@/lib/commissions/statement';
import { rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

/**
 * Download autorizado do demonstrativo: a leitura passa pelo RLS (fechamento) e pela política do Storage (vendedor).
 * Identificador adulterado ⇒ 404 sem dizer se existe. ?fmt=csv devolve o CSV; padrão = PDF mais recente.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const r = await resolveContext();
  if (r.kind !== 'ok') return new Response('Não autorizado', { status: 401, headers: noStore });
  if (!isUuid(id)) return new Response('Não encontrado', { status: 404, headers: noStore });
  const { ctx } = r;
  const org = ctx.membership.organization_id;
  const access = await loadAccess(org);
  if (!access.profile || access.profile === 'viewer') return new Response('Sem permissão', { status: 403, headers: noStore });
  const rl = rateLimit(`stmt:${ctx.user.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return new Response('Muitas requisições.', { status: 429, headers: noStore });
  const fmt = new URL(req.url).searchParams.get('fmt');

  if (fmt === 'csv') {
    const s = await loadStatement(ctx, org, id);
    if (!s) return new Response('Não encontrado', { status: 404, headers: noStore });
    await ctx.supabase.rpc('cm_log_export', { p_org: org, p_kind: 'demonstrativo:csv', p_rows: s.lines.length });
    return new Response(statementCsv(s), { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="demonstrativo-${id.slice(0, 8)}.csv"` } });
  }
  const { data } = await ctx.supabase.from('commission_statements').select('document_path').eq('closing_id', id).order('version_number', { ascending: false }).limit(1).maybeSingle();
  const path = (data as { document_path?: string } | null)?.document_path;
  if (!path) return new Response('Não encontrado', { status: 404, headers: noStore });
  const dl = await ctx.supabase.storage.from('statements').download(path);
  if (dl.error || !dl.data) return new Response('Não encontrado', { status: 404, headers: noStore });
  return new Response(await dl.data.arrayBuffer(), { headers: { ...noStore, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="demonstrativo-${id.slice(0, 8)}.pdf"` } });
}
