// Configuração do CRM Completo. Para personalizar para um cliente:
//  1. troque `name`;  2. substitua public/brand/logo.svg;  3. ajuste a navegação em `primaryNav`.
// Este arquivo é do sistema (listado em .core-overrides): o sync-core nunca o sobrescreve.
import type { OrgRole } from '@/lib/validation/org';

export type NavItem = { href: string; label: string; roles?: readonly OrgRole[] };

export const systemConfig: { name: string; logo: string; primaryNav: NavItem[] } = {
  name: 'CRM Completo',
  logo: '/brand/logo.svg',
  primaryNav: [
    { href: '/dashboard', label: 'Painel' },
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/leads', label: 'Leads' },
    { href: '/opportunities', label: 'Oportunidades' },
    { href: '/companies', label: 'Empresas' },
    { href: '/contacts', label: 'Contatos' },
    { href: '/activities', label: 'Atividades' },
    { href: '/goals', label: 'Metas' },
    { href: '/reports', label: 'Relatórios' },
    { href: '/crm-settings', label: 'Configurações do CRM', roles: ['owner', 'admin'] },
  ],
};
