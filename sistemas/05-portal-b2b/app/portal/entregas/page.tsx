import type { Metadata } from 'next';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/app/list-bits';
import { DeliverablesTable } from '@/components/portal/tables';
import { requirePortalContext } from '@/lib/auth/session';
import type { SearchParams } from '@/lib/portal/access';
import { listDeliverables, loadSettings, parsePage } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Entregas' };

export default async function PortalDeliverables({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePortalContext();
  const { account } = ctx;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const [{ rows, total, error }, settings] = await Promise.all([listDeliverables(ctx, account.organization_id, { client: account.client_account_id, status: '', page }), loadSettings(ctx, account.organization_id)]);
  return (
    <>
      <PageHeader title="Entregas" description="Resultados que a equipe publicou para você. Depois de conferir, confirme o recebimento." />
      {error ? <p role="alert" className="mb-3 text-sm text-danger">Não foi possível carregar a lista agora.</p> : null}
      <DeliverablesTable rows={rows} base="/portal" clients={{}} timezone={settings.timezone} showClient={false} empty={<EmptyState title="Nenhuma entrega publicada ainda" description="Quando a equipe publicar uma entrega, você é avisado e ela aparece aqui." />} />
      <Pagination basePath="/portal/entregas" page={page} total={total} params={{}} />
    </>
  );
}
