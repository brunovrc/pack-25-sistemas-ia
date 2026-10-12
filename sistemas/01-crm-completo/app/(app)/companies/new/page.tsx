import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { CompanyForm } from '@/components/crm/forms';
import { requireContext } from '@/lib/auth/session';
import { loadOptions } from '@/lib/crm/data';
import { isManager, personOptions, WRITER_ROLES } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Nova empresa' };

export default async function NewCompanyPage() {
  const ctx = await requireContext(WRITER_ROLES);
  const options = await loadOptions(ctx);
  return (
    <>
      <PageHeader title="Nova empresa" />
      <Card><CompanyForm people={personOptions(options.people)} canPickOwner={isManager(ctx.membership.role)} defaultOwner={ctx.user.id} /></Card>
    </>
  );
}
