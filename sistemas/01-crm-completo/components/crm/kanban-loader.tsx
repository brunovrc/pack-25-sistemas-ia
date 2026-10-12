'use client';

import dynamic from 'next/dynamic';

// Renderiza só no navegador: a biblioteca de arrastar usa estilos em linha, que a CSP estrita
// (sem 'unsafe-inline') bloquearia no HTML gerado pelo servidor.
export const KanbanBoardClient = dynamic(() => import('./kanban').then((m) => m.KanbanBoard), {
  ssr: false,
  loading: () => (
    <div role="status" className="flex gap-4 overflow-hidden">
      <span className="sr-only">Carregando o pipeline…</span>
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-64 w-72 shrink-0 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />)}
    </div>
  ),
});
