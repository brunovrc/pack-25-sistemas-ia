'use server';

import { z } from 'zod';
import { actionContext } from '@/lib/auth/session';
import { logEvent } from '@/lib/log';
import { rateLimit } from '@/lib/security/rate-limit';
import { bustAll, LEVELS } from '../action-kit';
import { IMPORT_TYPES, MAX_BYTES } from '../import-core';
import { runImport, type ImportReport } from '../importer';
import { loadAccess } from '../page';
import type { Profile } from '../labels';

const inputSchema = z.object({
  type: z.enum(IMPORT_TYPES), text: z.string().max(MAX_BYTES + 1024), fileName: z.string().max(200),
  mapping: z.record(z.string(), z.number().int().min(0).max(200).nullable()),
  options: z.object({ confirmSales: z.boolean(), createCustomers: z.boolean(), partial: z.boolean() }), apply: z.boolean(),
});
export type ImportInput = z.infer<typeof inputSchema>;
export type ImportResult = { error: string } | { report: ImportReport };

/** Valida (apply=false) ou importa (apply=true). Autoriza no servidor; o banco reaplica o perfil em cada função chamada. */
export async function processImport(input: ImportInput): Promise<ImportResult> {
  const p = inputSchema.safeParse(input);
  if (!p.success) return { error: 'Dados da importação inválidos.' };
  const a = await actionContext();
  if ('error' in a) return { error: a.error.message ?? 'Sessão expirada.' };
  const org = a.ctx.membership.organization_id;
  const access = await loadAccess(org);
  if (!access.profile || !(LEVELS.manager as readonly Profile[]).includes(access.profile)) return { error: 'Você não tem permissão para importar dados.' };
  if (p.data.type === 'receipts' && !(LEVELS.finance as readonly Profile[]).includes(access.profile)) return { error: 'Somente o financeiro registra recebimentos.' };
  if (p.data.type === 'sellers' && access.profile === 'manager') { /* gestor só aloca em equipes que gere: o banco recusa as demais */ }
  if (!rateLimit(`import:${a.ctx.user.id}`, { limit: 20, windowMs: 60_000 }).allowed) return { error: 'Muitas importações em pouco tempo. Aguarde um minuto.' };
  try {
    const report = await runImport(a.ctx, org, p.data);
    if (p.data.apply) bustAll();
    return { report };
  } catch (e) {
    logEvent('error', 'cm_import_failed', { name: e instanceof Error ? e.name : 'unknown' });
    return { error: 'A importação falhou. Nenhum dado parcial foi aprovado ou calculado.' };
  }
}
