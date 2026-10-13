import type { Metadata } from 'next';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/app/list-bits';
import { FolderForm, UploadForm } from '@/components/portal/document-bits';
import { FolderNav } from '@/components/portal/folder-nav';
import { DocumentsTable } from '@/components/portal/tables';
import { requireContext } from '@/lib/auth/session';
import { canWrite, isManager, one, uuidOrEmpty, type SearchParams } from '@/lib/portal/access';
import { labelMap, listAccessLogs, listDocuments, listFolders, loadClientOptions, loadPeople, loadSettings, parsePage, searchToken } from '@/lib/portal/data';
import { formatDateTime } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Documentos' };
const ACTION_LABELS: Record<string, string> = { upload: 'Envio', download: 'Download', view: 'Visualização', visibility_changed: 'Visibilidade alterada', archived: 'Arquivamento' };

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const clients = await loadClientOptions(ctx, org, true);
  const client = clients.find((c) => c.id === uuidOrEmpty(one(sp.client)))?.id ?? clients[0]?.id ?? '';
  if (!client) return (<><PageHeader title="Documentos" /><EmptyState title="Nenhuma empresa disponível" description="Cadastre uma empresa cliente para guardar documentos dela." /></>);
  const q = searchToken(sp.q);
  const page = parsePage(sp.page);
  const folderParam = uuidOrEmpty(one(sp.folder));
  const settings = await loadSettings(ctx, org);
  const [folders, docs, people, logs] = await Promise.all([
    listFolders(ctx, client),
    listDocuments(ctx, { org, clientId: client, folder: q ? 'any' : folderParam || null, q, page }),
    loadPeople(ctx, org), listAccessLogs(ctx, client, 30),
  ]);
  const names = labelMap(people);
  const current = folders.some((f) => f.id === folderParam) ? folderParam : null;
  const writer = canWrite(ctx.membership.role);
  const manager = isManager(ctx.membership.role);
  const docTitle = new Map(docs.rows.map((d) => [d.id, d.title]));
  return (
    <>
      <PageHeader title="Documentos" description="Arquivos privados por empresa. O cliente só vê o que for compartilhado; cada acesso fica registrado." />
      <ListFilters action="/documentos" q={q} placeholder="Título do documento" hidden={{ ...(current ? { folder: current } : {}) }} selects={[{ name: 'client', label: 'Empresa', value: client, all: '', required: true, options: clients.map((c) => ({ value: c.id, label: c.name })) }]} />
      <div className="space-y-6">
        <FolderNav base="/documentos" folders={folders} current={current} extra={{ client }} canArchive={manager} staff />
        <DocumentsTable
          rows={docs.rows} folders={Object.fromEntries(folders.map((f) => [f.id, f.name]))} timezone={settings.timezone} staff manage={manager ? 'manager' : writer ? 'write' : 'none'}
          empty={<EmptyState title="Nenhum documento aqui" description={q ? 'Nada com este título.' : 'Envie o primeiro arquivo abaixo.'} />}
        />
        <Pagination basePath="/documentos" page={page} total={docs.total} params={{ client, q, folder: current ?? '' }} />
        {writer ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Enviar documento" description="Nesta pasta e para a empresa selecionada."><UploadForm clientId={client} folderId={current} maxMb={settings.doc_max_mb} staff /></Card>
            <Card title="Nova pasta"><FolderForm clientId={client} parent={current} staff /></Card>
          </div>
        ) : null}
        {manager ? <Card title="Trilha de acessos" description="Quem enviou, visualizou ou baixou arquivos desta empresa (últimos 30 eventos). O registro não pode ser alterado.">
          {logs.length === 0 ? <p className="text-sm text-muted">Nenhum acesso registrado.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><caption className="sr-only">Acessos a documentos</caption>
              <thead className="text-muted"><tr><th scope="col" className="py-1 pr-3 font-medium">Quando</th><th scope="col" className="py-1 pr-3 font-medium">Quem</th><th scope="col" className="py-1 pr-3 font-medium">Ação</th><th scope="col" className="py-1 font-medium">Documento</th></tr></thead>
              <tbody>{logs.map((l) => <tr key={l.id} className="border-t border-border"><td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(l.occurred_at, settings.timezone)}</td><td className="py-1 pr-3">{l.user_id ? names.get(l.user_id) ?? 'Usuário' : '—'}</td><td className="py-1 pr-3">{ACTION_LABELS[l.action] ?? l.action}</td><td className="py-1">{docTitle.get(l.document_id) ?? '—'}</td></tr>)}</tbody></table></div>
          )}
        </Card> : null}
      </div>
    </>
  );
}
