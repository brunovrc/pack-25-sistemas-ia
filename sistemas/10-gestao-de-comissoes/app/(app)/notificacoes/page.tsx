import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ActionButton } from '@/components/cm/fields';
import { NotificationPrefForm } from '@/components/cm/forms-goals';
import { Section } from '@/components/cm/bits';
import { markNotificationsRead } from '@/lib/commissions/actions/goals';
import { dateBR } from '@/lib/commissions/format';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Avisos' };

const TYPES: Record<string, string> = {
  commission_calculated: 'Nova comissão calculada', commission_approved: 'Comissão aprovada', commission_rejected: 'Comissão rejeitada', commission_contested: 'Comissão contestada', dispute_resolved: 'Contestação respondida',
  commission_reversed: 'Comissão estornada', closing_done: 'Fechamento concluído', statement_available: 'Demonstrativo disponível', payout_recorded: 'Pagamento registrado', adjustment_posted: 'Ajuste lançado',
  calculation_done: 'Cálculo concluído', calculation_failed: 'Falha ou pendência de cálculo', adjustment_pending: 'Ajuste aguardando aprovação', closing_awaiting: 'Fechamento aguardando aprovação', payout_reversed: 'Pagamento estornado', period_reopened: 'Período reaberto', import_failed: 'Importação com rejeições',
};
const HREF: Record<string, (id: string | null) => string> = {
  run: () => '/comissoes', seller: () => '/comissoes', dispute: () => '/contestacoes', closing: () => '/demonstrativos', period: (id) => `/fechamentos/${id}`, import: () => '/importacoes', payout: () => '/pagamentos', adjustment: () => '/aprovacoes',
};

export default async function NotificationsPage() {
  const pc = await pageCtx();
  const { ctx, org } = pc;
  const { data } = await ctx.supabase.from('commission_notifications').select('id, type, title, body, resource_type, resource_id, read_at, created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100);
  const rows = (data ?? []) as Array<{ id: string; type: string; title: string; body: string | null; resource_type: string | null; resource_id: string | null; read_at: string | null; created_at: string }>;
  const { data: pr } = await ctx.supabase.from('commission_notification_prefs').select('type, enabled').eq('organization_id', org).eq('user_id', ctx.user.id);
  const prefs = new Map(((pr ?? []) as Array<{ type: string; enabled: boolean }>).map((p) => [p.type, p.enabled]));
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHeader title="Avisos" description="Avisos internos sobre o que você pode ver. Eles não trazem valores de remuneração: abra o item para consultar.">
        {unread > 0 ? <ActionButton action={markNotificationsRead} fields={{}} label="Marcar todos como lidos" /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="Nenhum aviso" /> : (
        <ul className="space-y-2">
          {rows.map((n) => {
            const to = n.resource_type && HREF[n.resource_type] ? HREF[n.resource_type]!(n.resource_id) : null;
            return (
              <li key={n.id}><Card className={n.read_at ? 'opacity-70' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-medium">{!n.read_at ? <span className="mr-2 inline-block size-2 rounded-full bg-accent align-middle" aria-label="não lido" /> : null}{n.title}</p>{n.body ? <p className="text-sm text-muted">{n.body}</p> : null}<p className="text-xs text-muted">{dateBR(n.created_at)}</p></div>
                  <div className="flex items-center gap-3">{to ? <Link className="text-sm underline underline-offset-2" href={to}>Abrir</Link> : null}{!n.read_at ? <ActionButton action={markNotificationsRead} fields={{ id: n.id }} label="Marcar como lido" /> : null}</div>
                </div>
              </Card></li>
            );
          })}
        </ul>
      )}
      <Section title="Preferências" description="Escolha quais avisos deseja receber.">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(TYPES).map(([type, label]) => (
            <NotificationPrefForm key={type} type={type} label={label} def={prefs.get(type) ?? true} />
          ))}
        </div>
      </Section>
    </>
  );
}
