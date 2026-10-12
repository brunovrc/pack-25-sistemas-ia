import type { Metadata } from 'next';
import { z } from 'zod';
import { Card, PageHeader } from '@/components/ui/primitives';
import { ContactForm } from '@/components/crm/forms';
import { requireContext } from '@/lib/auth/session';
import { companyOptions, loadOptions } from '@/lib/crm/data';
import { isManager, one, personOptions, WRITER_ROLES, type SearchParams } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Novo contato' };

export default async function NewContactPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext(WRITER_ROLES);
  const sp = await searchParams;
  const company = z.uuid().safeParse(one(sp.company)).success ? one(sp.company) : undefined;
  const [options, companies] = await Promise.all([loadOptions(ctx), companyOptions(ctx)]);
  return (
    <>
      <PageHeader title="Novo contato" />
      <Card><ContactForm companies={companies.map((c) => ({ value: c.id, label: c.name }))} people={personOptions(options.people)} canPickOwner={isManager(ctx.membership.role)} defaultOwner={ctx.user.id} defaultCompany={company} /></Card>
    </>
  );
}
