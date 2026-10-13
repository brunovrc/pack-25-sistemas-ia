import type { Metadata } from 'next';
import { Card, PageHeader } from '@/components/ui/primitives';
import { CategoryForm, PortalSettingsForm, settingsToInput, SlaForm } from '@/components/portal/settings-forms';
import { requireContext } from '@/lib/auth/session';
import { ADMIN_ROLES } from '@/lib/portal/access';
import { loadCategories, loadPolicies, loadSettings } from '@/lib/portal/data';
import { PRIORITY_LABELS, type Priority } from '@/lib/portal/format';

export const metadata: Metadata = { title: 'Configurações do portal' };

export default async function PortalSettingsPage() {
  const ctx = await requireContext(ADMIN_ROLES);
  const org = ctx.membership.organization_id;
  const [settings, categories, policies] = await Promise.all([loadSettings(ctx, org), loadCategories(ctx, org, false), loadPolicies(ctx, org)]);
  return (
    <>
      <PageHeader title="Configurações do portal" description="Identidade do portal do cliente, expediente e prazos, categorias de serviço e níveis de serviço (SLA)." />
      <div className="grid gap-6">
        <Card title="Portal e prazos"><PortalSettingsForm initial={settingsToInput(settings)} /></Card>
        <Card title="Níveis de serviço (SLA)" description="Prazo em horas ÚTEIS por prioridade. Vale para novas solicitações e para mudanças de prioridade; prazos combinados com o cliente não são alterados.">
          <div className="space-y-5">
            {policies.map((p) => <SlaForm key={p.id} id={p.id} hours={p.target_hours} active={p.active} label={PRIORITY_LABELS[p.priority as Priority] ?? p.priority} />)}
          </div>
        </Card>
        <Card title="Categorias de serviço" description="Aparecem ao abrir uma solicitação. Desativar esconde a categoria sem apagar o histórico.">
          <ul className="mb-5 space-y-4">
            {categories.map((c) => <li key={c.id} className="rounded-md border border-border p-3"><CategoryForm id={c.id} initial={{ name: c.name, description: c.description ?? '', active: c.active }} /></li>)}
          </ul>
          <h3 className="mb-2 text-sm font-semibold">Nova categoria</h3>
          <CategoryForm />
        </Card>
      </div>
    </>
  );
}
