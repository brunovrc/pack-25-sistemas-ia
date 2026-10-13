// Configuração do Portal de Clientes B2B. Para personalizar para uma prestadora:
//  1. troque `name`;  2. substitua public/brand/logo.svg;  3. ajuste a navegação em `primaryNav`.
// O nome, as cores e o texto do portal DO CLIENTE vêm de «Configurações do portal» (white-label), não deste arquivo.
// Este arquivo é do sistema (listado em .core-overrides): o sync-core nunca o sobrescreve.
import type { OrgRole } from '@/lib/validation/org';

export type NavItem = { href: string; label: string; roles?: readonly OrgRole[] };

export const systemConfig: { name: string; logo: string; primaryNav: NavItem[] } = {
  name: 'Portal de Clientes B2B',
  logo: '/brand/logo.svg',
  primaryNav: [
    { href: '/dashboard', label: 'Painel' },
    { href: '/clientes', label: 'Clientes' },
    { href: '/solicitacoes', label: 'Solicitações' },
    { href: '/entregas', label: 'Entregas' },
    { href: '/documentos', label: 'Documentos' },
    { href: '/comunicados', label: 'Comunicados' },
    { href: '/relatorios', label: 'Relatórios', roles: ['owner', 'admin', 'manager'] },
    { href: '/notificacoes', label: 'Notificações' },
    { href: '/convites', label: 'Convites da equipe', roles: ['owner', 'admin'] },
    { href: '/configuracoes', label: 'Configurações do portal', roles: ['owner', 'admin'] },
  ],
};

/** Navegação do portal do cliente. */
export const portalNav: Array<{ href: string; label: string; admin?: boolean }> = [
  { href: '/portal', label: 'Início' },
  { href: '/portal/solicitacoes', label: 'Solicitações' },
  { href: '/portal/entregas', label: 'Entregas' },
  { href: '/portal/documentos', label: 'Documentos' },
  { href: '/portal/comunicados', label: 'Comunicados' },
  { href: '/portal/equipe', label: 'Usuários da empresa', admin: true },
  { href: '/portal/notificacoes', label: 'Notificações' },
];
