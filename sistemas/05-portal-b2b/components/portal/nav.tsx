'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Link do menu do portal. «Início» (/portal) só fica ativo na própria página; os demais, também nas subpáginas. */
export function PortalNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === '/portal' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn('flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition', active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-black/5 dark:hover:bg-white/5')}
    >
      {children}
    </Link>
  );
}
