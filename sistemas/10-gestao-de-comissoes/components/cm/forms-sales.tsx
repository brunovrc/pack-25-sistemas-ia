'use client';

import { cancelSale, confirmSale, discardSaleDraft, registerReceipt, registerReturn, reverseReceipt } from '@/lib/commissions/actions/sales';
import { ActionButton, CmForm, TextF } from './fields';

export function CancelSaleForm({ saleId, today }: { saleId: string; today: string }) {
  return (
    <CmForm action={cancelSale} submit="Cancelar venda" variant="danger" reset={false} className="grid gap-3 sm:grid-cols-3" hidden={{ id: saleId }}>
      {(f) => (<><TextF f={f} name="reason" label="Motivo do cancelamento" required max={500} span /><TextF f={f} name="date" label="Data do cancelamento" type="date" def={today} /></>)}
    </CmForm>
  );
}

export function ReturnForm({ saleId, today, items }: { saleId: string; today: string; items: Array<{ id: string; label: string; remaining: string }> }) {
  return (
    <CmForm action={registerReturn} submit="Registrar devolução" reset className="grid gap-3 sm:grid-cols-4" hidden={{ sale_id: saleId }}>
      {(f) => (
        <>
          <TextF f={f} name="amount" label="Valor devolvido (R$) — rateado entre os itens" inputMode="decimal" placeholder="2.000,00" hint="Ou informe o valor por item abaixo (tem prioridade)." />
          <TextF f={f} name="date" label="Data da devolução" type="date" def={today} required />
          <TextF f={f} name="event_id" label="Referência externa (opcional)" max={80} hint="Repetir a mesma referência não duplica a devolução." />
          <TextF f={f} name="reason" label="Motivo" max={300} />
          {items.map((i) => <TextF key={i.id} f={f} name={`item_${i.id}`} label={`${i.label} (saldo ${i.remaining})`} inputMode="decimal" />)}
        </>
      )}
    </CmForm>
  );
}

export function ReceiptForm({ saleId, today }: { saleId: string; today: string }) {
  return (
    <CmForm action={registerReceipt} submit="Registrar recebimento" reset className="grid gap-3 sm:grid-cols-4" hidden={{ sale_id: saleId }}>
      {(f) => (
        <>
          <TextF f={f} name="amount" label="Valor recebido (R$)" required inputMode="decimal" placeholder="4.000,00" />
          <TextF f={f} name="date" label="Data do recebimento" type="date" def={today} required />
          <TextF f={f} name="reference" label="Referência (opcional)" max={80} hint="Mesma referência na mesma venda não duplica." />
          <TextF f={f} name="notes" label="Observações" max={300} />
        </>
      )}
    </CmForm>
  );
}

export const ConfirmSaleButton = ({ id }: { id: string }) => <ActionButton action={confirmSale} fields={{ id }} label="Confirmar venda" variant="primary" confirm="Confirmar? O plano de cada vendedor será fixado e a venda não poderá mais ser editada." />;
export const DiscardDraftButton = ({ id }: { id: string }) => <ActionButton action={discardSaleDraft} fields={{ id }} label="Descartar rascunho" variant="danger" confirm="Descartar este rascunho?" />;
export const ReverseReceiptForm = ({ id }: { id: string }) => (
  <CmForm action={reverseReceipt} submit="Estornar" variant="danger" reset={false} className="flex flex-wrap items-end gap-2" hidden={{ id }}>
    {(f) => <TextF f={f} name="reason" label="Motivo do estorno" required max={300} />}
  </CmForm>
);
