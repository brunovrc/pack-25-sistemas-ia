import type { Metadata } from 'next';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { CrmSettingsForm, NamedForm, RemoveMemberButton, StageForm, TeamForm, TeamMemberForm } from '@/components/crm/forms';
import { DeleteConfigButton } from '@/components/crm/row-actions';
import { requireContext } from '@/lib/auth/session';
import { crmSettings, labelMap, loadOptions } from '@/lib/crm/data';
import { ADMIN_ROLES, personOptions } from '@/lib/crm/access';
import { createSupabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Configurações do CRM' };

const KIND_LABEL = { open: 'Aberta', won: 'Ganho', lost: 'Perdido' } as const;

export default async function CrmSettingsPage() {
  const ctx = await requireContext(ADMIN_ROLES);
  const [options, settings] = await Promise.all([loadOptions(ctx), crmSettings(ctx)]);
  const people = personOptions(options.people);
  const labels = labelMap(options.people);

  const supabase = await createSupabaseServer();
  const { data: tm } = await supabase.from('crm_team_members').select('team_id, user_id').eq('organization_id', ctx.membership.organization_id);
  const members = (tm ?? []) as Array<{ team_id: string; user_id: string }>;

  return (
    <>
      <PageHeader title="Configurações do CRM" description="Funil, origens, motivos de perda, equipes e limites dos alertas. Só proprietário e administrador alteram." />
      <div className="space-y-6">
        <Card title="Etapas do funil" description="A ordem segue a posição. É obrigatório manter ao menos uma etapa de Ganho e uma de Perdido ativas. O tipo da etapa não muda depois de criada.">
          <div className="space-y-3">
            {options.stages.map((s) => (
              <details key={s.id} className="rounded-md border border-border p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge tone={s.kind === 'won' ? 'success' : s.kind === 'lost' ? 'danger' : 'neutral'}>{KIND_LABEL[s.kind]}</Badge>
                  <span className="text-sm text-muted">posição {s.position} · {s.probability}%</span>
                  {!s.is_active ? <Badge tone="warning">Inativa</Badge> : null}
                </summary>
                <div className="mt-4 space-y-3">
                  <StageForm stage={s} />
                  <DeleteConfigButton table="crm_pipeline_stages" id={s.id} what={`a etapa "${s.name}"`} />
                </div>
              </details>
            ))}
            <details className="rounded-md border border-dashed border-border p-3">
              <summary className="cursor-pointer font-medium">Adicionar etapa</summary>
              <div className="mt-4"><StageForm /></div>
            </details>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Origens dos leads">
            <div className="space-y-3">
              {options.sources.map((s) => (
                <details key={s.id} className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer"><span className="font-medium">{s.name}</span> {!s.is_active ? <Badge tone="warning">Inativa</Badge> : null}</summary>
                  <div className="mt-3 space-y-3"><NamedForm table="crm_lead_sources" item={s} /><DeleteConfigButton table="crm_lead_sources" id={s.id} what={`a origem "${s.name}"`} /></div>
                </details>
              ))}
              <details className="rounded-md border border-dashed border-border p-3"><summary className="cursor-pointer font-medium">Adicionar origem</summary><div className="mt-3"><NamedForm table="crm_lead_sources" /></div></details>
            </div>
          </Card>
          <Card title="Motivos de perda">
            <div className="space-y-3">
              {options.reasons.map((s) => (
                <details key={s.id} className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer"><span className="font-medium">{s.name}</span> {!s.is_active ? <Badge tone="warning">Inativo</Badge> : null}</summary>
                  <div className="mt-3 space-y-3"><NamedForm table="crm_loss_reasons" item={s} /><DeleteConfigButton table="crm_loss_reasons" id={s.id} what={`o motivo "${s.name}"`} /></div>
                </details>
              ))}
              <details className="rounded-md border border-dashed border-border p-3"><summary className="cursor-pointer font-medium">Adicionar motivo</summary><div className="mt-3"><NamedForm table="crm_loss_reasons" /></div></details>
            </div>
          </Card>
        </div>

        <Card title="Equipes" description="Usadas nos filtros do dashboard e nas metas por equipe.">
          {options.teams.length === 0 ? <EmptyState title="Nenhuma equipe criada" description="Crie uma equipe para filtrar resultados e definir metas coletivas." /> : (
            <div className="space-y-3">
              {options.teams.map((t) => {
                const mine = members.filter((m) => m.team_id === t.id);
                return (
                  <details key={t.id} className="rounded-md border border-border p-3">
                    <summary className="cursor-pointer"><span className="font-medium">{t.name}</span> <span className="text-sm text-muted">· {mine.length} pessoa(s)</span></summary>
                    <div className="mt-3 space-y-3">
                      <ul className="space-y-1 text-sm">
                        {mine.map((m) => (
                          <li key={m.user_id} className="flex items-center justify-between gap-2"><span>{labels.get(m.user_id) ?? 'Usuário'}</span><RemoveMemberButton teamId={t.id} userId={m.user_id} label={labels.get(m.user_id) ?? 'esta pessoa'} /></li>
                        ))}
                        {mine.length === 0 ? <li className="text-muted">Ninguém na equipe ainda.</li> : null}
                      </ul>
                      <TeamMemberForm teamId={t.id} people={people.filter((p) => !mine.some((m) => m.user_id === p.value))} />
                      <DeleteConfigButton table="crm_teams" id={t.id} what={`a equipe "${t.name}"`} />
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          <div className="mt-4"><TeamForm /></div>
        </Card>

        <Card title="Alertas" description="Quando uma oportunidade é considerada parada e quanto antes o fechamento é sinalizado.">
          <CrmSettingsForm values={settings} />
        </Card>
      </div>
    </>
  );
}
