import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui/primitives';
import { ImportLeadsForm } from '@/components/crm/import-form';
import { requireContext } from '@/lib/auth/session';
import { loadOptions } from '@/lib/crm/data';
import { isManager, personOptions, WRITER_ROLES } from '@/lib/crm/access';

export const metadata: Metadata = { title: 'Importar leads' };

export default async function ImportLeadsPage() {
  const ctx = await requireContext(WRITER_ROLES);
  const options = await loadOptions(ctx);
  return (
    <>
      <PageHeader title="Importar leads" description="Envie uma planilha CSV. Primeiro valide: o relatório mostra duplicados e erros sem gravar nada." />
      <p className="mb-4 text-sm"><Link className="underline" href="/leads">← Voltar aos leads</Link></p>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card><ImportLeadsForm people={personOptions(options.people)} canPickOwner={isManager(ctx.membership.role)} defaultOwner={ctx.user.id} /></Card>
        <Card title="Como preparar o arquivo">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Primeira linha com os cabeçalhos. Obrigatório: <strong>nome</strong>.</li>
            <li>Opcionais: empresa, e-mail, telefone, cargo, origem, temperatura (frio, morno, quente), status e observações.</li>
            <li>A <strong>origem</strong> precisa ter o mesmo nome de uma origem cadastrada; senão o lead entra sem origem (com aviso).</li>
            <li>Leads com e-mail já cadastrado (ou repetido no arquivo) são ignorados como duplicados.</li>
            <li>Colunas desconhecidas são ignoradas.</li>
          </ul>
          <p className="mt-3 text-sm"><Link className="underline" href="/export/lead-template" prefetch={false}>Baixar planilha modelo</Link></p>
        </Card>
      </div>
    </>
  );
}
