import type { Metadata } from 'next';
import Link from 'next/link';
import { AcceptInviteButton } from '@/components/portal/invite-forms';
import { getUser } from '@/lib/auth/session';
import { inviteTokenSchema } from '@/lib/portal/validation';

export const metadata: Metadata = { title: 'Convite', robots: { index: false, follow: false } };

/**
 * Página PÚBLICA (ver lib/security/public-prefixes.ts). Ela não consulta o banco: não revela se o convite existe, expirou ou é de outro e-mail.
 * Quem não está logado entra (ou cria a conta) e volta aqui; quem está logado aceita. A validação real é a função pt_invite_accept
 * (hash do token, e-mail do convite = e-mail da conta, validade, uso único), com limite de tentativas por usuário.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = inviteTokenSchema.safeParse(token).success;
  const user = valid ? await getUser() : null;
  const here = `/convite/${token}`;
  const link = 'inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium';
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Você recebeu um convite</h1>
        {!valid ? (
          <p role="alert" className="text-sm text-danger">Convite inválido ou expirado. Peça um novo a quem convidou você.</p>
        ) : user ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Você está entrando como <strong>{user.email}</strong>. O convite só funciona se foi enviado para este mesmo e-mail.</p>
            <AcceptInviteButton token={token} />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">Entre na sua conta para aceitar. Se ainda não tem uma, crie com o <strong>mesmo e-mail</strong> que recebeu o convite e depois abra este link novamente.</p>
            <div className="flex flex-wrap gap-2">
              <Link className={`${link} bg-primary text-primary-foreground hover:opacity-90`} href={`/login?next=${encodeURIComponent(here)}`}>Já tenho conta: entrar</Link>
              <Link className={`${link} border border-border hover:bg-black/5 dark:hover:bg-white/5`} href="/signup">Criar conta</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
