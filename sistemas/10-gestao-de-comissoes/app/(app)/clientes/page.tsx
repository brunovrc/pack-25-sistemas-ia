import type { Metadata } from 'next';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Pagination, TableShell, TD, TH } from '@/components/cm/bits';
import { ArchiveCustomerButton, CustomerForm } from '@/components/cm/forms-registry';
import { FInput, FSelect, FilterForm } from '@/components/cm/page-bits';
import { pageCtx } from '@/lib/commissions/page';
import { PAGE_SIZE, one, pageFrom, safeSearch, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Clientes' };

type C = { id: string; name: string; legal_name: string | null; document_number: string | null; email: string | null; phone: string | null; archived_at: string | null };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const page = pageFrom(one(sp.page));
  const q = safeSearch(one(sp.q));
  const archived = one(sp.arquivados) === '1';
  let query = pc.ctx.supabase.from('customers').select('id, name, legal_name, document_number, email, phone, archived_at', { count: 'exact' }).order('name');
  if (q) query = query.or(`name.ilike.%${q}%,legal_name.ilike.%${q}%,document_number.ilike.%${q}%`);
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as C[];
  return (
    <>
      <PageHeader title="Clientes" description="Cadastro mínimo para vincular vendas e identificar novos clientes. Clientes são arquivados, nunca apagados." />
      <div className="mb-6"><Disclosure summary="Cadastrar cliente" tone="primary"><CustomerForm /></Disclosure></div>
      <FilterForm clear="/clientes">
        <FInput name="q" label="Buscar por nome ou documento" sp={sp} />
        <FSelect name="arquivados" label="Situação" sp={sp} opts={[{ value: '1', label: 'Arquivados' }]} placeholder="Ativos" />
      </FilterForm>
      <TableShell caption="Clientes" empty={rows.length === 0}>
        <thead><tr><th className={TH}>Cliente</th><th className={TH}>Documento</th><th className={TH}>Contato</th><th className={TH}><span className="sr-only">Ações</span></th></tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((c) => (
            <tr key={c.id}>
              <td className={TD}><span className="font-medium">{c.name}</span>{c.legal_name ? <span className="block text-xs text-muted">{c.legal_name}</span> : null}{c.archived_at ? <span className="ml-2"><Badge>arquivado</Badge></span> : null}</td>
              <td className={TD}>{c.document_number ?? '—'}</td><td className={TD}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</td>
              <td className={TD}><div className="flex flex-wrap items-center gap-2"><Disclosure summary="Editar"><CustomerForm customer={c} /></Disclosure><ArchiveCustomerButton id={c.id} archived={!!c.archived_at} /></div></td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <Pagination base="/clientes" sp={sp} page={page} total={count ?? 0} />
    </>
  );
}
