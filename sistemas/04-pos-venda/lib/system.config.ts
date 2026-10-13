// Ponto de extensão de cada sistema. O Core traz este arquivo com o padrão; cada sistema o
// sobrescreve (e o declara em .core-overrides) para definir nome, logotipo e navegação.
// Para personalizar para um cliente: troque `name`, substitua public/brand/logo.svg e ajuste `primaryNav`.
import type { OrgRole } from '@/lib/validation/org';

export type NavItem = { href: string; label: string; roles?: readonly OrgRole[] };

export const systemConfig: { name: string; logo: string; primaryNav: NavItem[] } = {
  name: 'Pack 25 Sistemas IA',
  logo: '/brand/logo.svg',
  // Itens do sistema, exibidos antes dos itens comuns do Core (Equipe, Privacidade, Auditoria, Configurações).
  primaryNav: [{ href: '/dashboard', label: 'Painel' }],
};
