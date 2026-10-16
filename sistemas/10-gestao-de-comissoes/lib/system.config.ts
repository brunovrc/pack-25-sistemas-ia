// Configuração da Gestão de Comissões. Para personalizar para uma empresa:
//  1. troque `name`;  2. substitua public/brand/logo.svg;  3. ajuste a navegação em `groups`.
// Perfis (ver docs/PERMISSIONS.md): owner/admin = Administrador · manager = Gestor comercial · member = Financeiro ou Vendedor · viewer = Consulta.
// Este arquivo é do sistema (listado em .core-overrides): o sync-core nunca o sobrescreve. Itens de menu entram junto com as telas reais.
import type { Profile } from '@/lib/commissions/labels';

export type NavItem = { href: string; label: string; profiles?: readonly Profile[] };
export type NavGroup = { title: string; items: NavItem[] };

const MGMT: readonly Profile[] = ['admin', 'finance', 'manager'];
const STAFF: readonly Profile[] = ['admin', 'finance', 'manager', 'seller'];

export const systemConfig: { name: string; logo: string; groups: NavGroup[] } = {
  name: 'Gestão de Comissões',
  logo: '/brand/logo.svg',
  groups: [
    { title: 'Visão geral', items: [{ href: '/dashboard', label: 'Painel' }, { href: '/relatorios', label: 'Relatórios', profiles: ['admin', 'finance', 'manager', 'viewer'] }] },
    {
      title: 'Cadastros',
      items: [
        { href: '/vendedores', label: 'Vendedores', profiles: MGMT }, { href: '/equipes', label: 'Equipes', profiles: MGMT },
        { href: '/clientes', label: 'Clientes', profiles: MGMT }, { href: '/produtos', label: 'Catálogo', profiles: MGMT },
      ],
    },
    { title: 'Vendas', items: [{ href: '/vendas', label: 'Vendas', profiles: STAFF }, { href: '/recebimentos', label: 'Recebimentos', profiles: STAFF }, { href: '/importacoes', label: 'Importações', profiles: MGMT }] },
    {
      title: 'Regras',
      items: [
        { href: '/planos', label: 'Planos', profiles: STAFF }, { href: '/regras', label: 'Regras', profiles: MGMT }, { href: '/simulador', label: 'Simulador', profiles: MGMT }, { href: '/metas', label: 'Metas e bônus', profiles: STAFF },
      ],
    },
    {
      title: 'Comissões',
      items: [
        { href: '/comissoes', label: 'Extrato de comissões', profiles: STAFF }, { href: '/aprovacoes', label: 'Aprovações', profiles: MGMT }, { href: '/contestacoes', label: 'Contestações', profiles: STAFF },
        { href: '/fechamentos', label: 'Fechamentos', profiles: STAFF }, { href: '/pagamentos', label: 'Pagamentos', profiles: STAFF }, { href: '/demonstrativos', label: 'Demonstrativos', profiles: STAFF },
      ],
    },
    { title: 'Sistema', items: [{ href: '/notificacoes', label: 'Avisos' }, { href: '/configuracoes', label: 'Configurações do módulo', profiles: ['admin'] }] },
  ],
};
