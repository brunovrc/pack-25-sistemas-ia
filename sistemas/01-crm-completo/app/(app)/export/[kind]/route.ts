import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveContext } from '@/lib/auth/session';
import { int, toCsv } from '@/lib/crm/csv';
import { labelMap, loadDashboard, loadOptions, lostReasonsReport, nameMap, searchToken, type Lead, type Opportunity } from '@/lib/crm/data';
import { parseFilters, todaySaoPaulo } from '@/lib/crm/filters';
import { LEAD_STATUS_LABELS, TEMPERATURE_LABELS } from '@/lib/crm/validation';

// Exportações em CSV (UTF-8 com BOM, separador ";" e vírgula decimal, padrão do Excel em português).
// Respeitam o papel do usuário: o RLS do banco limita as linhas; vendedor exporta só o que enxerga.
const MAX_ROWS = 10_000;
const BR = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const OPP_STATUS = { open: 'Aberta', won: 'Ganha', lost: 'Perdida' } as const;

function csvResponse(name: string, body: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${todaySaoPaulo()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const auth = await resolveContext();
  if (auth.kind !== 'ok') return new NextResponse('Não autorizado.', { status: 401 });
  const ctx = auth.ctx;
  const org = ctx.membership.organization_id;
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());

  if (kind === 'lead-template') {
    return csvResponse('modelo-leads', toCsv(['nome', 'empresa', 'email', 'telefone', 'cargo', 'origem', 'temperatura', 'status', 'observacoes'], [['Maria Souza', 'Alfa Ltda', 'maria@alfa.com.br', '(11) 99999-0000', 'Diretora', 'Site', 'quente', 'novo', 'Pediu proposta']]));
  }

  const options = await loadOptions(ctx);
  const owners = labelMap(options.people);

  if (kind === 'leads') {
    const status = Object.keys(LEAD_STATUS_LABELS).includes(sp.status ?? '') ? sp.status : '';
    const q = searchToken(sp.q);
    let query = ctx.supabase.from('crm_leads').select('*').eq('organization_id', org);
    query = sp.view === 'archived' ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
    if (status) query = query.eq('status', status);
    if (z.uuid().safeParse(sp.source).success) query = query.eq('source_id', sp.source as string);
    if (z.uuid().safeParse(sp.owner).success) query = query.eq('owner_id', sp.owner as string);
    if (q) query = query.or(`name.ilike.*${q}*,email.ilike.*${q}*,company_name.ilike.*${q}*`);
    const { data } = await query.order('created_at', { ascending: false }).limit(MAX_ROWS);
    const sources = nameMap(options.sources);
    const rows = ((data ?? []) as Lead[]).map((l) => [
      l.name, l.company_name, l.email, l.phone, l.job_title, l.source_id ? sources.get(l.source_id) : '', LEAD_STATUS_LABELS[l.status] ?? l.status,
      TEMPERATURE_LABELS[l.temperature] ?? l.temperature, l.owner_id ? owners.get(l.owner_id) : '', BR(l.created_at), l.notes,
    ]);
    return csvResponse('leads', toCsv(['Nome', 'Empresa', 'E-mail', 'Telefone', 'Cargo', 'Origem', 'Status', 'Classificação', 'Responsável', 'Criado em', 'Observações'], rows));
  }

  if (kind === 'opportunities') {
    const { data } = await ctx.supabase.from('crm_opportunities').select('*').eq('organization_id', org).order('created_at', { ascending: false }).limit(MAX_ROWS);
    const stages = nameMap(options.stages);
    const reasons = nameMap(options.reasons);
    const { data: companies } = await ctx.supabase.from('crm_companies').select('id, name').eq('organization_id', org).limit(MAX_ROWS);
    const companyNames = nameMap((companies ?? []) as Array<{ id: string; name: string }>);
    const rows = ((data ?? []) as Opportunity[]).map((o) => [
      o.title, o.company_id ? companyNames.get(o.company_id) : '', Number(o.value), stages.get(o.stage_id), OPP_STATUS[o.status], o.probability === null ? '' : `${o.probability}%`,
      o.expected_close_date ?? '', o.owner_id ? owners.get(o.owner_id) : '', BR(o.closed_at), o.loss_reason_id ? reasons.get(o.loss_reason_id) : '', BR(o.created_at),
    ]);
    return csvResponse('oportunidades', toCsv(['Oportunidade', 'Empresa', 'Valor (R$)', 'Etapa', 'Status', 'Probabilidade', 'Previsão de fechamento', 'Responsável', 'Fechada em', 'Motivo da perda', 'Criada em'], rows));
  }

  const filters = parseFilters(sp);
  if (kind === 'sales-by-rep') {
    const d = await loadDashboard(ctx, filters);
    return csvResponse('vendas-por-vendedor', toCsv(['Vendedor', 'Negócios ganhos', 'Valor ganho (R$)', 'Negócios perdidos', 'Taxa de conversão (%)', 'Metas atingidas'], d.reps.map((r) => [owners.get(r.user_id) ?? 'Usuário', int(r.won_count), r.won_value, int(r.lost_count), r.conversion_rate, int(r.goals_met)])));
  }
  if (kind === 'funnel') {
    const d = await loadDashboard(ctx, filters);
    return csvResponse('funil', toCsv(['Etapa', 'Oportunidades abertas', 'Valor (R$)'], d.funnel.map((f) => [f.stage_name, int(f.opp_count), f.opp_value])));
  }
  if (kind === 'lead-sources') {
    const d = await loadDashboard(ctx, filters);
    return csvResponse('leads-por-origem', toCsv(['Origem', 'Leads criados no período'], d.sources.map((s) => [s.source_name, int(s.lead_count)])));
  }
  if (kind === 'lost-reasons') {
    const rows = await lostReasonsReport(ctx, filters, options.reasons);
    return csvResponse('perdas-por-motivo', toCsv(['Motivo', 'Negócios perdidos', 'Valor perdido (R$)'], rows.map((r) => [r.reason, int(r.count), r.value])));
  }
  return new NextResponse('Exportação inexistente.', { status: 404 });
}
