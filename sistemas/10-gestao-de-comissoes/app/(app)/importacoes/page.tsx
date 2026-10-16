import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { Section, TableShell, TD, TDR, TH, THR } from '@/components/cm/bits';
import { ImportWizard } from '@/components/cm/import-wizard';
import { StatusPill } from '@/components/cm/page-bits';
import { dateBR } from '@/lib/commissions/format';
import { IMPORT_TYPE_LABEL } from '@/lib/commissions/labels';
import { pageCtx } from '@/lib/commissions/page';

export const metadata: Metadata = { title: 'Importações' };

export default async function ImportsPage() {
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { data } = await pc.ctx.supabase.from('import_jobs').select('id, file_name, import_type, status, total_rows, accepted_rows, rejected_rows, created_at').order('created_at', { ascending: false }).limit(30);
  const jobs = (data ?? []) as Array<{ id: string; file_name: string; import_type: string; status: string; total_rows: number; accepted_rows: number; rejected_rows: number; created_at: string }>;
  const ids = jobs.filter((j) => j.rejected_rows > 0).map((j) => j.id);
  const { data: er } = ids.length ? await pc.ctx.supabase.from('import_row_errors').select('import_job_id, row_number, error_code, error_message').in('import_job_id', ids).order('row_number').limit(300) : { data: [] };
  const errs = (er ?? []) as Array<{ import_job_id: string; row_number: number; error_code: string; error_message: string }>;
  return (
    <>
      <PageHeader title="Importações" description="Traga clientes, vendedores, vendas, recebimentos e metas de CSV. Duplicidades nunca entram em silêncio; vendas importadas não geram comissão aprovada: o financeiro calcula e a gestão aprova." />
      <ImportWizard canReceipts={pc.perms.manageReceipts} />
      <Section title="Histórico">
        <TableShell caption="Importações realizadas" empty={jobs.length === 0} emptyText="Nenhuma importação ainda.">
          <thead><tr><th className={TH}>Quando</th><th className={TH}>Arquivo</th><th className={TH}>Tipo</th><th className={TH}>Situação</th><th className={THR}>Linhas</th><th className={THR}>Aceitas</th><th className={THR}>Rejeitadas</th></tr></thead>
          <tbody className="divide-y divide-border">{jobs.map((j) => (
            <tr key={j.id}><td className={TD}>{dateBR(j.created_at)}</td><td className={TD}>{j.file_name}</td><td className={TD}>{IMPORT_TYPE_LABEL[j.import_type]}</td><td className={TD}><StatusPill kind="closing" status={j.status === 'completed' ? 'closed' : j.status === 'failed' ? 'cancelled' : 'draft'} /></td><td className={TDR}>{j.total_rows}</td><td className={TDR}>{j.accepted_rows}</td><td className={TDR}>{j.rejected_rows}</td></tr>
          ))}</tbody>
        </TableShell>
        {errs.length > 0 ? (
          <details className="mt-3 text-sm"><summary className="cursor-pointer">Erros das importações recentes ({errs.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">{errs.map((e, i) => <li key={i}>Linha {e.row_number} · {e.error_code}: {e.error_message}</li>)}</ul></details>
        ) : null}
      </Section>
    </>
  );
}
