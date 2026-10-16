'use client';

import { useState } from 'react';
import { Field, Input, Select } from '@/components/ui/primitives';
import { archiveGoal, saveGoal, saveSimulation, setNotificationPref } from '@/lib/commissions/actions/goals';
import { GOAL_SCOPE_LABEL, GOAL_TYPE_LABEL } from '@/lib/commissions/labels';
import type { Opt } from './bits';
import { ActionButton, CheckF, CmForm, SelectF, TextF } from './fields';

const VALUE = ['sold_value', 'received_value', 'product_value'];

export function GoalForm({ sellers, teams, products, plans, today, canOrg }: { sellers: Opt[]; teams: Opt[]; products: Opt[]; plans: Opt[]; today: string; canOrg: boolean }) {
  const [type, setType] = useState('sold_value');
  const [scope, setScope] = useState('seller');
  const [bonusType, setBonusType] = useState('fixed');
  const [plan, setPlan] = useState('');
  const isValue = VALUE.includes(type);
  return (
    <CmForm action={saveGoal} submit="Criar meta" className="grid gap-4 sm:grid-cols-4">
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome da meta" required max={100} span />
          <Field label="Tipo de meta" name={f.id('goal_type')} errors={f.e.goal_type}><Select id={f.id('goal_type')} name="goal_type" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(GOAL_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <TextF f={f} name="target" label={isValue ? 'Meta (R$)' : 'Meta (quantidade)'} required inputMode={isValue ? 'decimal' : 'numeric'} placeholder={isValue ? '100.000,00' : '20'} />
          <TextF f={f} name="period_start" label="Início do período" type="date" def={`${today.slice(0, 8)}01`} required />
          <TextF f={f} name="period_end" label="Fim do período" type="date" required />
          <Field label="Escopo" name={f.id('scope_type')} errors={f.e.scope_type}><Select id={f.id('scope_type')} name="scope_type" value={scope} onChange={(e) => setScope(e.target.value)}>{Object.entries(GOAL_SCOPE_LABEL).filter(([v]) => canOrg || v !== 'organization').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          {scope === 'seller' ? <SelectF f={f} name="scope_reference_id" label="Vendedor" opts={sellers} placeholder="Escolha…" required /> : null}
          {scope === 'team' ? <SelectF f={f} name="scope_reference_id" label="Equipe" opts={teams} placeholder="Escolha…" required /> : null}
          {type === 'product_value' || type === 'product_units' ? <SelectF f={f} name="product_id" label="Produto" opts={products} placeholder="Escolha…" required /> : null}
          <fieldset className="sm:col-span-4 grid gap-4 rounded-md border border-dashed border-border p-3 sm:grid-cols-4">
            <legend className="px-1 text-sm font-medium">Bônus por atingimento (opcional)</legend>
            <Field label="Plano de referência do bônus" name={f.id('bonus_plan_id')} hint="Usa a versão publicada mais recente do plano."><Select id={f.id('bonus_plan_id')} name="bonus_plan_id" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">Sem bônus</option>{plans.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
            {plan ? (
              <>
                <TextF f={f} name="threshold" label="Atingimento mínimo (%)" def="100" inputMode="decimal" />
                <Field label="Tipo de bônus" name={f.id('bonus_type')}><Select id={f.id('bonus_type')} name="bonus_type" value={bonusType} onChange={(e) => setBonusType(e.target.value)}><option value="fixed">Valor fixo</option><option value="rate">Percentual do realizado</option></Select></Field>
                {bonusType === 'fixed' ? <TextF f={f} name="bonus_amount" label="Valor do bônus (R$)" inputMode="decimal" placeholder="500,00" /> : <TextF f={f} name="bonus_rate" label="Percentual (%)" inputMode="decimal" placeholder="1" />}
                <SelectF f={f} name="award_timing" label="Quando pagar" def="period_end" opts={[{ value: 'period_end', label: 'Ao fim do período (mais seguro contra devoluções)' }, { value: 'on_attainment', label: 'Assim que atingir' }]} />
                {scope !== 'seller' && bonusType === 'fixed' ? <SelectF f={f} name="distribution" label="Distribuição entre vendedores" def="each" opts={[{ value: 'each', label: 'Cada vendedor recebe o valor' }, { value: 'proportional', label: 'Rateio pelo crédito de cada um' }]} /> : null}
              </>
            ) : null}
            <Input type="hidden" name="_" value="" readOnly />
          </fieldset>
        </>
      )}
    </CmForm>
  );
}
export const ArchiveGoalButton = ({ id }: { id: string }) => <ActionButton action={archiveGoal} fields={{ id }} label="Arquivar" confirm="Arquivar a meta? O histórico continua." />;

export function NotificationPrefForm({ type, label, def }: { type: string; label: string; def: boolean }) {
  return (
    <CmForm action={setNotificationPref} submit="Salvar" reset={false} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2" hidden={{ type }}>
      {(f) => <CheckF f={f} name="enabled" label={label} def={def} />}
    </CmForm>
  );
}

export function SaveSimulationForm({ input, result }: { input: string; result: string }) {
  return (
    <CmForm action={saveSimulation} submit="Salvar simulação" reset className="flex flex-wrap items-end gap-3" hidden={{ input, result }}>
      {(f) => <TextF f={f} name="name" label="Nome da simulação" required max={100} />}
    </CmForm>
  );
}
