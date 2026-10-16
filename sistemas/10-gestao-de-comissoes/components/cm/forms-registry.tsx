'use client';

import { archiveCustomer, saveCategory, saveCustomer, saveProduct, saveSeller, saveTeam, setAccess, saveSettings } from '@/lib/commissions/actions/registry';
import { SELLER_STATUS_LABEL, SELLER_TYPE_LABEL } from '@/lib/commissions/labels';
import type { Opt } from './bits';
import { ActionButton, AreaF, CheckF, CmForm, SelectF, TextF } from './fields';

const entries = (o: Record<string, string>): Opt[] => Object.entries(o).map(([value, label]) => ({ value, label }));

export function TeamForm({ team, managers }: { team?: { id: string; name: string; description: string | null; manager_user_id: string | null; active: boolean }; managers: Opt[] }) {
  return (
    <CmForm action={saveTeam} submit={team ? 'Salvar equipe' : 'Criar equipe'} reset={!team} className="grid gap-4 sm:grid-cols-4" hidden={team ? { id: team.id } : undefined}>
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome da equipe" def={team?.name} required max={80} span />
          <SelectF f={f} name="manager_user" label="Gestor da equipe" def={team?.manager_user_id} opts={managers} placeholder="Sem gestor definido" hint="O gestor só enxerga as comissões desta equipe." span />
          <TextF f={f} name="description" label="Descrição" def={team?.description} max={300} span />
          <CheckF f={f} name="active" label="Equipe ativa" def={team ? team.active : true} />
        </>
      )}
    </CmForm>
  );
}

export function SellerForm({ seller, teams, users, canLink, canTeam }: {
  seller?: { id: string; name: string; seller_code: string; seller_type: string; status: string; team_id: string | null; user_id: string | null; starts_at: string; ends_at: string | null; notes: string | null };
  teams: Opt[]; users: Opt[]; canLink: boolean; canTeam: boolean;
}) {
  return (
    <CmForm action={saveSeller} submit={seller ? 'Salvar vendedor' : 'Cadastrar vendedor'} reset={!seller} className="grid gap-4 sm:grid-cols-4" hidden={seller ? { id: seller.id } : undefined}>
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome" def={seller?.name} required max={120} span />
          <TextF f={f} name="seller_code" label="Código" def={seller?.seller_code} required max={30} hint="Letras, números, ponto, hífen ou sublinhado." />
          <SelectF f={f} name="seller_type" label="Tipo" def={seller?.seller_type ?? 'internal'} opts={entries(SELLER_TYPE_LABEL)} />
          <SelectF f={f} name="team_id" label="Equipe" def={seller?.team_id} opts={teams} placeholder="Sem equipe" hint={canTeam ? undefined : 'Você só aloca em equipes que gere.'} />
          <SelectF f={f} name="status" label="Status" def={seller?.status ?? 'active'} opts={entries(SELLER_STATUS_LABEL)} />
          <TextF f={f} name="starts_at" label="Início" type="date" def={seller?.starts_at} required />
          <TextF f={f} name="ends_at" label="Encerramento (opcional)" type="date" def={seller?.ends_at} />
          {seller ? <TextF f={f} name="effective" label="Mudança de equipe vale a partir de" type="date" hint="Em branco = hoje. Nunca altera comissões já apuradas." /> : null}
          {canLink ? <SelectF f={f} name="user_id" label="Login vinculado (opcional)" def={seller?.user_id} opts={users} placeholder="Sem login (apenas gestão)" hint="Representantes externos podem existir sem conta." span /> : null}
          <AreaF f={f} name="notes" label="Observações internas" def={seller?.notes} max={1000} />
        </>
      )}
    </CmForm>
  );
}

export function CustomerForm({ customer }: { customer?: { id: string; name: string; legal_name: string | null; document_number: string | null; email: string | null; phone: string | null } }) {
  return (
    <CmForm action={saveCustomer} submit={customer ? 'Salvar cliente' : 'Cadastrar cliente'} reset={!customer} className="grid gap-4 sm:grid-cols-4" hidden={customer ? { id: customer.id } : undefined}>
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome" def={customer?.name} required max={160} span />
          <TextF f={f} name="legal_name" label="Razão social" def={customer?.legal_name} max={200} span />
          <TextF f={f} name="document_number" label="CPF/CNPJ" def={customer?.document_number} max={20} />
          <TextF f={f} name="email" label="E-mail" def={customer?.email} max={200} type="email" />
          <TextF f={f} name="phone" label="Telefone" def={customer?.phone} max={40} />
        </>
      )}
    </CmForm>
  );
}

export function ArchiveCustomerButton({ id, archived }: { id: string; archived: boolean }) {
  return <ActionButton action={archiveCustomer} fields={archived ? { id, restore: 'true' } : { id }} label={archived ? 'Reativar' : 'Arquivar'} confirm={archived ? undefined : 'Arquivar este cliente? O histórico de vendas continua.'} />;
}

export function CategoryForm({ category }: { category?: { id: string; name: string; description: string | null; active: boolean } }) {
  return (
    <CmForm action={saveCategory} submit={category ? 'Salvar categoria' : 'Criar categoria'} reset={!category} className="grid gap-4 sm:grid-cols-4" hidden={category ? { id: category.id } : undefined}>
      {(f) => (
        <>
          <TextF f={f} name="name" label="Nome" def={category?.name} required max={80} span />
          <TextF f={f} name="description" label="Descrição" def={category?.description} max={300} span />
          <CheckF f={f} name="active" label="Ativa" def={category ? category.active : true} />
        </>
      )}
    </CmForm>
  );
}

export function ProductForm({ product, categories }: { product?: { id: string; sku: string; name: string; category_id: string | null; description: string | null; active: boolean }; categories: Opt[] }) {
  return (
    <CmForm action={saveProduct} submit={product ? 'Salvar produto' : 'Cadastrar produto'} reset={!product} className="grid gap-4 sm:grid-cols-4" hidden={product ? { id: product.id } : undefined}>
      {(f) => (
        <>
          <TextF f={f} name="sku" label="SKU" def={product?.sku} required max={40} />
          <TextF f={f} name="name" label="Nome" def={product?.name} required max={160} span />
          <SelectF f={f} name="category_id" label="Categoria" def={product?.category_id} opts={categories} placeholder="Sem categoria" />
          <TextF f={f} name="description" label="Descrição" def={product?.description} max={500} span />
          <CheckF f={f} name="active" label="Ativo" def={product ? product.active : true} />
        </>
      )}
    </CmForm>
  );
}

export function AccessForm({ userId, current }: { userId: string; current: string | null }) {
  return (
    <CmForm action={setAccess} submit="Salvar" reset={false} className="flex flex-wrap items-end gap-3" hidden={{ user_id: userId }}>
      {(f) => <SelectF f={f} name="profile" label="Perfil" def={current ?? 'none'} opts={[{ value: 'none', label: 'Automático (vendedor se vinculado)' }, { value: 'finance', label: 'Financeiro' }, { value: 'seller', label: 'Vendedor' }]} />}
    </CmForm>
  );
}

export function SettingsForm({ s }: {
  s: { timezone: string; date_format: string; negative_balance_policy: string; adjustment_approval_required: boolean; segregation_of_duties: boolean; allow_payout_over_balance: boolean; allow_receipt_over_sale: boolean; statement_template: string; statement_footer: string | null };
}) {
  return (
    <CmForm action={saveSettings} submit="Salvar configurações" reset={false} className="grid gap-4 sm:grid-cols-4">
      {(f) => (
        <>
          <TextF f={f} name="timezone" label="Fuso horário" def={s.timezone} required max={60} hint="Ex.: America/Sao_Paulo" span />
          <SelectF f={f} name="date_format" label="Formato de data" def={s.date_format} opts={[{ value: 'DD/MM/YYYY', label: 'DD/MM/AAAA' }, { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD' }]} />
          <SelectF f={f} name="negative_balance_policy" label="Saldo negativo no fechamento" def={s.negative_balance_policy} opts={[{ value: 'carry_forward', label: 'Compensar no período seguinte' }, { value: 'manual_review', label: 'Exigir análise manual (bloqueia o fechamento)' }]}
            hint="Descontos futuros sobre remuneração podem ter limites legais/contratuais. Não presumimos que sejam sempre permitidos." span />
          <CheckF f={f} name="adjustment_approval_required" label="Ajustes manuais exigem aprovação" def={s.adjustment_approval_required} />
          <CheckF f={f} name="segregation_of_duties" label="Segregação de funções (quem calcula/cria não aprova)" def={s.segregation_of_duties} />
          <CheckF f={f} name="allow_payout_over_balance" label="Permitir pagamento acima do saldo aprovado" def={s.allow_payout_over_balance} />
          <CheckF f={f} name="allow_receipt_over_sale" label="Permitir recebimento acima do valor da venda" def={s.allow_receipt_over_sale} />
          <SelectF f={f} name="statement_template" label="Modelo do demonstrativo" def={s.statement_template} opts={[{ value: 'standard', label: 'Padrão (detalhado)' }, { value: 'compact', label: 'Compacto' }]} />
          <TextF f={f} name="statement_footer" label="Rodapé do demonstrativo" def={s.statement_footer} max={300} span />
        </>
      )}
    </CmForm>
  );
}
