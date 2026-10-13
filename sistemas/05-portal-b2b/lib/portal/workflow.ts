// Espelho (só para a interface) da máquina de estados do banco: private.pt_transition_ok. O banco é a barreira real;
// aqui só se esconde o que o papel não pode fazer. docs/WORKFLOWS.md descreve o fluxo; supabase/tests/62_pt_workflow.sql o prova.
import { REQUEST_STATUSES, type RequestStatus } from './format';

export type Who = 'staff' | 'client';

export function transitionAllowed(who: Who, from: RequestStatus, to: RequestStatus): boolean {
  if (from === to) return false;
  if (who === 'client') return (to === 'cancelled' && (from === 'open' || from === 'in_review')) || (from === 'completed' && to === 'open');
  if (from === 'cancelled') return false; // cancelada é final
  if (from === 'completed') return to === 'open'; // só reabrir
  if (to === 'open') return false; // «aberta» é só o início (ou a reabertura)
  return true;
}

export function nextStatuses(who: Who, from: RequestStatus): RequestStatus[] {
  return REQUEST_STATUSES.filter((to) => transitionAllowed(who, from, to));
}

/** Estas mudanças exigem um motivo (e ele fica no histórico). */
export const REASON_REQUIRED: readonly RequestStatus[] = ['cancelled'];
export const needsReason = (from: RequestStatus, to: RequestStatus) => REASON_REQUIRED.includes(to) || (from === 'completed' && to === 'open');

/** O cliente ainda pode reabrir? (dentro da janela configurada, a partir da conclusão) */
export function canReopen(completedAt: string | null, windowDays: number, nowMs: number): boolean {
  return completedAt !== null && Date.parse(completedAt) >= nowMs - windowDays * 86_400_000;
}
