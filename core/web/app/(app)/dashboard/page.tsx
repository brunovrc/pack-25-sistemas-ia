import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui/primitives';
import { requireContext } from '@/lib/auth/session';
import { daysAgoIso, nowIso } from '@/lib/time';
import { isAdminRole, isPrivacyRole } from '@/lib/validation/org';

export const metadata: Metadata = { title: 'Painel' };

function Kpi({ label, value, definition }: { label: string; value: number | null; definition: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value === null ? '—' : value.toLocaleString('pt-BR')}</p>
      <p className="mt-2 text-xs text-muted">{definition}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const ctx = await requireContext();
  const org = ctx.membership.organization_id;
  const since = daysAgoIso(7);

  const members = await ctx.supabase.from('organization_members').select('user_id', { count: 'exact', head: true }).eq('organization_id', org);

  let openPrivacy: number | null = null;
  let overduePrivacy: number | null = null;
  if (isPrivacyRole(ctx.membership.role)) {
    const open = await ctx.supabase.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('organization_id', org).in('status', ['open', 'in_progress']);
    const overdue = await ctx.supabase.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('organization_id', org).in('status', ['open', 'in_progress']).lt('due_at', nowIso());
    openPrivacy = open.count ?? 0;
    overduePrivacy = overdue.count ?? 0;
  }

  let auditEvents: number | null = null;
  if (isAdminRole(ctx.membership.role)) {
    const audit = await ctx.supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('organization_id', org).gte('created_at', since);
    auditEvents = audit.count ?? 0;
  }

  return (
    <>
      <PageHeader title="Painel" description={`Visão geral de ${ctx.membership.name}. Os números abaixo são calculados do banco de dados em tempo real.`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Membros da equipe" value={members.count ?? 0} definition="Total de pessoas com acesso à organização." />
        {openPrivacy !== null ? (
          <Kpi label="Solicitações LGPD em aberto" value={openPrivacy} definition="Status 'aberta' ou 'em andamento'. Prazo padrão de resposta: 15 dias." />
        ) : null}
        {overduePrivacy !== null ? (
          <Kpi label="Solicitações LGPD vencidas" value={overduePrivacy} definition="Em aberto com prazo de resposta já ultrapassado." />
        ) : null}
        {auditEvents !== null ? (
          <Kpi label="Eventos de auditoria (7 dias)" value={auditEvents} definition="Alterações registradas nos últimos 7 dias, a partir de agora." />
        ) : null}
      </div>
      <p className="mt-6 text-sm text-muted">
        Precisa convidar alguém ou ajustar papéis? Acesse <Link className="underline" href="/members">Equipe</Link>.
      </p>
    </>
  );
}
