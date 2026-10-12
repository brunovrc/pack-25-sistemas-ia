import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ActivityForm, ContactForm } from '@/components/crm/forms';
import { ArchiveButton, DeleteRecordButton } from '@/components/crm/row-actions';
import { ActivitiesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { activitiesFor, companyOptions, getById, labelMap, loadOptions, type Contact } from '@/lib/crm/data';
import { canWriteCrm, isManager, personOptions } from '@/lib/crm/access';
import { nowIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Contato' };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const contact = await getById<Contact>(ctx, 'crm_contacts', id);
  if (!contact) notFound();
  const [options, companies, activities] = await Promise.all([loadOptions(ctx), companyOptions(ctx), activitiesFor(ctx, 'contact_id', id)]);
  const write = canWriteCrm(ctx.membership.role);
  const manager = isManager(ctx.membership.role);
  return (
    <>
      <PageHeader title={contact.name} description={contact.job_title ?? undefined}>{contact.archived_at ? <Badge tone="warning">Arquivado</Badge> : null}</PageHeader>
      <p className="mb-4 text-sm"><Link className="underline" href="/contacts">← Voltar aos contatos</Link></p>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Dados do contato">
            {write ? <ContactForm contact={contact} companies={companies.map((c) => ({ value: c.id, label: c.name }))} people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} /> : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">E-mail</dt><dd>{contact.email ?? '—'}</dd></div><div><dt className="text-muted">Telefone</dt><dd>{contact.phone ?? '—'}</dd></div></dl>
            )}
          </Card>
          <Card title="Atividades">
            <ActivitiesTable rows={activities} owners={Object.fromEntries(labelMap(options.people))} canWrite={write} nowIso={nowIso()} empty={<EmptyState title="Sem atividades" />} />
            {write ? <div className="mt-4 border-t border-border pt-4"><ActivityForm people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} links={{ contact_id: id }} /></div> : null}
          </Card>
        </div>
        {write ? <div><Card title="Ações"><div className="flex flex-wrap gap-2"><ArchiveButton table="crm_contacts" id={id} archived={Boolean(contact.archived_at)} />{manager ? <DeleteRecordButton table="crm_contacts" id={id} backTo="/contacts" /> : null}</div></Card></div> : null}
      </div>
    </>
  );
}
