import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { Section, TableShell, TD, TH } from '@/components/cm/bits';
import { AccessForm, SettingsForm } from '@/components/cm/forms-registry';
import { pageCtx } from '@/lib/commissions/page';
import { ROLE_LABELS, type OrgRole } from '@/lib/validation/org';

export const metadata: Metadata = { title: 'Configurações do módulo' };

export default async function ModuleSettingsPage() {
  const pc = await pageCtx(['admin']);
  const { ctx, org, settings } = pc;
  const { data } = await ctx.supabase.rpc('cm_org_members', { p_org: org });
  const members = (data ?? []) as Array<{ user_id: string; role: string; email: string | null; name: string | null; access: string | null; seller_id: string | null }>;
  return (
    <>
      <PageHeader title="Configurações do módulo" description="Políticas de comissionamento da empresa. Valem daqui para a frente: nada altera registros históricos." />
      <Section title="Políticas">
        <Card><SettingsForm s={settings} /></Card>
        <p className="mt-3 text-xs text-muted">Nome, logotipo e cor da empresa ficam em <Link className="underline underline-offset-2" href="/settings">Identidade visual</Link>. Planos, equipes, metas e regras de elegibilidade ficam nas respectivas telas.</p>
      </Section>
      <Section title="Quem acessa o quê" description="Administrador e Gestor vêm do papel na organização. Quem é «member» vira Vendedor ao ser vinculado a um vendedor, ou Financeiro quando você atribuir aqui. Consulta é o papel «viewer»: vê apenas agregados.">
        <div className="mb-3"><Alert tone="info">Para convidar novas pessoas veja docs/MEMBROS.md. O gestor de cada equipe é definido em Equipes; o vínculo login ↔ vendedor, em Vendedores.</Alert></div>
        <TableShell caption="Acessos" empty={members.length === 0}>
          <thead><tr><th className={TH}>Pessoa</th><th className={TH}>Papel</th><th className={TH}>Vendedor vinculado</th><th className={TH}>Perfil de comissões</th></tr></thead>
          <tbody className="divide-y divide-border">{members.map((m) => (
            <tr key={m.user_id}>
              <td className={TD}>{m.name ?? m.email ?? m.user_id}{m.name && m.email ? <span className="block text-xs text-muted">{m.email}</span> : null}</td><td className={TD}>{ROLE_LABELS[m.role as OrgRole] ?? m.role}</td>
              <td className={TD}>{m.seller_id ? <Link className="underline underline-offset-2" href={`/vendedores/${m.seller_id}`}>sim</Link> : '—'}</td>
              <td className={TD}>{m.role === 'member' ? <AccessForm userId={m.user_id} current={m.access} /> : <span className="text-muted">definido pelo papel</span>}</td>
            </tr>
          ))}</tbody>
        </TableShell>
      </Section>
    </>
  );
}
