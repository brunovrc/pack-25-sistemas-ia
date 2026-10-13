import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiActor } from '@/lib/portal/api-auth';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
const BUCKET = 'portal-documents';
const SIGNED_URL_SECONDS = 60;
// Resposta única para «não existe», «não é seu», «arquivado» e «falha»: não revela se o documento existe.
const notFound = () => new NextResponse('Documento não encontrado.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

/**
 * Download/visualização. A autorização é do banco (pt_document_access: papel, visibilidade, arquivamento) e REGISTRA o acesso na trilha.
 * Só então emitimos uma URL assinada de 60 s, que nunca é guardada nem exibida: o navegador é redirecionado direto a ela.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await apiActor();
  if (!actor) return new NextResponse('Sessão inválida.', { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  if (!rateLimit(`download:${actor.userId}`, { limit: 120, windowMs: 60_000 }).allowed) return new NextResponse('Muitas requisições.', { status: 429 });

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const action = new URL(request.url).searchParams.get('action') === 'view' ? 'view' : 'download';

  const { data: path, error } = await actor.supabase.rpc('pt_document_access', { p_document: id, p_action: action });
  if (error || typeof path !== 'string') return notFound();

  const { data: meta } = await actor.supabase.from('documents').select('original_file_name').eq('id', id).maybeSingle();
  const fileName = (meta as { original_file_name: string } | null)?.original_file_name;
  const signed = await actor.supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, action === 'download' && fileName ? { download: fileName } : undefined);
  if (signed.error || !signed.data?.signedUrl) return notFound();
  return NextResponse.redirect(signed.data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
