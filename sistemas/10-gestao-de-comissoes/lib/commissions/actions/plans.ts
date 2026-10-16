'use server';

import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { bustAll, dbMessage, formObject, guarded, parse, type SaveResult } from '../action-kit';
import { assignSchema, normalizeRules, planCreateSchema, planDraftSchema, planUpdateSchema, publishSchema, idSchema } from '../schemas';

export async function createPlan(_: ActionState, fd: FormData): Promise<SaveResult> {
  const raw = formObject(fd);
  const p = parse(planCreateSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'createPlan', async ({ ctx, org }) => {
    const v = p.data;
    const { data, error } = await ctx.supabase.rpc('cm_create_plan', {
      p_org: org, p_name: v.name, p_description: v.description, p_basis: v.basis, p_eligibility: v.eligibility, p_type: v.plan_type, p_returns: v.returns_policy,
    });
    if (error) return fail(dbMessage(error, 'Já existe um plano ativo com este nome.'), undefined, raw);
    bustAll();
    const id = (data as { plan_id: string }).plan_id;
    return { ...succeed('Plano criado. Defina as regras e publique a versão.'), id, redirectTo: `/planos/${id}` };
  });
}

export async function updatePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(planUpdateSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'updatePlan', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_update_plan', { p_org: org, p_plan: p.data.id, p_name: p.data.name, p_description: p.data.description, p_status: p.data.status });
    if (error) return fail(dbMessage(error, 'Já existe um plano ativo com este nome.'), undefined, raw);
    bustAll();
    return succeed('Plano atualizado.');
  });
}

/** O editor envia o rascunho inteiro como JSON (campo `payload`); o servidor valida, converte textos brasileiros e grava. */
export async function savePlanDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  let json: unknown;
  try { json = JSON.parse(raw.payload ?? ''); } catch { return fail('Não foi possível ler o rascunho enviado.'); }
  const p = parse(planDraftSchema, json);
  if (!p.ok) return p.state;
  const norm = normalizeRules(p.data.rules);
  if (!norm.ok) return fail(norm.message);
  return guarded('admin', 'savePlanDraft', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_save_plan_draft', { p_org: org, p_version: p.data.version_id, p_config: { precedence: p.data.precedence, rules: norm.rules } });
    if (error) return fail(dbMessage(error));
    bustAll();
    return succeed('Rascunho salvo.');
  });
}

export async function publishVersion(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(publishSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'publishVersion', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_publish_plan_version', { p_org: org, p_version: p.data.version_id, p_valid_from: p.data.valid_from });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Versão publicada. Ela passa a valer na data informada e não pode mais ser editada.');
  });
}

export async function newVersion(_: ActionState, fd: FormData): Promise<ActionState & { redirectTo?: string }> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'newVersion', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_new_plan_version', { p_org: org, p_plan: p.data.id });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Nova versão criada a partir da última publicada. Ajuste as regras e publique com vigência futura.');
  });
}

export async function assignPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(assignSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'assignPlan', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_assign_plan', { p_org: org, p_seller: p.data.seller_id, p_plan: p.data.plan_id, p_valid_from: p.data.valid_from });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Plano atribuído. Vendas já apuradas continuam com o plano que valia na época.');
  });
}

/** Validação completa (a mesma da publicação) sem publicar: lista o que impede. */
export async function checkVersion(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'checkVersion', async ({ ctx, org }) => {
    const { data, error } = await ctx.supabase.rpc('cm_validate_plan_version', { p_org: org, p_version: p.data.id });
    if (error) return fail(dbMessage(error));
    const issues = (data ?? []) as string[];
    if (issues.length === 0) return succeed('Rascunho válido: pronto para publicar.');
    return fail(`${issues.length} problema(s): ${issues.slice(0, 4).join(' · ')}${issues.length > 4 ? ' …' : ''}`);
  });
}
