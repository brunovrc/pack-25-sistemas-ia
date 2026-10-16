'use server';

import { createHash } from 'node:crypto';
import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { bustAll, dbMessage, formObject, guarded, parse } from '../action-kit';
import { STATEMENT_COLS, loadStatement, statementSummary } from '../statement';
import { finish, heading, kv, para, startDoc, table } from '../pdf';
import { dateBR } from '../format';
import { idSchema } from '../schemas';
import { nowMs } from '@/lib/time';
import { civilDateIn } from '../query';
import type { Row } from '../csv';

/** Gera uma NOVA versão do demonstrativo em PDF (fechamento concluído), grava no Storage privado e registra hash e versão. */
export async function generateStatement(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('finance', 'generateStatement', async ({ ctx, org }) => {
    const s = await loadStatement(ctx, org, p.data.id);
    if (!s) return fail('Fechamento não encontrado.');
    if (s.status !== 'closed') return fail('O demonstrativo só é gerado para fechamento concluído.');
    const { count } = await ctx.supabase.from('commission_statements').select('id', { count: 'exact', head: true }).eq('closing_id', p.data.id);
    const version = (count ?? 0) + 1;
    const path = `${org}/${s.sellerId}/${p.data.id}-v${version}.pdf`;
    const { data: tz } = await ctx.supabase.from('commission_settings').select('timezone').eq('organization_id', org).maybeSingle();
    const today = civilDateIn(new Date(nowMs()), (tz as { timezone?: string } | null)?.timezone ?? 'America/Sao_Paulo');

    const doc = await startDoc(`${s.orgName} · Demonstrativo de comissões`, `Demonstrativo gerencial v${version} emitido em ${dateBR(today)} — não substitui recibo salarial nem cálculo trabalhista`);
    heading(doc, 'Demonstrativo de comissões');
    kv(doc, statementSummary(s));
    para(doc, 'Controle gerencial de comissionamento. Não é folha de pagamento, não calcula encargos trabalhistas nem fiscais e não afirma conformidade jurídica. Valores pagos foram registrados pela empresa; o sistema não executa pagamentos.', 8, undefined);
    const cols = s.template === 'compact' ? STATEMENT_COLS.filter((c) => ['date', 'sale', 'type', 'amount', 'status'].includes(c.key)) : STATEMENT_COLS;
    table(doc, cols, s.lines as unknown as Row[], { totals: { date: '', sale: 'Total dos lançamentos', amount: s.lines.reduce((a, l) => a + l.amount, 0) } });
    if (s.footer) para(doc, s.footer, 8);
    const bytes = await finish(doc);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const up = await ctx.supabase.storage.from('statements').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (up.error) return fail('Não foi possível armazenar o PDF. Tente novamente.');
    const { error } = await ctx.supabase.rpc('cm_register_statement', { p_org: org, p_closing: p.data.id, p_path: path, p_hash: hash });
    if (error) return fail(dbMessage(error));
    bustAll();
    return succeed(`Demonstrativo v${version} gerado e armazenado em área privada.`);
  });
}
