import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { int, type CsvCell } from './csv';
import { addDays, type PtFilters } from './filters';
import { DELIVERABLE_LABELS, DUE_KIND_LABELS, formatDateTime, PRIORITY_LABELS, requestCode, STATUS_LABELS, type DeliverableStatus, type Priority, type RequestStatus } from './format';

export const REPORT_KEYS = ['solicitacoes', 'por-cliente', 'por-responsavel', 'entregas', 'acessos-documentos'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export const REPORT_TITLES: Record<ReportKey, { title: string; description: string }> = {
  solicitacoes: { title: 'Solicitações', description: 'Uma linha por solicitação criada no período, com situação, prazo e tempos.' },
  'por-cliente': { title: 'Resumo por cliente', description: 'Criadas, em aberto, atrasadas e concluídas por empresa.' },
  'por-responsavel': { title: 'Resumo por responsável', description: 'Carga, conclusões, tempo médio e prazo cumprido por pessoa da equipe.' },
  entregas: { title: 'Entregas', description: 'Entregas criadas no período e o recebimento pelo cliente.' },
  'acessos-documentos': { title: 'Acessos a documentos', description: 'Quem enviou, visualizou ou baixou arquivos no período (trilha de auditoria).' },
};
export const isReportKey = (v: string): v is ReportKey => (REPORT_KEYS as readonly string[]).includes(v);

export type Report = { headers: string[]; rows: CsvCell[][] };
const LIMIT = 5000;
const ACTION_LABELS: Record<string, string> = { upload: 'Envio', download: 'Download', view: 'Visualização', visibility_changed: 'Visibilidade alterada', archived: 'Arquivamento' };

/** Início e fim (exclusivo) do período como instantes, no fuso do portal. O dia é o dia LOCAL da prestadora. */
function bounds(f: PtFilters, tz: string) {
  const at = (date: string) => {
    // 00:00 local do dia, convertido a UTC (mesma técnica de zonedIso, sem importar para evitar ciclo)
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const guess = Date.UTC(y, m - 1, d);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(guess));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return new Date(guess - (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - guess)).toISOString();
  };
  return { from: at(f.from), to: at(addDays(f.to, 1)) };
}

export async function buildReport(key: ReportKey, db: SupabaseClient, org: string, f: PtFilters, tz: string, names: Map<string, string>, clients: Map<string, string>, categories: Map<string, string>): Promise<Report> {
  const { from, to } = bounds(f, tz);
  const who = (id: string | null) => (id ? names.get(id) ?? 'Usuário' : '');

  if (key === 'solicitacoes') {
    let q = db.from('requests').select('number, title, client_account_id, category_id, status, priority, assigned_to, created_at, due_at, due_kind, completed_at, closed_at, reopened_count').eq('organization_id', org).gte('created_at', from).lt('created_at', to);
    if (f.client) q = q.eq('client_account_id', f.client);
    if (f.assignee) q = q.eq('assigned_to', f.assignee);
    if (f.category) q = q.eq('category_id', f.category);
    if (f.priority) q = q.eq('priority', f.priority);
    if (f.status) q = q.eq('status', f.status);
    const { data } = await q.order('number', { ascending: false }).limit(LIMIT);
    type R = { number: number; title: string; client_account_id: string; category_id: string | null; status: string; priority: string; assigned_to: string | null; created_at: string; due_at: string | null; due_kind: string | null; completed_at: string | null; closed_at: string | null; reopened_count: number };
    return {
      headers: ['Número', 'Título', 'Empresa', 'Categoria', 'Situação', 'Prioridade', 'Responsável', 'Aberta em', 'Prazo', 'Tipo de prazo', 'Concluída em', 'Horas até concluir', 'No prazo', 'Reaberturas'],
      rows: ((data ?? []) as R[]).map((r): CsvCell[] => {
        const hours = r.completed_at ? Math.round(((Date.parse(r.completed_at) - Date.parse(r.created_at)) / 3_600_000) * 10) / 10 : null;
        const onTime = r.completed_at && r.due_at ? (Date.parse(r.completed_at) <= Date.parse(r.due_at) ? 'Sim' : 'Não') : '';
        return [requestCode(r.number), r.title, clients.get(r.client_account_id) ?? '', r.category_id ? categories.get(r.category_id) ?? '' : '', STATUS_LABELS[r.status as RequestStatus] ?? r.status, PRIORITY_LABELS[r.priority as Priority] ?? r.priority, who(r.assigned_to),
          formatDateTime(r.created_at, tz), formatDateTime(r.due_at, tz).replace('—', ''), r.due_kind ? DUE_KIND_LABELS[r.due_kind as keyof typeof DUE_KIND_LABELS] : '', formatDateTime(r.completed_at, tz).replace('—', ''), hours, onTime, int(r.reopened_count)];
      }),
    };
  }

  if (key === 'por-cliente') {
    const { data } = await db.rpc('pt_by_client', { p_org: org, p_from: f.from, p_to: f.to });
    type R = { name: string; created: number; open_requests: number; overdue: number; completed: number };
    return { headers: ['Empresa', 'Criadas no período', 'Em aberto', 'Atrasadas', 'Concluídas no período'], rows: ((data ?? []) as R[]).map((r) => [r.name, int(Number(r.created)), int(Number(r.open_requests)), int(Number(r.overdue)), int(Number(r.completed))]) };
  }

  if (key === 'por-responsavel') {
    const { data } = await db.rpc('pt_by_assignee', { p_org: org, p_from: f.from, p_to: f.to, p_client: f.client });
    type R = { assignee_id: string | null; open_requests: number; completed: number; avg_resolution_hours: number | null; on_time_pct: number | null };
    return {
      headers: ['Responsável', 'Em aberto', 'Concluídas no período', 'Tempo médio de resolução (h)', 'Concluídas no prazo (%)'],
      rows: ((data ?? []) as R[]).map((r) => [r.assignee_id ? who(r.assignee_id) : 'Sem responsável', int(Number(r.open_requests)), int(Number(r.completed)), r.avg_resolution_hours === null ? null : Number(r.avg_resolution_hours), r.on_time_pct === null ? null : Number(r.on_time_pct)]),
    };
  }

  if (key === 'entregas') {
    let q = db.from('deliverables').select('title, client_account_id, status, created_at, delivered_at, acknowledged_at, acknowledged_by').eq('organization_id', org).gte('created_at', from).lt('created_at', to);
    if (f.client) q = q.eq('client_account_id', f.client);
    const { data } = await q.order('created_at', { ascending: false }).limit(LIMIT);
    type R = { title: string; client_account_id: string; status: string; created_at: string; delivered_at: string | null; acknowledged_at: string | null; acknowledged_by: string | null };
    return {
      headers: ['Entrega', 'Empresa', 'Situação', 'Criada em', 'Publicada em', 'Recebimento confirmado em', 'Confirmado por'],
      rows: ((data ?? []) as R[]).map((r) => [r.title, clients.get(r.client_account_id) ?? '', DELIVERABLE_LABELS[r.status as DeliverableStatus] ?? r.status, formatDateTime(r.created_at, tz), formatDateTime(r.delivered_at, tz).replace('—', ''), formatDateTime(r.acknowledged_at, tz).replace('—', ''), who(r.acknowledged_by)]),
    };
  }

  // acessos-documentos
  let q = db.from('document_access_logs').select('client_account_id, document_id, user_id, action, occurred_at, documents(title)').eq('organization_id', org).gte('occurred_at', from).lt('occurred_at', to);
  if (f.client) q = q.eq('client_account_id', f.client);
  const { data } = await q.order('occurred_at', { ascending: false }).limit(LIMIT);
  type R = { client_account_id: string; user_id: string | null; action: string; occurred_at: string; documents: { title: string } | { title: string }[] | null };
  return {
    headers: ['Quando', 'Empresa', 'Documento', 'Quem', 'Ação'],
    rows: ((data ?? []) as unknown as R[]).map((r) => {
      const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
      return [formatDateTime(r.occurred_at, tz), clients.get(r.client_account_id) ?? '', doc?.title ?? '', who(r.user_id), ACTION_LABELS[r.action] ?? r.action];
    }),
  };
}
