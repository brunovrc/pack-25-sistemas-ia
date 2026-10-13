import type { Metadata } from 'next';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { NewRequestForm } from '@/components/portal/request-forms';
import { requireContext } from '@/lib/auth/session';
import { one, uuidOrEmpty, WRITER_ROLES, type SearchParams } from '@/lib/portal/access';
import { loadCategories, loadClientOptions, loadPeople, personOptions } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Nova solicitação' };

export default async function NewRequestPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext(WRITER_ROLES);
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const [clients, categories, people] = await Promise.all([loadClientOptions(ctx, org), loadCategories(ctx, org), loadPeople(ctx, org)]);
  if (clients.length === 0) return (<><PageHeader title="Nova solicitação" /><EmptyState title="Nenhuma empresa ativa disponível" description="Cadastre uma empresa cliente (ou peça acesso a uma) para abrir solicitações." /></>);
  const preset = uuidOrEmpty(one(sp.client));
  return (
    <>
      <PageHeader title="Nova solicitação" description="Abra uma solicitação em nome de uma empresa cliente. O prazo é calculado pela prioridade, em horas úteis." />
      <Card>
        <NewRequestForm
          portal={false} clientId={clients.some((c) => c.id === preset) ? preset : undefined} clients={clients.map((c) => ({ value: c.id, label: c.name }))}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))} assignees={personOptions(people, ['staff'])}
        />
      </Card>
    </>
  );
}
