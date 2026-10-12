'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Badge } from '@/components/ui/primitives';
import { formatBRL, formatDate, formatDateBR, formatDateTimeBR } from '@/lib/crm/format';
import { ACTIVITY_KIND_LABELS, LEAD_STATUS_LABELS, PRIORITY_LABELS, TEMPERATURE_LABELS } from '@/lib/crm/validation';
import { DataTable } from './data-table';
import { CompleteActivityButton } from './row-actions';

type Lookup = Record<string, string>;
const dash = <span className="text-muted">—</span>;

const LEAD_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = { new: 'neutral', contacted: 'neutral', qualified: 'success', unqualified: 'warning', converted: 'success' };
const TEMP_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = { cold: 'neutral', warm: 'warning', hot: 'danger' };

// ---------------------------------------------------------------- leads
export type LeadRow = { id: string; name: string; company_name: string | null; email: string | null; phone: string | null; source_id: string | null; status: string; temperature: string; owner_id: string | null; created_at: string; archived_at: string | null };

export function LeadsTable({ rows, sources, owners, empty }: { rows: LeadRow[]; sources: Lookup; owners: Lookup; empty: React.ReactNode }) {
  const columns: ColumnDef<LeadRow, unknown>[] = [
    { accessorKey: 'name', header: 'Nome', cell: ({ row }) => <Link className="font-medium underline-offset-2 hover:underline" href={`/leads/${row.original.id}`}>{row.original.name}</Link> },
    { accessorKey: 'company_name', header: 'Empresa', cell: ({ getValue }) => (getValue() as string | null) ?? dash },
    { id: 'contact', header: 'Contato', enableSorting: false, cell: ({ row }) => <div className="text-xs"><div>{row.original.email ?? dash}</div><div className="text-muted">{row.original.phone ?? ''}</div></div> },
    { id: 'source', header: 'Origem', accessorFn: (r) => (r.source_id ? sources[r.source_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || dash },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge tone={LEAD_TONE[row.original.status] ?? 'neutral'}>{LEAD_STATUS_LABELS[row.original.status] ?? row.original.status}</Badge> },
    { accessorKey: 'temperature', header: 'Classificação', cell: ({ row }) => <Badge tone={TEMP_TONE[row.original.temperature] ?? 'neutral'}>{TEMPERATURE_LABELS[row.original.temperature] ?? row.original.temperature}</Badge> },
    { id: 'owner', header: 'Responsável', accessorFn: (r) => (r.owner_id ? owners[r.owner_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || <span className="text-muted">Sem responsável</span> },
    { accessorKey: 'created_at', header: 'Criado em', cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{formatDateBR(getValue() as string)}</span> },
  ];
  return <DataTable columns={columns} data={rows} caption="Leads" empty={empty} />;
}

// ---------------------------------------------------------------- empresas e contatos
export type CompanyRow = { id: string; name: string; segment: string | null; phone: string | null; website: string | null; owner_id: string | null; created_at: string };

export function CompaniesTable({ rows, owners, empty }: { rows: CompanyRow[]; owners: Lookup; empty: React.ReactNode }) {
  const columns: ColumnDef<CompanyRow, unknown>[] = [
    { accessorKey: 'name', header: 'Empresa', cell: ({ row }) => <Link className="font-medium hover:underline" href={`/companies/${row.original.id}`}>{row.original.name}</Link> },
    { accessorKey: 'segment', header: 'Segmento', cell: ({ getValue }) => (getValue() as string | null) ?? dash },
    { accessorKey: 'phone', header: 'Telefone', cell: ({ getValue }) => (getValue() as string | null) ?? dash },
    { id: 'owner', header: 'Responsável', accessorFn: (r) => (r.owner_id ? owners[r.owner_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || dash },
    { accessorKey: 'created_at', header: 'Criada em', cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{formatDateBR(getValue() as string)}</span> },
  ];
  return <DataTable columns={columns} data={rows} caption="Empresas" empty={empty} />;
}

export type ContactRow = { id: string; name: string; email: string | null; phone: string | null; job_title: string | null; company_id: string | null; owner_id: string | null };

export function ContactsTable({ rows, companies, owners, empty }: { rows: ContactRow[]; companies: Lookup; owners: Lookup; empty: React.ReactNode }) {
  const columns: ColumnDef<ContactRow, unknown>[] = [
    { accessorKey: 'name', header: 'Nome', cell: ({ row }) => <Link className="font-medium hover:underline" href={`/contacts/${row.original.id}`}>{row.original.name}</Link> },
    { id: 'company', header: 'Empresa', accessorFn: (r) => (r.company_id ? companies[r.company_id] ?? '' : ''), cell: ({ row, getValue }) => (row.original.company_id ? <Link className="hover:underline" href={`/companies/${row.original.company_id}`}>{getValue() as string}</Link> : dash) },
    { accessorKey: 'job_title', header: 'Cargo', cell: ({ getValue }) => (getValue() as string | null) ?? dash },
    { id: 'contact', header: 'Contato', enableSorting: false, cell: ({ row }) => <div className="text-xs"><div>{row.original.email ?? dash}</div><div className="text-muted">{row.original.phone ?? ''}</div></div> },
    { id: 'owner', header: 'Responsável', accessorFn: (r) => (r.owner_id ? owners[r.owner_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || dash },
  ];
  return <DataTable columns={columns} data={rows} caption="Contatos" empty={empty} />;
}

// ---------------------------------------------------------------- oportunidades
export type OppRow = { id: string; title: string; value: number; stage_id: string; status: 'open' | 'won' | 'lost'; probability: number | null; expected_close_date: string | null; owner_id: string | null; company_id: string | null };
const OPP_TONE = { open: 'neutral', won: 'success', lost: 'danger' } as const;
const OPP_LABEL = { open: 'Aberta', won: 'Ganha', lost: 'Perdida' } as const;

export function OpportunitiesTable({ rows, stages, owners, companies, empty }: { rows: OppRow[]; stages: Lookup; owners: Lookup; companies: Lookup; empty: React.ReactNode }) {
  const columns: ColumnDef<OppRow, unknown>[] = [
    { accessorKey: 'title', header: 'Oportunidade', cell: ({ row }) => <Link className="font-medium hover:underline" href={`/opportunities/${row.original.id}`}>{row.original.title}</Link> },
    { id: 'company', header: 'Empresa', accessorFn: (r) => (r.company_id ? companies[r.company_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || dash },
    { accessorKey: 'value', header: 'Valor', cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatBRL(getValue() as number)}</span> },
    { id: 'stage', header: 'Etapa', accessorFn: (r) => stages[r.stage_id] ?? '', cell: ({ getValue }) => getValue() as string },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge tone={OPP_TONE[row.original.status]}>{OPP_LABEL[row.original.status]}</Badge> },
    { accessorKey: 'expected_close_date', header: 'Previsão', cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string | null)}</span> },
    { id: 'owner', header: 'Responsável', accessorFn: (r) => (r.owner_id ? owners[r.owner_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || dash },
  ];
  return <DataTable columns={columns} data={rows} caption="Oportunidades" empty={empty} />;
}

// ---------------------------------------------------------------- atividades
export type ActivityRow = { id: string; kind: string; title: string; due_at: string | null; completed_at: string | null; priority: string; owner_id: string | null; lead_id: string | null; opportunity_id: string | null };
const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = { low: 'neutral', medium: 'warning', high: 'danger' };

export function ActivitiesTable({ rows, owners, canWrite, nowIso, empty }: { rows: ActivityRow[]; owners: Lookup; canWrite: boolean; nowIso: string; empty: React.ReactNode }) {
  const columns: ColumnDef<ActivityRow, unknown>[] = [
    { accessorKey: 'title', header: 'Atividade', cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.title}</div>
        <div className="text-xs text-muted">
          {ACTIVITY_KIND_LABELS[row.original.kind] ?? row.original.kind}
          {row.original.opportunity_id ? <> · <Link className="underline" href={`/opportunities/${row.original.opportunity_id}`}>oportunidade</Link></> : null}
          {row.original.lead_id ? <> · <Link className="underline" href={`/leads/${row.original.lead_id}`}>lead</Link></> : null}
        </div>
      </div>
    ) },
    { accessorKey: 'due_at', header: 'Prazo', cell: ({ row }) => {
      const { due_at, completed_at } = row.original;
      const overdue = !completed_at && due_at !== null && due_at < nowIso;
      return <span className={overdue ? 'whitespace-nowrap font-medium text-danger' : 'whitespace-nowrap'}>{formatDateTimeBR(due_at)}{overdue ? ' · atrasada' : ''}</span>;
    } },
    { accessorKey: 'priority', header: 'Prioridade', cell: ({ row }) => <Badge tone={PRIORITY_TONE[row.original.priority] ?? 'neutral'}>{PRIORITY_LABELS[row.original.priority] ?? row.original.priority}</Badge> },
    { id: 'owner', header: 'Responsável', accessorFn: (r) => (r.owner_id ? owners[r.owner_id] ?? '' : ''), cell: ({ getValue }) => (getValue() as string) || dash },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => (canWrite ? <CompleteActivityButton id={row.original.id} done={Boolean(row.original.completed_at)} /> : null) },
  ];
  return <DataTable columns={columns} data={rows} caption="Atividades" empty={empty} />;
}
