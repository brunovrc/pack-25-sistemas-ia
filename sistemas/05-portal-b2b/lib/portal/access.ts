import type { OrgRole } from '@/lib/validation/org';

// Espelha as políticas do banco (que continuam sendo a barreira real). Serve para esconder o que o papel não pode usar.
export const canWrite = (role: OrgRole) => role !== 'viewer';
export const isManager = (role: OrgRole) => role === 'owner' || role === 'admin' || role === 'manager';
export const isAdmin = (role: OrgRole) => role === 'owner' || role === 'admin';

export function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const WRITER_ROLES = ['owner', 'admin', 'manager', 'member'] as const;
export const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;
export const ADMIN_ROLES = ['owner', 'admin'] as const;

/** Só aceita valores de uma lista fechada vindos da URL. */
export function pick<T extends string>(value: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(value) ? (value as T) : '';
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOrEmpty = (v: string) => (UUID.test(v) ? v : '');
