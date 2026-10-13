'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssigneeChartRow, ClientChartRow, DeliveryRow, FlowRow, HoursRow, SlaRow, StatusChartRow } from '@/lib/portal/chart-rows';
import { formatHours } from '@/lib/portal/format';

// Dados já preparados no servidor (rótulos legíveis). Todos os valores vêm do banco; nada é fixo.
const STATUS_COLOR: Record<string, string> = {
  open: '#64748b', in_review: '#6366f1', in_progress: '#0891b2', waiting_client: '#d97706', waiting_provider: '#ea580c', completed: '#047857', cancelled: '#94a3b8',
};
const PRIORITY_COLOR: Record<string, string> = { low: '#94a3b8', normal: '#0891b2', high: '#d97706', urgent: '#b91c1c' };
const TICK = { fill: 'currentColor', fontSize: 12 };
const TOOLTIP = { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' };
const Grid = () => <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} />;

function ChartFrame({ title, description, empty, children, table }: { title: string; description: string; empty: boolean; children: React.ReactNode; table: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm" aria-label={title}>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted">{description}</p>
      {empty ? (
        <p className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">Sem dados no período selecionado</p>
      ) : (
        <div className="h-[260px] w-full text-muted">{children}</div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Ver dados em tabela</summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </section>
  );
}
const TH = 'px-2 py-1 text-left font-medium text-muted';
const TD = 'px-2 py-1 tabular-nums';
const Table = ({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) => (
  <table className="w-full text-xs"><caption className="sr-only">{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>
);

/** 1 — Solicitações criadas × concluídas no período. */
export function FlowChart({ rows }: { rows: FlowRow[] }) {
  return (
    <ChartFrame title="Solicitações criadas e concluídas" description="Quantas solicitações entraram e quantas foram concluídas em cada intervalo. Intervalos sem movimento aparecem zerados."
      empty={rows.every((r) => r.created === 0 && r.completed === 0)}
      table={<Table caption="Criadas e concluídas por período" head={['Período', 'Criadas', 'Concluídas']}>{rows.map((r) => <tr key={r.label}><td className={TD}>{r.label}</td><td className={TD}>{r.created}</td><td className={TD}>{r.completed}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <Grid /><XAxis dataKey="label" tick={TICK} /><YAxis tick={TICK} allowDecimals={false} width={36} />
          <Tooltip contentStyle={TOOLTIP} /><Legend />
          <Bar isAnimationActive={false} dataKey="created" name="Criadas" fill="#64748b" radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="completed" name="Concluídas" fill="#047857" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 2 — Situação atual das solicitações. */
export function StatusChart({ rows, title = 'Solicitações por situação' }: { rows: StatusChartRow[]; title?: string }) {
  return (
    <ChartFrame title={title} description="Foto de hoje: quantas solicitações estão em cada etapa do fluxo."
      empty={rows.every((r) => r.value === 0)}
      table={<Table caption="Solicitações por situação" head={['Situação', 'Solicitações']}>{rows.map((r) => <tr key={r.key}><td className={TD}>{r.name}</td><td className={TD}>{r.value}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <Grid /><XAxis type="number" tick={TICK} allowDecimals={false} /><YAxis type="category" dataKey="name" tick={TICK} width={132} />
          <Tooltip contentStyle={TOOLTIP} />
          <Bar isAnimationActive={false} dataKey="value" name="Solicitações" radius={[0, 4, 4, 0]}>{rows.map((r) => <Cell key={r.key} fill={STATUS_COLOR[r.key] ?? '#64748b'} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 3 — Prioridades. */
export function PriorityChart({ rows }: { rows: StatusChartRow[] }) {
  return (
    <ChartFrame title="Solicitações por prioridade" description="Distribuição atual por prioridade (inclui as já concluídas, conforme os filtros)."
      empty={rows.every((r) => r.value === 0)}
      table={<Table caption="Solicitações por prioridade" head={['Prioridade', 'Solicitações']}>{rows.map((r) => <tr key={r.key}><td className={TD}>{r.name}</td><td className={TD}>{r.value}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows.filter((r) => r.value > 0)} dataKey="value" nameKey="name" innerRadius={52} outerRadius={92} paddingAngle={2} isAnimationActive={false}>
            {rows.filter((r) => r.value > 0).map((r) => <Cell key={r.key} fill={PRIORITY_COLOR[r.key] ?? '#64748b'} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP} /><Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 4 — Prazo cumprido × estourado. */
export function SlaChart({ rows }: { rows: SlaRow[] }) {
  return (
    <ChartFrame title="Concluídas no prazo × fora do prazo" description="Das concluídas em cada intervalo que tinham prazo: quantas terminaram antes do prazo e quantas depois."
      empty={rows.every((r) => r.on_time === 0 && r.late === 0)}
      table={<Table caption="Prazo cumprido por período" head={['Período', 'No prazo', 'Fora do prazo']}>{rows.map((r) => <tr key={r.label}><td className={TD}>{r.label}</td><td className={TD}>{r.on_time}</td><td className={TD}>{r.late}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <Grid /><XAxis dataKey="label" tick={TICK} /><YAxis tick={TICK} allowDecimals={false} width={36} />
          <Tooltip contentStyle={TOOLTIP} /><Legend />
          <Bar isAnimationActive={false} dataKey="on_time" name="No prazo" stackId="a" fill="#047857" />
          <Bar isAnimationActive={false} dataKey="late" name="Fora do prazo" stackId="a" fill="#b91c1c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 5 — Tempo médio de resolução. */
export function HoursChart({ rows }: { rows: HoursRow[] }) {
  return (
    <ChartFrame title="Tempo médio de resolução" description="Horas corridas entre a abertura e a conclusão, das solicitações concluídas em cada intervalo. Sem conclusões, sem ponto."
      empty={rows.every((r) => r.hours === null)}
      table={<Table caption="Tempo médio de resolução por período" head={['Período', 'Tempo médio']}>{rows.map((r) => <tr key={r.label}><td className={TD}>{r.label}</td><td className={TD}>{formatHours(r.hours)}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <Grid /><XAxis dataKey="label" tick={TICK} /><YAxis tick={TICK} width={48} unit=" h" />
          <Tooltip contentStyle={TOOLTIP} formatter={(v) => formatHours(Number(v))} />
          <Line isAnimationActive={false} type="monotone" dataKey="hours" name="Tempo médio" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 6 — Carga por responsável. */
export function AssigneeChart({ rows }: { rows: AssigneeChartRow[] }) {
  return (
    <ChartFrame title="Carga por responsável" description="Solicitações em aberto hoje e concluídas no período, por responsável."
      empty={rows.length === 0}
      table={<Table caption="Carga por responsável" head={['Responsável', 'Em aberto', 'Concluídas']}>{rows.map((r) => <tr key={r.name}><td className={TD}>{r.name}</td><td className={TD}>{r.open}</td><td className={TD}>{r.completed}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <Grid /><XAxis dataKey="name" tick={TICK} interval={0} /><YAxis tick={TICK} allowDecimals={false} width={36} />
          <Tooltip contentStyle={TOOLTIP} /><Legend />
          <Bar isAnimationActive={false} dataKey="open" name="Em aberto" fill="#0891b2" radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="completed" name="Concluídas" fill="#047857" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 7 — Solicitações por cliente. */
export function ClientChart({ rows }: { rows: ClientChartRow[] }) {
  return (
    <ChartFrame title="Solicitações por cliente" description="Em aberto, atrasadas e concluídas no período, por empresa cliente."
      empty={rows.length === 0}
      table={<Table caption="Solicitações por cliente" head={['Cliente', 'Em aberto', 'Atrasadas', 'Concluídas']}>{rows.map((r) => <tr key={r.name}><td className={TD}>{r.name}</td><td className={TD}>{r.open}</td><td className={TD}>{r.overdue}</td><td className={TD}>{r.completed}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <Grid /><XAxis dataKey="name" tick={TICK} interval={0} /><YAxis tick={TICK} allowDecimals={false} width={36} />
          <Tooltip contentStyle={TOOLTIP} /><Legend />
          <Bar isAnimationActive={false} dataKey="open" name="Em aberto" fill="#0891b2" radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="overdue" name="Atrasadas" fill="#b91c1c" radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="completed" name="Concluídas" fill="#047857" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** 8 — Entregas publicadas. */
export function DeliveryChart({ rows }: { rows: DeliveryRow[] }) {
  return (
    <ChartFrame title="Entregas publicadas" description="Quantas entregas foram publicadas para o cliente em cada intervalo."
      empty={rows.every((r) => r.published === 0)}
      table={<Table caption="Entregas publicadas por período" head={['Período', 'Publicadas']}>{rows.map((r) => <tr key={r.label}><td className={TD}>{r.label}</td><td className={TD}>{r.published}</td></tr>)}</Table>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <Grid /><XAxis dataKey="label" tick={TICK} /><YAxis tick={TICK} allowDecimals={false} width={36} />
          <Tooltip contentStyle={TOOLTIP} />
          <Bar isAnimationActive={false} dataKey="published" name="Publicadas" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
