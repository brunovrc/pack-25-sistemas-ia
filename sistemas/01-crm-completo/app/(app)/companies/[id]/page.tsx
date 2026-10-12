import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ActivityForm, CompanyForm, ContactForm } from '@/components/crm/forms';
import { ArchiveButton, DeleteRecordButton } from '@/components/crm/row-actions';
import { ActivitiesTable, ContactsTable, OpportunitiesTable } from '@/components/crm/tables';
import { requireContext } from '@/lib/auth/session';
import { activitiesFor, getById, labelMap, listContacts, loadOptions, nameMap, type Company, type Opportunity } from '@/lib/crm/data';
import { canWriteCrm, isManager, personOptions } from '@/lib/crm/access';
import { nowIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Empresa' };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const company = await getById<Company>(ctx, 'crm_companies', id);
  if (!company) notFound();

  const [options, contacts, activities, opps] = await Promise.all([
    loadOptions(ctx),
    listContacts(ctx, { q: '', company: id, archived: false, page: 1 }),
    activitiesFor(ctx, 'company_id', id),
    ctx.supabase.from('crm_opportunities').select('id, title, value, stage_id, status, probability, expected_close_date, owner_id, company_id').eq('organization_id', ctx.membership.organization_id).eq('company_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  const write = canWriteCrm(ctx.membership.role);
  const manager = isManager(ctx.membership.role);
  const owners = Object.fromEntries(labelMap(options.people));
  const oppRows = ((opps.data ?? []) as Array<Opportunity>).map((o) => ({ ...o, value: Number(o.value) }));

  return (
    <>
      <PageHeader title={company.name} description={company.segment ?? undefined}>{company.archived_at ? <Badge tone="warning">Arquivada</Badge> : null}</PageHeader>
      <p className="mb-4 text-sm"><Link className="underline" href="/companies">← Voltar às empresas</Link></p>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Dados da empresa">
            {write ? <CompanyForm company={company} people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} /> : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Telefone</dt><dd>{company.phone ?? '—'}</dd></div>
                <div><dt className="text-muted">Site</dt><dd>{company.website ?? '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted">Observações</dt><dd className="whitespace-pre-wrap">{company.notes ?? '—'}</dd></div>
              </dl>
            )}
          </Card>
          <Card title="Contatos">
            <ContactsTable rows={contacts.rows} companies={Object.fromEntries(nameMap([company]))} owners={owners} empty={<EmptyState title="Nenhum contato nesta empresa" />} />
            {write ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Adicionar contato</summary><div className="mt-3"><ContactForm companies={[{ value: id, label: company.name }]} people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} defaultCompany={id} /></div></details> : null}
          </Card>
          <Card title="Oportunidades">
            <OpportunitiesTable rows={oppRows} stages={Object.fromEntries(nameMap(options.stages))} owners={owners} companies={{}} empty={<EmptyState title="Nenhuma oportunidade" description="Crie uma em Oportunidades e vincule a esta empresa." />} />
          </Card>
          <Card title="Atividades">
            <ActivitiesTable rows={activities} owners={owners} canWrite={write} nowIso={nowIso()} empty={<EmptyState title="Sem atividades" />} />
            {write ? <div className="mt-4 border-t border-border pt-4"><ActivityForm people={personOptions(options.people)} canPickOwner={manager} defaultOwner={ctx.user.id} links={{ company_id: id }} /></div> : null}
          </Card>
        </div>
        {write ? (
          <div><Card title="Ações"><div className="flex flex-wrap gap-2"><ArchiveButton table="crm_companies" id={id} archived={Boolean(company.archived_at)} />{manager ? <DeleteRecordButton table="crm_companies" id={id} backTo="/companies" /> : null}</div></Card></div>
        ) : null}
      </div>
    </>
  );
}
