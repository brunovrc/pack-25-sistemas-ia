'use client';

import { cancelPeriod, closePeriod, openPeriod, prepareClosings, recordPayout, reopenPeriod, reversePayout, submitPeriod } from '@/lib/commissions/actions/closing';
import { PAYMENT_METHOD_LABEL } from '@/lib/commissions/labels';
import { ActionButton, AreaF, CmForm, SelectF, TextF } from './fields';

export function OpenPeriodForm({ from, to }: { from: string; to: string }) {
  return (
    <CmForm action={openPeriod} submit="Abrir período" className="flex flex-wrap items-end gap-3" reset={false}>
      {(f) => (<><TextF f={f} name="start" label="Início" type="date" def={from} required /><TextF f={f} name="end" label="Fim" type="date" def={to} required /></>)}
    </CmForm>
  );
}
export const PrepareButton = ({ id, again }: { id: string; again: boolean }) => <ActionButton action={prepareClosings} fields={{ id }} label={again ? 'Refazer conferência' : 'Montar conferência'} variant="primary" />;
export const SubmitPeriodButton = ({ id }: { id: string }) => <ActionButton action={submitPeriod} fields={{ id }} label="Enviar para aprovação" variant="primary" />;
export const ClosePeriodButton = ({ id }: { id: string }) => <ActionButton action={closePeriod} fields={{ id }} label="Aprovar e fechar período" variant="primary" confirm="Fechar o período? Valores e itens ficam imutáveis; correções só por lançamentos em períodos seguintes ou reabertura formal." />;
export function ReopenForm({ id }: { id: string }) {
  return (
    <CmForm action={reopenPeriod} submit="Reabrir período" variant="danger" reset={false} className="grid gap-3" hidden={{ id }}>
      {(f) => <AreaF f={f} name="reason" label="Justificativa da reabertura (mín. 20 caracteres)" max={1000} hint="Só o último período fechado, sem pagamentos ativos. Fica registrado na auditoria." />}
    </CmForm>
  );
}
export function CancelPeriodForm({ id }: { id: string }) {
  return (
    <CmForm action={cancelPeriod} submit="Cancelar período" variant="danger" reset={false} className="grid gap-3" hidden={{ id }}>
      {(f) => <TextF f={f} name="reason" label="Motivo" required max={1000} />}
    </CmForm>
  );
}

export function PayoutForm({ sellerId, closingId, pending, today }: { sellerId: string; closingId: string; pending: string; today: string }) {
  return (
    <CmForm action={recordPayout} submit="Registrar pagamento" reset className="grid gap-3 sm:grid-cols-4" hidden={{ seller_id: sellerId, closing_id: closingId }}>
      {(f) => (
        <>
          <TextF f={f} name="amount" label={`Valor pago (R$) — pendente ${pending}`} required inputMode="decimal" />
          <TextF f={f} name="date" label="Data do pagamento" type="date" def={today} required />
          <SelectF f={f} name="method" label="Forma" def="pix" opts={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
          <TextF f={f} name="reference" label="Referência/comprovante" max={120} hint="Evita registrar o mesmo pagamento duas vezes." />
          <TextF f={f} name="notes" label="Observações" max={500} span />
        </>
      )}
    </CmForm>
  );
}
export function ReversePayoutForm({ id }: { id: string }) {
  return (
    <CmForm action={reversePayout} submit="Estornar registro" variant="danger" reset={false} className="flex flex-wrap items-end gap-2" hidden={{ id }}>
      {(f) => <TextF f={f} name="reason" label="Motivo do estorno do registro" required max={500} />}
    </CmForm>
  );
}
