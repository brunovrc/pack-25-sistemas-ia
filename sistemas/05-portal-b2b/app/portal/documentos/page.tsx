import type { Metadata } from 'next';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/app/list-bits';
import { FolderForm, UploadForm } from '@/components/portal/document-bits';
import { FolderNav } from '@/components/portal/folder-nav';
import { DocumentsTable } from '@/components/portal/tables';
import { requirePortalContext } from '@/lib/auth/session';
import { one, uuidOrEmpty, type SearchParams } from '@/lib/portal/access';
import { listDocuments, listFolders, loadSettings, parsePage, searchToken } from '@/lib/portal/data';

export const metadata: Metadata = { title: 'Documentos' };

export default async function PortalDocuments({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePortalContext();
  const { account } = ctx;
  const org = account.organization_id;
  const sp = await searchParams;
  const q = searchToken(sp.q);
  const page = parsePage(sp.page);
  const folderParam = uuidOrEmpty(one(sp.folder));
  const settings = await loadSettings(ctx, org);
  const [folders, docs] = await Promise.all([
    listFolders(ctx, account.client_account_id),
    listDocuments(ctx, { org, clientId: account.client_account_id, folder: q ? 'any' : folderParam || null, q, page }),
  ]);
  const current = folders.some((f) => f.id === folderParam) ? folderParam : null;
  return (
    <>
      <PageHeader title="Documentos" description="Arquivos da sua empresa compartilhados com você. Você também pode enviar arquivos para a equipe." />
      <ListFilters action="/portal/documentos" q={q} placeholder="Título do documento" hidden={current ? { folder: current } : {}} />
      <div className="space-y-6">
        <FolderNav base="/portal/documentos" folders={folders} current={current} extra={{}} canArchive={false} staff={false} />
        <DocumentsTable rows={docs.rows} folders={Object.fromEntries(folders.map((f) => [f.id, f.name]))} timezone={settings.timezone} staff={false} empty={<EmptyState title="Nenhum documento aqui" description={q ? 'Nada com este título.' : 'Quando a equipe compartilhar arquivos, eles aparecem aqui.'} />} />
        <Pagination basePath="/portal/documentos" page={page} total={docs.total} params={{ q, folder: current ?? '' }} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Enviar documento" description="O arquivo fica visível para você e para a equipe."><UploadForm clientId={account.client_account_id} folderId={current} maxMb={settings.doc_max_mb} staff={false} /></Card>
          <Card title="Nova pasta"><FolderForm clientId={account.client_account_id} parent={current} staff={false} /></Card>
        </div>
      </div>
    </>
  );
}
