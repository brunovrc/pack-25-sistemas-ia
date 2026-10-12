'use client';

import { useRouter } from 'next/navigation';
import { archiveRecord, completeActivity, deleteConfig, deleteGoal, deleteRecord } from '@/lib/crm/actions';
import { ActionButton } from './form-kit';

type Table = 'crm_leads' | 'crm_companies' | 'crm_contacts';

export function ArchiveButton({ table, id, archived }: { table: Table; id: string; archived: boolean }) {
  return (
    <ActionButton
      label={archived ? 'Restaurar' : 'Arquivar'}
      confirm={archived ? undefined : 'Arquivar este registro? Ele sai das listagens, mas pode ser restaurado.'}
      action={() => archiveRecord(table, id, !archived)}
    />
  );
}

export function DeleteRecordButton({ table, id, label = 'Apagar', backTo }: { table: 'crm_companies' | 'crm_contacts' | 'crm_leads' | 'crm_opportunities' | 'crm_activities'; id: string; label?: string; backTo?: string }) {
  const router = useRouter();
  return (
    <ActionButton
      label={label}
      variant="danger"
      confirm="Apagar definitivamente? Esta ação não pode ser desfeita."
      action={() => deleteRecord(table, id)}
      onDone={() => { if (backTo) router.push(backTo); }}
    />
  );
}

export function CompleteActivityButton({ id, done }: { id: string; done: boolean }) {
  return <ActionButton label={done ? 'Reabrir' : 'Concluir'} variant={done ? 'ghost' : 'secondary'} action={() => completeActivity(id, !done)} />;
}

export function DeleteGoalButton({ id }: { id: string }) {
  return <ActionButton label="Apagar" variant="ghost" confirm="Apagar esta meta?" action={() => deleteGoal(id)} />;
}

export function DeleteConfigButton({ table, id, what }: { table: 'crm_pipeline_stages' | 'crm_lead_sources' | 'crm_loss_reasons' | 'crm_teams'; id: string; what: string }) {
  return <ActionButton label="Apagar" variant="danger" confirm={`Apagar ${what}? Se estiver em uso, o banco recusa; nesse caso, desative.`} action={() => deleteConfig(table, id)} />;
}
