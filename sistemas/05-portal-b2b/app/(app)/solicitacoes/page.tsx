import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { ListFilters, Pagination } from '@/components/app/list-bits';
import { RequestsTable } from '@/components/portal/tables';
import { requireContext } from '@/lib/auth/session';
import { canWrite, one, pick, uuidOrEmpty, type SearchParams } from '@/lib/portal/access';
import { labelMap, listRequests, loadCategories, loadClientOptions, loadPeople, loadSettings, parsePage, personOptions, searchToken } from '@/lib/portal/data';
import { PRIORITIES, PRIORITY_LABELS, REQUEST_STATUSES, STATUS_LABELS } from '@/lib/portal/format';
import { nowMs } from '@/lib/time';

export const metadata: Metadata = { title: 'Solicitações' };

const VIEWS = [
  ['', 'Todas'], ['minhas', 'Minhas em aberto'], ['atrasadas', 'Atrasadas'], ['vencendo', 'Vencem em breve'], ['paradas', 'Paradas'], ['sem_responsavel', 'Sem responsável'], ['aguardando_prestadora', 'Aguardando a prestadora'],
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const sp = await searchParams;
  const view = pick(one(sp.view), VIEWS.map((v) => v[0]).filter(Boolean) as unknown as readonly string[]);
  const f = {
    q: searchToken(sp.q), status: pick(one(sp.status), REQUEST_STATUSES), priority: pick(one(sp.priority), PRIORITIES), client: uuidOrEmpty(one(sp.client)),
    assignee: one(sp.assignee) === 'none' ? 'none' : uuidOrEmpty(one(sp.assignee)), category: uuidOrEmpty(one(sp.category)), view, page: parsePage(sp.page),
  };
  const settings = await loadSettings(ctx, org);
  const now = nowMs();
  const [{ rows, total, error }, people, clients, categories] = await Promise.all([
    listRequests(ctx, org, { ...f, today: now, soonHours: settings.alert_due_soon_hours, staleDays: settings.alert_stale_days }, ctx.user.id),
    loadPeople(ctx, org), loadClientOptions(ctx, org, true), loadCategories(ctx, org, false),
  ]);
  const params = { q: f.q, status: f.status, priority: f.priority, client: f.client, assignee: f.assignee, category: f.category, view: f.view };
  const chip = (value: string, label: string) => {
    const next = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== 'view'));
    if (value) next.set('view', value);
    const on = f.view === value;
    return <Link key={value} href={`/solicitacoes?${next.toString()}`} aria-pressed={on} className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-black/5 dark:hover:bg-white/5'}`}>{label}</Link>;
  };
  return (
    <>
      <PageHeader title="Solicitações" description="Acompanhe tudo o que os clientes pediram: situação, prazo e responsável.">
        {canWrite(ctx.membership.role) ? <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" href="/solicitacoes/nova">Nova solicitação</Link> : null}
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Visões rápidas">{VIEWS.map(([v, l]) => chip(v, l))}</div>
      <ListFilters
        action="/solicitacoes" q={f.q} placeholder="Título ou número (SOL-0012)" hidden={f.view ? { view: f.view } : {}}
        selects={[
          { name: 'client', label: 'Empresa', value: f.client, all: 'Todas', options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: 'status', label: 'Situação', value: f.status, all: 'Todas', options: REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) },
          { name: 'priority', label: 'Prioridade', value: f.priority, all: 'Todas', options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })) },
          { name: 'assignee', label: 'Responsável', value: f.assignee, all: 'Todos', options: [{ value: 'none', label: 'Sem responsável' }, ...personOptions(people, ['staff'])] },
          { name: 'category', label: 'Categoria', value: f.category, all: 'Todas', options: categories.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />
      {error ? <p role="alert" className="mb-3 text-sm text-danger">Não foi possível carregar a lista agora.</p> : null}
      <RequestsTable
        rows={rows} base="" names={Object.fromEntries(labelMap(people))} clients={Object.fromEntries(clients.map((c) => [c.id, c.name]))} timezone={settings.timezone} now={now} soonHours={settings.alert_due_soon_hours}
        empty={<EmptyState title="Nenhuma solicitação encontrada" description={Object.values(params).some(Boolean) ? 'Ajuste os filtros.' : 'As solicitações abertas por clientes ou pela equipe aparecem aqui.'} />}
      />
      <Pagination basePath="/solicitacoes" page={f.page} total={total} params={params} />
    </>
  );
}
