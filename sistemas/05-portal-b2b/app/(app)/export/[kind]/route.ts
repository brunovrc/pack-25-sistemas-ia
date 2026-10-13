import { NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/portal/access';
import { toCsv } from '@/lib/portal/csv';
import { labelMap, loadCategories, loadClientOptions, loadPeople, loadSettings } from '@/lib/portal/data';
import { parseFilters, todayIn } from '@/lib/portal/filters';
import { buildReport, isReportKey } from '@/lib/portal/reports';
import { logEvent } from '@/lib/log';

export const runtime = 'nodejs';

/** Exportações em CSV (UTF-8 com BOM, `;`, fórmulas neutralizadas). Só gestão baixa; o RLS limita ao que o usuário enxerga. Cada download vai para a auditoria. */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await resolveContext(MANAGER_ROLES);
  if (auth.kind === 'redirect') return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  if (auth.kind === 'forbidden') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  const { ctx } = auth;
  const org = ctx.membership.organization_id;
  const { kind } = await params;
  if (!isReportKey(kind)) return NextResponse.json({ error: 'Relatório inexistente.' }, { status: 404 });

  const settings = await loadSettings(ctx, org);
  const f = parseFilters(Object.fromEntries(new URL(request.url).searchParams.entries()), todayIn(settings.timezone));
  const [people, clients, categories] = await Promise.all([loadPeople(ctx, org), loadClientOptions(ctx, org, true), loadCategories(ctx, org, false)]);
  const report = await buildReport(kind, ctx.supabase, org, f, settings.timezone, labelMap(people), new Map(clients.map((c) => [c.id, c.name])), new Map(categories.map((c) => [c.id, c.name])));

  const { error } = await ctx.supabase.rpc('pt_log_export', { p_org: org, p_kind: kind, p_rows: report.rows.length });
  if (error) {
    logEvent('warn', 'pt_export_denied', { kind });
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }); // sem trilha de auditoria, sem arquivo
  }
  return new NextResponse(toCsv(report.headers, report.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${f.from}_${f.to}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
