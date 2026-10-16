'use client';

import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Gráficos só no navegador (ver charts-loader.tsx). Os números vêm do PostgreSQL em centavos inteiros; aqui só desenhamos e formatamos em BRL.
const COLORS = ['#0e7490', '#047857', '#b45309', '#7c3aed', '#be123c', '#475569', '#0369a1', '#a16207'];
const TICK = { fill: 'currentColor', fontSize: 12 };
const TOOLTIP = { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' };
const Grid = () => <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.2} />;

const reais = (cents: number): string => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const compact = (cents: number): string => {
  const v = cents / 100;
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};
const short = (v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v);

export type Series = { key: string; name: string; type?: 'bar' | 'line' };
export type Point = Record<string, string | number | null>;

function Empty({ height }: { height: number }) {
  return <p className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted" style={{ height }}>Sem dados no período e filtros escolhidos</p>;
}

/** Barras (ou barras + linhas) por categoria/mês; todos os valores em centavos. */
export function MoneyChart({ data, series, height = 260, stacked = false, horizontal = false }: { data: Point[]; series: Series[]; height?: number; stacked?: boolean; horizontal?: boolean }) {
  if (!data.length) return <Empty height={height} />;
  const tooltip = <Tooltip contentStyle={TOOLTIP} formatter={(v) => reais(Number(v))} />;
  const hasLine = series.some((s) => s.type === 'line');
  if (hasLine) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}><Grid /><XAxis dataKey="name" tick={TICK} /><YAxis tick={TICK} tickFormatter={(v) => compact(Number(v))} width={80} />{tooltip}<Legend />
          {series.map((s, i) => (s.type === 'line'
            ? <Line key={s.key} isAnimationActive={false} type="monotone" dataKey={s.key} name={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} connectNulls />
            : <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />))}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }
  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, data.length * 34 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}><Grid /><XAxis type="number" tick={TICK} tickFormatter={(v) => compact(Number(v))} /><YAxis type="category" dataKey="name" tick={TICK} width={120} tickFormatter={short} />{tooltip}
          {series.map((s, i) => <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.name} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}><Grid /><XAxis dataKey="name" tick={TICK} tickFormatter={short} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 64 : 30} />
        <YAxis tick={TICK} tickFormatter={(v) => compact(Number(v))} width={80} />{tooltip}{series.length > 1 ? <Legend /> : null}
        {series.map((s, i) => <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.name} fill={COLORS[i % COLORS.length]} {...(stacked ? { stackId: 'a' } : {})} radius={stacked ? 0 : [4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolução (linhas) em centavos. */
export function MoneyLines({ data, series, height = 260 }: { data: Point[]; series: Series[]; height?: number }) {
  if (!data.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}><Grid /><XAxis dataKey="name" tick={TICK} /><YAxis tick={TICK} tickFormatter={(v) => compact(Number(v))} width={80} /><Tooltip contentStyle={TOOLTIP} formatter={(v) => reais(Number(v))} /><Legend />
        {series.map((s, i) => <Line key={s.key} isAnimationActive={false} type="monotone" dataKey={s.key} name={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={data.length < 30} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 260, money = true }: { data: Array<{ name: string; value: number }>; height?: number; money?: boolean }) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie isAnimationActive={false} data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={1}>
          {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP} formatter={(v) => (money ? reais(Number(v)) : String(v))} /><Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
