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

export const SalesChartClient = dynamic(() => import('./charts').then((m) => m.SalesChart), { ssr: false, loading: Skeleton });
export const FunnelChartClient = dynamic(() => import('./charts').then((m) => m.FunnelChart), { ssr: false, loading: Skeleton });
export const RepChartClient = dynamic(() => import('./charts').then((m) => m.RepChart), { ssr: false, loading: Skeleton });
export const SourcesChartClient = dynamic(() => import('./charts').then((m) => m.SourcesChart), { ssr: false, loading: Skeleton });
export const WonLostChartClient = dynamic(() => import('./charts').then((m) => m.WonLostChart), { ssr: false, loading: Skeleton });
export const GoalsChartClient = dynamic(() => import('./charts').then((m) => m.GoalsChart), { ssr: false, loading: Skeleton });
