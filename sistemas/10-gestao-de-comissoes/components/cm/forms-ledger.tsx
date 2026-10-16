'use client';

import { FormMessage, SubmitButton } from '@/components/ui/client';
import { calculateGoals, calculatePeriod, createAdjustment, decideAdjustment, openDispute, respondDispute, reviewEntries } from '@/lib/commissions/actions/ledger';
import { ADJUSTMENT_TYPE_LABEL } from '@/lib/commissions/labels';
import type { Opt } from './bits';
import { ActionButton, AreaF, CmForm, SelectF, TextF } from './fields';
import { useCmAction } from './use-cm-action';

/** Barra de decisão: as caixas de seleção das linhas apontam para este formulário pelo atributo `form="review-form"`. */
export function ReviewForm({ canReopen }: { canReopen: boolean }) {
  const [state, action, ref] = useCmAction(reviewEntries, { reset: false });
  return (
    <form id="review-form" ref={ref} action={action} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">Decisão para os selecionados
        <select name="decision" defaultValue="approve" className="min-h-10 rounded-md border border-border bg-card px-2 text-sm font-normal text-foreground">
          <option value="approve">Aprovar</option><option value="submit">Enviar para revisão</option><option value="reject">Rejeitar (exige justificativa)</option>
          {canReopen ? <option value="reopen">Reabrir rejeitados para revisão</option> : null}
        </select>
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium text-muted">Justificativa
        <input name="justification" maxLength={1000} className="min-h-10 rounded-md border border-border bg-card px-2 text-sm font-normal text-foreground" placeholder="Obrigatória ao rejeitar (mín. 10 caracteres)" />
      </label>
      <SubmitButton pendingText="Aplicando…">Aplicar</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CalculateForm({ from, to }: { from: string; to: string }) {
  return (
    <CmForm action={calculatePeriod} submit="Calcular comissões do período" reset={false} className="flex flex-wrap items-end gap-3">
      {(f) => (<><TextF f={f} name="start" label="De" type="date" def={from} required /><TextF f={f} name="end" label="Até" type="date" def={to} required /></>)}
    </CmForm>
  );
}
export const CalculateGoalsButton = () => <ActionButton action={calculateGoals} fields={{}} label="Lançar bônus de metas atingidas" />;

export function DisputeOpenForm({ entryId }: { entryId: string }) {
  return (
    <CmForm action={openDispute} submit="Abrir contestação" reset className="grid gap-3" hidden={{ entry_id: entryId }}>
      {(f) => <AreaF f={f} name="description" label="O que parece errado? (mín. 10 caracteres)" max={2000} hint="A contestação não altera o valor: o gestor ou o financeiro analisa e responde." />}
    </CmForm>
  );
}

export function DisputeRespondForm({ id, adjustments }: { id: string; adjustments: Opt[] }) {
  return (
    <CmForm action={respondDispute} submit="Registrar resposta" reset={false} className="grid gap-3 sm:grid-cols-4" hidden={{ id }}>
      {(f) => (
        <>
          <SelectF f={f} name="status" label="Resposta" def="resolved" opts={[{ value: 'in_review', label: 'Em análise' }, { value: 'resolved', label: 'Resolvida' }, { value: 'rejected', label: 'Rejeitada (sem alteração)' }]} />
          <SelectF f={f} name="adjustment_entry" label="Ajuste que corrige (opcional)" opts={adjustments} placeholder="Sem ajuste" hint="Crie antes o ajuste no lançamento." span />
          <AreaF f={f} name="resolution" label="Resposta ao vendedor" max={2000} />
        </>
      )}
    </CmForm>
  );
}

export function AdjustmentForm({ sellers, sellerId, relatedEntry }: { sellers: Opt[]; sellerId?: string; relatedEntry?: string }) {
  return (
    <CmForm action={createAdjustment} submit="Registrar ajuste" reset className="grid gap-3 sm:grid-cols-4" hidden={relatedEntry ? { related_entry: relatedEntry } : undefined}>
      {(f) => (
        <>
          <SelectF f={f} name="seller_id" label="Vendedor" def={sellerId} opts={sellers} placeholder="Escolha…" required />
          <SelectF f={f} name="type" label="Tipo" def="negative" opts={Object.entries(ADJUSTMENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <SelectF f={f} name="direction" label="Sentido (só para correção)" opts={[{ value: 'credit', label: 'Crédito (+)' }, { value: 'debit', label: 'Débito (−)' }]} placeholder="—" hint="Os demais tipos já definem o sinal." />
          <TextF f={f} name="amount" label="Valor (R$)" required inputMode="decimal" placeholder="100,00" hint="Sempre positivo; o tipo define o sinal." />
          <TextF f={f} name="effective_at" label="Data efetiva" type="date" />
          <TextF f={f} name="reference" label="Referência" max={120} />
          <AreaF f={f} name="reason" label="Justificativa (obrigatória, mín. 10 caracteres)" max={1000} />
        </>
      )}
    </CmForm>
  );
}

export function AdjustmentDecisionForm({ id }: { id: string }) {
  return (
    <CmForm action={decideAdjustment} submit="Decidir" reset={false} className="flex flex-wrap items-end gap-3" hidden={{ id }}>
      {(f) => (<><SelectF f={f} name="decision" label="Decisão" def="approve" opts={[{ value: 'approve', label: 'Aprovar e lançar' }, { value: 'reject', label: 'Rejeitar' }]} /><TextF f={f} name="note" label="Observação" max={500} /></>)}
    </CmForm>
  );
}
