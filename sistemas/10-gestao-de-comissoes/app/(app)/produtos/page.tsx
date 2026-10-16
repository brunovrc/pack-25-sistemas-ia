import type { Metadata } from 'next';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Disclosure, Pagination, Section, TableShell, TD, TH } from '@/components/cm/bits';
import { CategoryForm, ProductForm } from '@/components/cm/forms-registry';
import { FInput, FSelect, FilterForm } from '@/components/cm/page-bits';
import { pageCtx } from '@/lib/commissions/page';
import { PAGE_SIZE, one, pageFrom, safeSearch, uuidOrNull, type SearchParams } from '@/lib/commissions/query';

export const metadata: Metadata = { title: 'Catálogo' };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const pc = await pageCtx(['admin', 'finance', 'manager']);
  const { ctx } = pc;
  const page = pageFrom(one(sp.page));
  const q = safeSearch(one(sp.q));
  const cat = uuidOrNull(one(sp.categoria));
  const { data: cats } = await ctx.supabase.from('product_categories').select('id, name, description, active').order('name');
  const categories = (cats ?? []) as Array<{ id: string; name: string; description: string | null; active: boolean }>;
  let query = ctx.supabase.from('products').select('id, sku, name, category_id, description, active', { count: 'exact' }).order('name');
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  if (cat) query = query.eq('category_id', cat);
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const products = (data ?? []) as Array<{ id: string; sku: string; name: string; category_id: string | null; description: string | null; active: boolean }>;
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const catOpts = categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }));
  return (
    <>
      <PageHeader title="Catálogo" description="Catálogo mínimo só para classificar vendas e permitir regras por produto e categoria. Não é um controle de estoque." />
      <Section title="Categorias">
        <div className="mb-3"><Disclosure summary="Criar categoria" tone="primary"><CategoryForm /></Disclosure></div>
        <TableShell caption="Categorias" empty={categories.length === 0} emptyText="Nenhuma categoria. Crie uma para criar regras por categoria.">
          <thead><tr><th className={TH}>Categoria</th><th className={TH}>Situação</th><th className={TH}><span className="sr-only">Ações</span></th></tr></thead>
          <tbody className="divide-y divide-border">{categories.map((c) => (
            <tr key={c.id}><td className={TD}><span className="font-medium">{c.name}</span>{c.description ? <span className="block text-xs text-muted">{c.description}</span> : null}</td><td className={TD}>{c.active ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}</td><td className={TD}><Disclosure summary="Editar"><CategoryForm category={c} /></Disclosure></td></tr>
          ))}</tbody>
        </TableShell>
      </Section>
      <Section title="Produtos">
        <div className="mb-3"><Disclosure summary="Cadastrar produto" tone="primary"><ProductForm categories={catOpts} /></Disclosure></div>
        <FilterForm clear="/produtos">
          <FInput name="q" label="Buscar por nome ou SKU" sp={sp} /><FSelect name="categoria" label="Categoria" sp={sp} opts={categories.map((c) => ({ value: c.id, label: c.name }))} />
        </FilterForm>
        <TableShell caption="Produtos" empty={products.length === 0}>
          <thead><tr><th className={TH}>SKU</th><th className={TH}>Produto</th><th className={TH}>Categoria</th><th className={TH}>Situação</th><th className={TH}><span className="sr-only">Ações</span></th></tr></thead>
          <tbody className="divide-y divide-border">{products.map((p) => (
            <tr key={p.id}><td className={TD}>{p.sku}</td><td className={TD}>{p.name}</td><td className={TD}>{p.category_id ? catName.get(p.category_id) ?? '—' : '—'}</td><td className={TD}>{p.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}</td><td className={TD}><Disclosure summary="Editar"><ProductForm product={p} categories={catOpts} /></Disclosure></td></tr>
          ))}</tbody>
        </TableShell>
        <Pagination base="/produtos" sp={sp} page={page} total={count ?? 0} />
      </Section>
    </>
  );
}
