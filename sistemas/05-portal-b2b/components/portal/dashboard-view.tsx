import Link from 'next/link';
import { Alert, Badge, Card } from '@/components/ui/primitives';
import {
  AssigneeChartClient, ClientChartClient, DeliveryChartClient, FlowChartClient, HoursChartClient, PriorityChartClient, SlaChartClient, StatusChartClient,
} from '@/components/portal/charts-loader';
import { ALERT_LINKS, ALERT_TITLES, assigneeRows, clientRows, deliveryRows, flowRows, hoursRows, priorityRows, slaRows, statusRows } from '@/lib/portal/chart-rows';
import type { DashboardData } from '@/lib/portal/dashboard-types';
import { CLIENT_STATUS_LABELS, formatHours, formatInt, formatPct, variationPct } from '@/lib/portal/format';

function Kpi({ label, value, hint, help, trend, muted }: { label: string; value: string; hint: string; help: string; trend?: string | null; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm" title={help}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${muted ? 'text-muted' : ''}`}>{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
      {trend ? <p className="mt-1 text-xs font-medium">{trend}</p> : null}
    </div>
  );
}

/** Variação em texto («▲ +12,5% vs período anterior»): não depende só de cor. */
function trendText(v: number | null, suffix = '%'): string | null {
  if (v === null) return null;
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '■';
  return `${arrow} ${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix} vs período anterior`;
}
const pp = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10);

/**
 * Painel de indicadores — o MESMO para a equipe e para o cliente. O banco já restringe os números ao que cada um pode ver
 * (RLS); no modo `client`, trocam-se os rótulos e somem os rankings internos (por responsável e por cliente).
 */
export function DashboardView({ data, labels, client = false }: { data: DashboardData; labels: Map<string, string>; client?: boolean }) {
  const k = data.kpis!;
  const p = data.previous;
  const empty = k.created === 0 && k.open_now === 0 && k.completed === 0;
  const alerts = data.alerts.filter((a) => a.requests > 0 && (!client || a.key === 'overdue' || a.key === 'due_soon' || a.key === 'deliverables_pending'));
  const statusLabels = client ? CLIENT_STATUS_LABELS : undefined;
  return (
    <>
      {empty ? <div className="mb-4"><Alert tone="info">{client ? 'Ainda não há solicitações neste período. Abra uma solicitação ou amplie o período.' : 'Ainda não há solicitações neste período. Cadastre uma empresa cliente e abra uma solicitação, ou amplie o período.'}</Alert></div> : null}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Em aberto agora" value={formatInt(k.open_now)} hint="Situação de hoje, fora concluídas e canceladas." help="Solicitações que ainda não foram concluídas nem canceladas. Foto de agora: não depende do período." />
        <Kpi label="Atrasadas" value={formatInt(k.overdue)} hint="Em aberto com o prazo vencido." help="Solicitações em aberto cujo prazo já passou. Foto de agora." muted={k.overdue === 0} />
        <Kpi label="Vencem em breve" value={formatInt(k.due_soon)} hint="Prazo dentro da janela de alerta." help="Solicitações em aberto cujo prazo vence dentro da janela configurada (padrão: 24 horas)." muted={k.due_soon === 0} />
        <Kpi label="Concluídas no período" value={formatInt(k.completed)} hint={`${formatInt(k.created)} criada(s) no período.`} help="Solicitações concluídas dentro do período selecionado." trend={trendText(variationPct(k.completed, p?.completed ?? null))} />
        <Kpi label="Concluídas no prazo" value={formatPct(k.on_time_pct)} hint={k.on_time_pct === null ? 'Sem conclusões com prazo no período' : 'Das concluídas que tinham prazo.'} help="Das solicitações concluídas no período que tinham prazo, quantos % terminaram antes dele. Sem prazo, não entra na conta." muted={k.on_time_pct === null} trend={trendText(pp(k.on_time_pct, p?.on_time_pct), ' p.p.')} />
        <Kpi label="Tempo médio de resolução" value={formatHours(k.avg_resolution_hours)} hint={k.avg_resolution_hours === null ? 'Sem conclusões no período' : 'Da abertura à conclusão (horas corridas).'} help="Média, em horas corridas, entre a abertura e a conclusão das solicitações concluídas no período." muted={k.avg_resolution_hours === null} trend={trendText(variationPct(k.avg_resolution_hours, p?.avg_resolution_hours ?? null))} />
        {client ? (
          <Kpi label="Aguardando você" value={formatInt(data.statuses.find((s) => s.status === 'waiting_client')?.requests ?? 0)} hint="A equipe precisa de uma resposta sua." help="Solicitações na situação «aguardando você»: a equipe espera uma informação ou aprovação do seu lado." />
        ) : (
          <Kpi label="Clientes ativos" value={formatInt(k.active_clients)} hint="Empresas clientes ativas que você enxerga." help="Empresas clientes ativas (não arquivadas) dentro do seu escopo. Foto de agora." />
        )}
        {client ? (
          <Kpi label="Documentos compartilhados" value={formatInt(k.docs_shared)} hint="Enviados ou compartilhados no período." help="Documentos visíveis a você, enviados no período." />
        ) : (
          <Kpi label="Sem responsável" value={formatInt(k.unassigned)} hint="Em aberto e sem ninguém atribuído." help="Solicitações em aberto sem responsável. Foto de agora." muted={k.unassigned === 0} />
        )}
        {client ? (
          <Kpi label="Entregas publicadas" value={formatInt(k.deliverables_published)} hint="Publicadas para você no período." help="Entregas que a equipe publicou para você dentro do período." />
        ) : (
          <Kpi label="Aguardando a prestadora" value={formatInt(k.awaiting_provider)} hint="Abertas ou com a bola com a equipe." help="Solicitações abertas ou na situação «aguardando prestadora»: a próxima ação é da equipe. Foto de agora." muted={k.awaiting_provider === 0} />
        )}
        {client ? (
          <Kpi label="Solicitações abertas por você" value={formatInt(k.created)} hint="Criadas no período." help="Solicitações criadas no período selecionado." trend={trendText(variationPct(k.created, p?.created ?? null))} />
        ) : (
          <Kpi label="Entregas não publicadas" value={formatInt(k.deliverables_pending)} hint="Rascunho, em preparação ou prontas." help="Entregas que ainda não foram publicadas ao cliente. Foto de agora." muted={k.deliverables_pending === 0} />
        )}
      </section>

      <section aria-label="Gráficos" className="mt-6 grid gap-4 lg:grid-cols-2">
        <FlowChartClient rows={flowRows(data.series)} />
        <StatusChartClient rows={statusRows(data.statuses, statusLabels)} />
        <PriorityChartClient rows={priorityRows(data.priorities)} />
        <SlaChartClient rows={slaRows(data.series)} />
        <HoursChartClient rows={hoursRows(data.series)} />
        <DeliveryChartClient rows={deliveryRows(data.series)} />
        {client ? null : <AssigneeChartClient rows={assigneeRows(data.assignees, labels)} />}
        {client ? null : <ClientChartClient rows={clientRows(data.clients)} />}
      </section>

      <section aria-label="Alertas" className="mt-6">
        <Card title="Alertas" description="Situação de agora.">
          {alerts.length === 0 ? <p className="text-sm text-muted">Nenhum alerta no momento. Tudo em dia.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {alerts.map((a) => (
                <li key={a.key} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                  <Link className="font-medium underline-offset-2 hover:underline" href={client ? ALERT_LINKS[a.key].replace(/^\/(solicitacoes|entregas)/, '/portal/$1') : ALERT_LINKS[a.key]}>{ALERT_TITLES[a.key]}</Link>
                  <Badge tone={a.key === 'overdue' ? 'danger' : 'warning'}>{a.requests}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
