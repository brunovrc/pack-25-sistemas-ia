import type { OrgRole } from '@/lib/validation/org';
import type { Named, Person } from './data';

// Espelha as políticas do banco (que continuam sendo a barreira real). Serve para esconder o que o papel não pode usar.
export const canWriteCrm = (role: OrgRole) => role !== 'viewer';
export const isManager = (role: OrgRole) => role === 'owner' || role === 'admin' || role === 'manager';
export const isCrmAdmin = (role: OrgRole) => role === 'owner' || role === 'admin';

export const WRITER_ROLES = ['owner', 'admin', 'manager', 'member'] as const;
export const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;
export const ADMIN_ROLES = ['owner', 'admin'] as const;

export const personOptions = (people: Person[]) => people.map((p) => ({ value: p.user_id, label: p.label }));
export const activeOptions = (rows: Named[]) => rows.filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }));

export function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
