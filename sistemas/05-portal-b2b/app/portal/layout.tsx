import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { PortalNavLink } from '@/components/portal/nav';
import { Button, Select } from '@/components/ui/primitives';
import { requirePortalContext } from '@/lib/auth/session';
import { switchClientAccount } from '@/lib/portal/actions';
import { countUnread, loadSettings } from '@/lib/portal/data';
import { portalNav } from '@/lib/system.config';
import { safePrimary } from '@/lib/utils';

/** Portal exclusivo do cliente. Tudo aqui é revalidado: sessão, MFA (se houver fator), conta ativa e papel. O RLS decide o que cada tela mostra. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalContext();
  const { account } = ctx;
  const settings = await loadSettings(ctx, account.organization_id);
  const unread = await countUnread(ctx);
  const nav = portalNav.filter((i) => !i.admin || account.role === 'client_admin');
  const themeHref = `/portal-theme.css?c=${safePrimary(settings.primary_color).slice(1)}&s=${/^#[0-9a-fA-F]{6}$/.test(settings.secondary_color) ? settings.secondary_color.slice(1) : ''}`;

  const links = (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {nav.map((i) => (
        <PortalNavLink key={i.href} href={i.href}>
          {i.label}{i.href === '/portal/notificacoes' && unread > 0 ? <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-xs text-white" aria-label={`${unread} não lidas`}>{unread}</span> : null}
        </PortalNavLink>
      ))}
    </nav>
  );

  return (
    <>
      <link rel="stylesheet" href={themeHref} precedence="theme" />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Ir para o conteúdo</a>
      <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
        <aside className="hidden border-r border-border bg-card p-4 md:block">
          <Link href="/portal" className="mb-6 flex items-center gap-2 px-3 text-base font-semibold">
            <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded bg-primary text-sm text-primary-foreground">{settings.portal_name.slice(0, 1).toUpperCase()}</span>
            <span className="truncate">{settings.portal_name}</span>
          </Link>
          {links}
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:gap-3 sm:px-4">
            <details className="relative md:hidden">
              <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-md border border-border px-3 text-sm font-medium">Menu</summary>
              <div className="absolute left-0 top-12 z-40 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">{links}</div>
            </details>
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {ctx.accounts.length > 1 ? (
                <form action={switchClientAccount} className="flex items-center gap-2">
                  <label htmlFor="client_account_id" className="sr-only">Empresa</label>
                  <Select id="client_account_id" name="client_account_id" defaultValue={account.client_account_id} className="w-36 sm:w-52">
                    {ctx.accounts.map((a) => <option key={a.client_account_id} value={a.client_account_id}>{a.name}</option>)}
                  </Select>
                  <Button type="submit" variant="secondary">Trocar</Button>
                </form>
              ) : <span className="truncate text-sm font-medium">{account.name}</span>}
              <span className="hidden rounded-full border border-border px-2 py-0.5 text-xs text-muted sm:inline-flex">{account.role === 'client_admin' ? 'Administrador' : 'Usuário'}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm text-muted sm:block">{ctx.user.email}</span>
              <form action={signOut}><Button type="submit" variant="secondary">Sair</Button></form>
            </div>
          </header>
          <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          <footer className="border-t border-border px-4 py-4 text-xs text-muted sm:px-6">
            <p>{settings.footer_text ?? `${settings.portal_name}`}</p>
            {settings.contact_email || settings.contact_phone ? <p>Contato: {[settings.contact_email, settings.contact_phone].filter(Boolean).join(' · ')}</p> : null}
          </footer>
        </div>
      </div>
    </>
  );
}
