import type { Metadata } from 'next';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { NewDeliverableForm } from '@/components/portal/deliverable-forms';
import { requireContext } from '@/lib/auth/session';
import { one, uuidOrEmpty, WRITER_ROLES, type SearchParams } from '@/lib/portal/access';
import { loadClientOptions, requestOptions } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Nova entrega' };

export default async function NewDeliverablePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext(WRITER_ROLES);
  const sp = await searchParams;
  const clients = await loadClientOptions(ctx, ctx.membership.organization_id);
  if (clients.length === 0) return (<><PageHeader title="Nova entrega" /><EmptyState title="Nenhuma empresa ativa disponível" /></>);
  const preset = uuidOrEmpty(one(sp.client));
  const clientId = clients.some((c) => c.id === preset) ? preset : clients[0]!.id;
  const requests = await requestOptions(ctx, clientId);
  return (
    <>
      <PageHeader title="Nova entrega" description="Crie o rascunho, vincule os arquivos e publique quando estiver pronto." />
      <Card><NewDeliverableForm clients={clients.map((c) => ({ value: c.id, label: c.name }))} clientId={clientId} requests={requests} /></Card>
    </>
  );
}
