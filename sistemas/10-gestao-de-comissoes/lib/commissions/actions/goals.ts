'use server';

import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { parseMoneyToCents, parsePercentToRate } from '../engine';
import { bustAll, dbMessage, formObject, guarded, parse } from '../action-kit';
import { goalSchema, idSchema, prefSchema, simulationSaveSchema } from '../schemas';

const VALUE_TYPES = ['sold_value', 'received_value', 'product_value'];

export async function saveGoal(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(goalSchema, raw, raw);
  if (!p.ok) return p.state;
  const v = p.data;
  let target: string;
  try {
    if (VALUE_TYPES.includes(v.goal_type)) target = String(parseMoneyToCents(v.target));
    else if (/^\d{1,9}$/.test(v.target)) target = v.target;
    else return fail('Informe a meta como número inteiro.', { target: ['Use um número inteiro.'] }, raw);
    if (Number(target) <= 0) return fail('A meta deve ser maior que zero.', { target: ['Deve ser maior que zero.'] }, raw);
  } catch { return fail('Meta inválida (use o formato 1.234,56 para valores).', { target: ['Valor inválido.'] }, raw); }
  const bonus: unknown[] = [];
  if (v.bonus_plan_id) {
    try {
      const threshold = Number(v.threshold.replace(',', '.'));
      if (!(threshold > 0 && threshold <= 1000)) return fail('O limite de atingimento deve ficar entre 0 e 1000%.', { threshold: ['Entre 0 e 1000.'] }, raw);
      bonus.push({
        plan_id: v.bonus_plan_id, threshold_pct: String(threshold), bonus_type: v.bonus_type, award_timing: v.award_timing, distribution: v.distribution,
        ...(v.bonus_type === 'fixed' ? { bonus_amount_cents: parseMoneyToCents(v.bonus_amount) } : { bonus_rate: parsePercentToRate(v.bonus_rate) }),
      });
    } catch { return fail('Bônus inválido: confira o valor ou o percentual.', { bonus_amount: ['Valor inválido.'] }, raw); }
  }
  return guarded('manager', 'saveGoal', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_save_goal', {
      p_org: org, p_id: v.id,
      p_goal: { name: v.name, goal_type: v.goal_type, target_value: target, period_start: v.period_start, period_end: v.period_end, scope_type: v.scope_type, scope_reference_id: v.scope_reference_id, product_id: v.product_id },
      p_bonus: bonus,
    });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed(v.id ? 'Meta atualizada.' : 'Meta criada.');
  });
}

export async function archiveGoal(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'archiveGoal', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_archive_goal', { p_org: org, p_id: p.data.id, p_archive: raw.restore !== 'true' });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed(raw.restore === 'true' ? 'Meta reativada.' : 'Meta arquivada (o histórico continua).');
  });
}

// ----------------------------------------------------------------------------- avisos
export async function markNotificationsRead(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const id = raw.id && /^[0-9a-f-]{36}$/i.test(raw.id) ? raw.id : null;
  return guarded('read', 'markNotificationsRead', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_mark_notifications_read', { p_org: org, p_ids: id ? [id] : null });
    if (error) return fail(dbMessage(error));
    bustAll();
    return succeed(id ? 'Aviso marcado como lido.' : 'Todos os avisos foram marcados como lidos.');
  });
}

export async function setNotificationPref(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(prefSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('read', 'setNotificationPref', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_set_notification_pref', { p_org: org, p_type: p.data.type, p_enabled: p.data.enabled });
    if (error) return fail(dbMessage(error));
    bustAll();
    return succeed('Preferência salva.');
  });
}

// ----------------------------------------------------------------------------- simulações
export async function saveSimulation(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(simulationSaveSchema, raw, raw);
  if (!p.ok) return p.state;
  let input: unknown;
  let result: unknown;
  try { input = JSON.parse(p.data.input); result = JSON.parse(p.data.result); } catch { return fail('Simulação inválida.'); }
  return guarded('manager', 'saveSimulation', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_save_simulation', { p_org: org, p_name: p.data.name, p_input: input, p_result: result });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Simulação salva. Ela não gera lançamento nem altera vendas ou metas.');
  });
}

export async function deleteSimulation(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'deleteSimulation', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_delete_simulation', { p_org: org, p_id: p.data.id });
    if (error) return fail(dbMessage(error));
    bustAll();
    return succeed('Simulação removida.');
  });
}
