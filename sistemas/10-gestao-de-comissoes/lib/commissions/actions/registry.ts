'use server';

import { fail, succeed, type ActionState } from '@/lib/actions/result';
import { bustAll, dbMessage, formObject, guarded, parse } from '../action-kit';
import { accessSchema, categorySchema, customerSchema, idSchema, productSchema, sellerSchema, settingsSchema, teamSchema } from '../schemas';

// ----------------------------------------------------------------------------- equipes
export async function saveTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(teamSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'saveTeam', async ({ ctx, org }) => {
    const v = p.data;
    const { error } = await ctx.supabase.rpc('cm_save_team', { p_org: org, p_id: v.id, p_name: v.name, p_description: v.description, p_manager_user: v.manager_user, p_active: v.active });
    if (error) return fail(dbMessage(error, 'Já existe uma equipe com este nome.'), undefined, raw);
    bustAll();
    return succeed(v.id ? 'Equipe atualizada.' : 'Equipe criada.');
  });
}

// ----------------------------------------------------------------------------- vendedores
export async function saveSeller(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(sellerSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'saveSeller', async ({ ctx, org }) => {
    const v = p.data;
    const { error } = await ctx.supabase.rpc('cm_save_seller', {
      p_org: org, p_id: v.id, p_name: v.name, p_code: v.seller_code, p_type: v.seller_type, p_team: v.team_id, p_user: v.user_id, p_starts_at: v.starts_at, p_ends_at: v.ends_at, p_notes: v.notes, p_status: v.status, p_effective: v.effective,
    });
    if (error) return fail(dbMessage(error, 'Já existe vendedor com este código (ou este login já está vinculado).'), undefined, raw);
    bustAll();
    return succeed(v.id ? 'Vendedor atualizado.' : 'Vendedor cadastrado.');
  });
}

// ----------------------------------------------------------------------------- clientes, categorias, produtos
export async function saveCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(customerSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'saveCustomer', async ({ ctx, org }) => {
    const v = p.data;
    const { error } = await ctx.supabase.rpc('cm_save_customer', { p_org: org, p_id: v.id, p_name: v.name, p_legal: v.legal_name, p_doc: v.document_number, p_email: v.email, p_phone: v.phone });
    if (error) return fail(dbMessage(error, 'Já existe cliente com este documento.'), undefined, raw);
    bustAll();
    return succeed(v.id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  });
}

export async function archiveCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(idSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'archiveCustomer', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_archive_customer', { p_org: org, p_id: p.data.id, p_archive: raw.restore !== 'true' });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed(raw.restore === 'true' ? 'Cliente reativado.' : 'Cliente arquivado (o histórico continua).');
  });
}

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(categorySchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'saveCategory', async ({ ctx, org }) => {
    const v = p.data;
    const { error } = await ctx.supabase.rpc('cm_save_category', { p_org: org, p_id: v.id, p_name: v.name, p_description: v.description, p_active: v.active });
    if (error) return fail(dbMessage(error, 'Já existe categoria com este nome.'), undefined, raw);
    bustAll();
    return succeed(v.id ? 'Categoria atualizada.' : 'Categoria criada.');
  });
}

export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(productSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('manager', 'saveProduct', async ({ ctx, org }) => {
    const v = p.data;
    const { error } = await ctx.supabase.rpc('cm_save_product', { p_org: org, p_id: v.id, p_sku: v.sku, p_name: v.name, p_category: v.category_id, p_description: v.description, p_active: v.active });
    if (error) return fail(dbMessage(error, 'Já existe produto com este SKU.'), undefined, raw);
    bustAll();
    return succeed(v.id ? 'Produto atualizado.' : 'Produto cadastrado.');
  });
}

// ----------------------------------------------------------------------------- acesso e configurações
export async function setAccess(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(accessSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'setAccess', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_set_access', { p_org: org, p_user: p.data.user_id, p_profile: p.data.profile === 'none' ? null : p.data.profile });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Perfil de acesso atualizado.');
  });
}

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const p = parse(settingsSchema, raw, raw);
  if (!p.ok) return p.state;
  return guarded('admin', 'saveSettings', async ({ ctx, org }) => {
    const { error } = await ctx.supabase.rpc('cm_save_settings', { p_org: org, p_data: p.data });
    if (error) return fail(dbMessage(error), undefined, raw);
    bustAll();
    return succeed('Configurações salvas. Elas valem daqui para a frente; o histórico não muda.');
  });
}
