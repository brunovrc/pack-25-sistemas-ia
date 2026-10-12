import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { LeadForm } from '@/components/crm/forms';
import { requireContext } from '@/lib/auth/session';
import { loadOptions } from '@/lib/crm/data';
import { activeOptions, isManager, personOptions, WRITER_ROLES } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Novo lead' };

export default async function NewLeadPage() {
  const ctx = await requireContext(WRITER_ROLES);
  const options = await loadOptions(ctx);
  return (
    <>
      <PageHeader title="Novo lead" description="Registre um contato em qualificação." />
      <Card>
        <LeadForm sources={activeOptions(options.sources)} people={personOptions(options.people)} canPickOwner={isManager(ctx.membership.role)} defaultOwner={ctx.user.id} />
      </Card>
    </>
  );
}
