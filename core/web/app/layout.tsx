import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Pack 25 Sistemas IA', template: '%s · Pack 25 Sistemas IA' },
  description: 'Núcleo de autenticação, organização e privacidade do Pack 25 Sistemas IA.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A CSP usa nonce por requisição (proxy.ts): toda página precisa ser renderizada dinamicamente.
  await connection();
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
