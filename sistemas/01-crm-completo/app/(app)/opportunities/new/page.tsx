import type { Metadata } from 'next';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { OpportunityForm } from '@/components/crm/forms';
import { requireContext } from '@/lib/auth/session';
import { companyOptions, contactOptions, loadOptions } from '@/lib/crm/data';
import { activeOptions, isManager, personOptions, WRITER_ROLES } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Nova oportunidade' };

export default async function NewOpportunityPage() {
  const ctx = await requireContext(WRITER_ROLES);
  const [options, companies, contacts] = await Promise.all([loadOptions(ctx), companyOptions(ctx), contactOptions(ctx)]);
  const stages = options.stages.filter((s) => s.kind === 'open' && s.is_active).map((s) => ({ value: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Nova oportunidade" />
      {stages.length === 0 ? <Alert tone="warning">Não há etapas abertas ativas. Peça a um administrador para configurar o funil.</Alert> : (
        <Card>
          <OpportunityForm
            stages={stages}
            companies={companies.map((c) => ({ value: c.id, label: c.name }))}
            contacts={contacts.map((c) => ({ value: c.id, label: c.name }))}
            sources={activeOptions(options.sources)}
            people={personOptions(options.people)}
            canPickOwner={isManager(ctx.membership.role)}
            defaultOwner={ctx.user.id}
          />
        </Card>
      )}
    </>
  );
}
