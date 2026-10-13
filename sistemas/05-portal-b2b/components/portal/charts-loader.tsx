'use client';

import dynamic from 'next/dynamic';

// Gráficos só no navegador: a biblioteca gera estilos em linha, que a CSP estrita bloquearia no HTML do servidor.
// Cada gráfico traz uma tabela alternativa acessível, e este esqueleto aparece enquanto carrega.
// (O Next exige que as opções do `dynamic` sejam um objeto literal, por isso se repetem.)
function Skeleton() {
  return (
    <div role="status" className="h-[330px] animate-pulse rounded-lg bg-black/10 dark:bg-white/10">
      <span className="sr-only">Carregando gráfico…</span>
    </div>
  );
}

export const FlowChartClient = dynamic(() => import('./charts').then((m) => m.FlowChart), { ssr: false, loading: Skeleton });
export const StatusChartClient = dynamic(() => import('./charts').then((m) => m.StatusChart), { ssr: false, loading: Skeleton });
export const PriorityChartClient = dynamic(() => import('./charts').then((m) => m.PriorityChart), { ssr: false, loading: Skeleton });
export const SlaChartClient = dynamic(() => import('./charts').then((m) => m.SlaChart), { ssr: false, loading: Skeleton });
export const HoursChartClient = dynamic(() => import('./charts').then((m) => m.HoursChart), { ssr: false, loading: Skeleton });
export const AssigneeChartClient = dynamic(() => import('./charts').then((m) => m.AssigneeChart), { ssr: false, loading: Skeleton });
export const ClientChartClient = dynamic(() => import('./charts').then((m) => m.ClientChart), { ssr: false, loading: Skeleton });
export const DeliveryChartClient = dynamic(() => import('./charts').then((m) => m.DeliveryChart), { ssr: false, loading: Skeleton });
