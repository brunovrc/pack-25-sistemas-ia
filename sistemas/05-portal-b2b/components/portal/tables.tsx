'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DataTable } from '@/components/app/data-table';
import { Badge } from '@/components/ui/primitives';
import type { ClientRow, DeliverableRow, DocumentRow, RequestRow } from '@/lib/portal/data';
import { formatBytes, formatDay, formatDateTime, formatDocument, PRIORITY_LABELS, requestCode } from '@/lib/portal/format';
import { MIME_LABELS, type AllowedMime } from '@/lib/portal/uploads';
import { DeliverableBadge, DueBadge, PriorityBadge, StatusBadge, VisibilityBadge } from './badges';
import { DocLinks, DocumentActions } from './document-bits';

const dash = <span className="text-muted">—</span>;
const linkCls = 'font-medium underline-offset-2 hover:underline';

export type RequestListRow = RequestRow & { client_name?: string };
export function RequestsTable({ rows, base, names, clients, timezone, now, soonHours, client = false, empty }: {
  rows: RequestListRow[]; base: string; names: Record<string, string>; clients: Record<string, string>; timezone: string; now: number; soonHours: number; client?: boolean; empty: React.ReactNode;
}) {
  const columns: ColumnDef<RequestListRow, unknown>[] = [
    { accessorKey: 'number', header: 'Nº', cell: ({ row }) => <Link className={`${linkCls} whitespace-nowrap`} href={`${base}/solicitacoes/${row.original.id}`}>{requestCode(row.original.number)}</Link> },
    { accessorKey: 'title', header: 'Solicitação', cell: ({ row }) => <div><Link className={linkCls} href={`${base}/solicitacoes/${row.original.id}`}>{row.original.title}</Link>{!client ? <div className="text-xs text-muted">{clients[row.original.client_account_id] ?? ''}</div> : null}</div> },
    { accessorKey: 'status', header: 'Situação', cell: ({ row }) => <StatusBadge status={row.original.status} client={client} /> },
    { accessorKey: 'priority', header: 'Prioridade', cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
    { id: 'due', header: 'Prazo', accessorFn: (r) => r.due_at ?? '', cell: ({ row }) => <DueBadge request={row.original} now={now} soonHours={soonHours} tz={timezone} /> },
    ...(client ? [] : [{ id: 'owner', header: 'Responsável', accessorFn: (r: RequestListRow) => (r.assigned_to ? names[r.assigned_to] ?? '' : ''), cell: ({ getValue }: { getValue: () => unknown }) => (getValue() as string) || <span className="text-xs text-warning">Sem responsável</span> } as ColumnDef<RequestListRow, unknown>]),
    { accessorKey: 'last_activity_at', header: 'Atividade', cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{formatDateTime(getValue() as string, timezone)}</span> },
  ];
  return <DataTable columns={columns} data={rows} caption="Solicitações" empty={empty} />;
}

export function ClientsTable({ rows, managers, empty }: { rows: ClientRow[]; managers: Record<string, string>; empty: React.ReactNode }) {
  const columns: ColumnDef<ClientRow, unknown>[] = [
    { accessorKey: 'name', header: 'Empresa', cell: ({ row }) => <div><Link className={linkCls} href={`/clientes/${row.original.id}`}>{row.original.name}</Link><div className="text-xs text-muted">{row.original.legal_name ?? ''}</div></div> },
    { id: 'doc', header: 'CNPJ/CPF', enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDocument(row.original.document_number) || '—'}</span> },
    { id: 'contact', header: 'Contato', enableSorting: false, cell: ({ row }) => <div className="text-xs"><div>{row.original.email ?? dash}</div><div className="text-muted">{row.original.phone ?? ''}</div></div> },
    { accessorKey: 'status', header: 'Situação', cell: ({ row }) => (row.original.status === 'active' ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Inativa</Badge>) },
    { id: 'manager', header: 'Gestor da conta', accessorFn: (r) => (r.assigned_manager_id ? managers[r.assigned_manager_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || <span className="text-xs text-muted">—</span> },
    { accessorKey: 'created_at', header: 'Desde', cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{formatDay(getValue() as string)}</span> },
  ];
  return <DataTable columns={columns} data={rows} caption="Empresas clientes" empty={empty} />;
}

export function DeliverablesTable({ rows, base, clients, timezone, showClient, empty }: { rows: DeliverableRow[]; base: string; clients: Record<string, string>; timezone: string; showClient: boolean; empty: React.ReactNode }) {
  const columns: ColumnDef<DeliverableRow, unknown>[] = [
    { accessorKey: 'title', header: 'Entrega', cell: ({ row }) => <Link className={linkCls} href={`${base}/entregas/${row.original.id}`}>{row.original.title}</Link> },
    ...(showClient ? [{ id: 'client', header: 'Empresa', accessorFn: (r: DeliverableRow) => clients[r.client_account_id] ?? '', cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs">{getValue() as string}</span> } as ColumnDef<DeliverableRow, unknown>] : []),
    { accessorKey: 'status', header: 'Situação', cell: ({ row }) => <DeliverableBadge status={row.original.status} /> },
    { accessorKey: 'delivered_at', header: 'Publicada em', cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{formatDateTime(getValue() as string | null, timezone)}</span> },
    { accessorKey: 'acknowledged_at', header: 'Confirmada em', cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{formatDateTime(getValue() as string | null, timezone)}</span> },
  ];
  return <DataTable columns={columns} data={rows} caption="Entregas" empty={empty} />;
}

/** `manage`: o que a equipe pode fazer com cada documento (o banco confere de novo). Cliente: nenhum. */
export function DocumentsTable({ rows, folders, timezone, staff, manage = 'none', empty }: {
  rows: DocumentRow[]; folders: Record<string, string>; timezone: string; staff: boolean; manage?: 'none' | 'write' | 'manager'; empty: React.ReactNode;
}) {
  const columns: ColumnDef<DocumentRow, unknown>[] = [
    { accessorKey: 'title', header: 'Documento', cell: ({ row }) => <div><div className="font-medium">{row.original.title}</div><div className="text-xs text-muted">{row.original.original_file_name}</div></div> },
    { id: 'type', header: 'Tipo', accessorFn: (r) => r.mime_type, cell: ({ row }) => <span className="text-xs">{MIME_LABELS[row.original.mime_type as AllowedMime] ?? row.original.mime_type}<div className="text-muted">{formatBytes(row.original.size_bytes)}</div></span> },
    { id: 'folder', header: 'Pasta', accessorFn: (r) => (r.folder_id ? folders[r.folder_id] ?? '' : ''), cell: ({ getValue }) => <span className="text-xs">{(getValue() as string) || 'Raiz'}</span> },
    ...(staff ? [{ accessorKey: 'visibility', header: 'Visibilidade', cell: ({ row }: { row: { original: DocumentRow } }) => <VisibilityBadge visibility={row.original.visibility} /> } as ColumnDef<DocumentRow, unknown>] : []),
    { accessorKey: 'created_at', header: 'Enviado em', cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{formatDateTime(getValue() as string, timezone)}</span> },
    { id: 'actions', header: 'Ações', enableSorting: false, cell: ({ row }) => <div className="space-y-2"><DocLinks id={row.original.id} mime={row.original.mime_type} />{manage !== 'none' ? <DocumentActions id={row.original.id} visibility={row.original.visibility} canArchive={manage === 'manager'} /> : null}</div> },
  ];
  return <DataTable columns={columns} data={rows} caption="Documentos" empty={empty} />;
}

export const priorityOptions = (Object.keys(PRIORITY_LABELS) as Array<keyof typeof PRIORITY_LABELS>).map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));
