import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { NewRequestForm } from '@/components/portal/request-forms';
import { requirePortalContext } from '@/lib/auth/session';
import { loadCategories } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Nova solicitação' };

export default async function PortalNewRequest() {
  const ctx = await requirePortalContext();
  const categories = await loadCategories(ctx, ctx.account.organization_id);
  return (
    <>
      <PageHeader title="Nova solicitação" description="Conte o que você precisa. A equipe recebe um aviso e você acompanha tudo por aqui." />
      <Card><NewRequestForm portal clientId={ctx.account.client_account_id} categories={categories.map((c) => ({ value: c.id, label: c.name }))} /></Card>
    </>
  );
}
