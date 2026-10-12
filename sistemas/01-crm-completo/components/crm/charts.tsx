'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatBRLCompact } from '@/lib/crm/format';

// Dados já preparados no servidor (rótulos legíveis). Todos os valores vêm do banco; nada é fixo.
export type SalesRow = { label: string; won_value: number; won_count: number; lost_count: number };
export type FunnelData = { name: string; count: number; value: number };
export type RepData = { name: string; won_value: number; won_count: number };
export type SourceData = { name: string; count: number };
export type GoalData = { name: string; target: number; realized: number; pct: number | null };

const PALETTE = ['#0891b2', '#162a43', '#d97706', '#7c3aed', '#047857', '#b91c1c', '#64748b'];
const TICK = { fill: 'currentColor', fontSize: 12 };
const brlTooltip = (v: unknown) => formatBRL(Number(v));

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

export function SalesChart({ rows }: { rows: SalesRow[] }) {
  return (
    <ChartFrame
      title="Evolução de vendas"
      description="Valor de negócios ganhos por semana (períodos de até 90 dias) ou por mês."
      empty={rows.every((r) => r.won_value === 0 && r.won_count === 0)}
      table={<table className="w-full text-xs"><caption className="sr-only">Evolução de vendas</caption><thead><tr><th className={TH}>Período</th><th className={TH}>Valor ganho</th><th className={TH}>Negócios</th></tr></thead><tbody>{rows.map((r) => <tr key={r.label}><td className={TD}>{r.label}</td><td className={TD}>{formatBRL(r.won_value)}</td><td className={TD}>{r.won_count}</td></tr>)}</tbody></table>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} />
          <XAxis dataKey="label" tick={TICK} />
          <YAxis tick={TICK} tickFormatter={(v) => formatBRLCompact(Number(v))} width={84} />
          <Tooltip formatter={brlTooltip} labelFormatter={(l) => `Período ${l}`} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          <Area type="monotone" dataKey="won_value" name="Vendas ganhas" stroke="#0891b2" fill="#0891b2" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function FunnelChart({ rows }: { rows: FunnelData[] }) {
  return (
    <ChartFrame
      title="Funil comercial"
      description="Oportunidades abertas e valor por etapa (situação atual)."
      empty={rows.every((r) => r.count === 0)}
      table={<table className="w-full text-xs"><caption className="sr-only">Funil comercial</caption><thead><tr><th className={TH}>Etapa</th><th className={TH}>Oportunidades</th><th className={TH}>Valor</th></tr></thead><tbody>{rows.map((r) => <tr key={r.name}><td className={TD}>{r.name}</td><td className={TD}>{r.count}</td><td className={TD}>{formatBRL(r.value)}</td></tr>)}</tbody></table>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} horizontal={false} />
          <XAxis type="number" tick={TICK} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={TICK} width={96} />
          <Tooltip formatter={(v, n) => (n === 'Valor' ? formatBRL(Number(v)) : String(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          <Legend />
          <Bar dataKey="count" name="Oportunidades" fill="#162a43" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RepChart({ rows }: { rows: RepData[] }) {
  return (
    <ChartFrame
      title="Desempenho por vendedor"
      description="Valor e quantidade de negócios ganhos no período."
      empty={rows.every((r) => r.won_count === 0)}
      table={<table className="w-full text-xs"><caption className="sr-only">Desempenho por vendedor</caption><thead><tr><th className={TH}>Vendedor</th><th className={TH}>Ganhos</th><th className={TH}>Valor</th></tr></thead><tbody>{rows.map((r) => <tr key={r.name}><td className={TD}>{r.name}</td><td className={TD}>{r.won_count}</td><td className={TD}>{formatBRL(r.won_value)}</td></tr>)}</tbody></table>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} />
          <XAxis dataKey="name" tick={TICK} interval={0} />
          <YAxis tick={TICK} tickFormatter={(v) => formatBRLCompact(Number(v))} width={84} />
          <Tooltip formatter={brlTooltip} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          <Bar dataKey="won_value" name="Valor ganho" fill="#047857" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SourcesChart({ rows }: { rows: SourceData[] }) {
  return (
    <ChartFrame
      title="Origem dos leads"
      description="Leads criados no período, por canal de aquisição."
      empty={rows.length === 0}
      table={<table className="w-full text-xs"><caption className="sr-only">Origem dos leads</caption><thead><tr><th className={TH}>Origem</th><th className={TH}>Leads</th></tr></thead><tbody>{rows.map((r) => <tr key={r.name}><td className={TD}>{r.name}</td><td className={TD}>{r.count}</td></tr>)}</tbody></table>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label={(e) => `${e.name}: ${e.value}`}>
            {rows.map((r, i) => <Cell key={r.name} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function WonLostChart({ rows }: { rows: SalesRow[] }) {
  return (
    <ChartFrame
      title="Ganhos × perdidos"
      description="Negócios encerrados no período, lado a lado."
      empty={rows.every((r) => r.won_count === 0 && r.lost_count === 0)}
      table={<table className="w-full text-xs"><caption className="sr-only">Ganhos e perdidos</caption><thead><tr><th className={TH}>Período</th><th className={TH}>Ganhos</th><th className={TH}>Perdidos</th></tr></thead><tbody>{rows.map((r) => <tr key={r.label}><td className={TD}>{r.label}</td><td className={TD}>{r.won_count}</td><td className={TD}>{r.lost_count}</td></tr>)}</tbody></table>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} />
          <XAxis dataKey="label" tick={TICK} />
          <YAxis tick={TICK} allowDecimals={false} width={32} />
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          <Legend />
          <Bar dataKey="won_count" name="Ganhos" fill="#047857" radius={[4, 4, 0, 0]} />
          <Bar dataKey="lost_count" name="Perdidos" fill="#b91c1c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function GoalsChart({ rows }: { rows: GoalData[] }) {
  return (
    <ChartFrame
      title="Metas × realizado"
      description="Meta de vendas ganhas e quanto já foi realizado dentro do período de cada meta."
      empty={rows.length === 0}
      table={<table className="w-full text-xs"><caption className="sr-only">Metas e realizado</caption><thead><tr><th className={TH}>Meta</th><th className={TH}>Meta (R$)</th><th className={TH}>Realizado</th><th className={TH}>%</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.name}-${i}`}><td className={TD}>{r.name}</td><td className={TD}>{formatBRL(r.target)}</td><td className={TD}>{formatBRL(r.realized)}</td><td className={TD}>{r.pct === null ? '—' : `${r.pct.toLocaleString('pt-BR')}%`}</td></tr>)}</tbody></table>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} />
          <XAxis dataKey="name" tick={TICK} interval={0} />
          <YAxis tick={TICK} tickFormatter={(v) => formatBRLCompact(Number(v))} width={84} />
          <Tooltip formatter={brlTooltip} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          <Legend />
          <Bar dataKey="target" name="Meta" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="realized" name="Realizado" fill="#0891b2" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
