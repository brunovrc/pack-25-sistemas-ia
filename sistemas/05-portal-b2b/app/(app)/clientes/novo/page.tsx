import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { ClientAccountForm } from '@/components/portal/client-forms';
import { requireContext } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/portal/access';
import { loadPeople, personOptions } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Nova empresa' };

export default async function NewClientPage() {
  const ctx = await requireContext(MANAGER_ROLES);
  const people = await loadPeople(ctx, ctx.membership.organization_id);
  return (
    <>
      <PageHeader title="Nova empresa cliente" description="Depois de cadastrar, convide os usuários da empresa na ficha dela." />
      <Card><ClientAccountForm managers={personOptions(people, ['staff'])} /></Card>
    </>
  );
}
