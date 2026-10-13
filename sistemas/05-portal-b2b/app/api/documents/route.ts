import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/portal/data';
import { apiActor } from '@/lib/portal/api-auth';
import { safeFileName, sniffMime, titleFromFile } from '@/lib/portal/uploads';
import { uploadMetaSchema } from '@/lib/portal/validation';
import { messageForDbError } from '@/lib/actions/result';
import { logEvent } from '@/lib/log';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
const BUCKET = 'portal-documents';
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/**
 * Envio de documento. Fluxo: sessão → limites → TIPO REAL pelos bytes → arquivo ao Storage (com a sessão do usuário, sob as
 * políticas do bucket) → registro no banco (pt_document_register, que revalida conta, tamanho, tipo e visibilidade).
 * Se o registro falhar, o objeto recém-enviado é removido. O nome original nunca vira caminho: o caminho é <org>/<cliente>/<uuid>.
 */
export async function POST(request: Request) {
  const actor = await apiActor();
  if (!actor) return json({ ok: false, message: 'Sessão inválida. Entre novamente.' }, 401);
  if (!rateLimit(`upload:${actor.userId}`, { limit: 30, windowMs: 10 * 60_000 }).allowed) return json({ ok: false, message: 'Muitos envios em pouco tempo. Aguarde alguns minutos.' }, 429);

  const settings = await loadSettings(actor, actor.organizationId);
  const maxBytes = settings.doc_max_mb * 1_048_576;
  // Recusa cedo pelo cabeçalho (o limite real é conferido de novo abaixo e no banco).
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes + 64 * 1024) return json({ ok: false, message: `O arquivo excede o limite de ${settings.doc_max_mb} MB.` }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: 'Envio inválido.' }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return json({ ok: false, message: 'Escolha um arquivo.' }, 400);
  if (file.size > maxBytes) return json({ ok: false, message: `O arquivo excede o limite de ${settings.doc_max_mb} MB.` }, 413);

  // campos ausentes ou vazios usam o padrão do esquema (ex.: visibilidade «compartilhado»)
  const raw = Object.fromEntries(['client', 'folder', 'title', 'description', 'visibility', 'request', 'comment', 'deliverable'].flatMap((k) => { const v = form.get(k); return typeof v === 'string' && v !== '' ? [[k, v]] : []; })) as Record<string, string>;
  const parsed = uploadMetaSchema.safeParse({ ...raw, client: actor.kind === 'client' ? actor.clientAccountId : raw.client });
  if (!parsed.success) return json({ ok: false, message: 'Dados do envio inválidos.' }, 400);
  const meta = parsed.data;
  // O cliente nunca escolhe a visibilidade: o que ele envia é compartilhado (o banco força de novo).
  const visibility = actor.kind === 'client' ? 'client' : meta.visibility;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes, file.name);
  if (!mime) return json({ ok: false, message: 'Tipo de arquivo não permitido. Envie PDF, Word (.docx), Excel (.xlsx), PNG, JPEG ou texto (.txt) com conteúdo válido.' }, 415);

  const path = `${actor.organizationId}/${meta.client}/${crypto.randomUUID()}`;
  const up = await actor.supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '0' });
  if (up.error) {
    logEvent('warn', 'document.upload_denied', { status: (up.error as { statusCode?: string }).statusCode });
    return json({ ok: false, message: 'Você não tem permissão para enviar arquivos para esta empresa.' }, 403);
  }

  const name = safeFileName(file.name);
  const { data, error } = await actor.supabase.rpc('pt_document_register', {
    p_client: meta.client, p_folder: meta.folder, p_title: meta.title || titleFromFile(name), p_description: meta.description || null, p_original_name: name,
    p_storage_path: path, p_mime: mime, p_size: file.size, p_visibility: visibility, p_request: meta.request, p_comment: meta.comment, p_deliverable: meta.deliverable,
  });
  if (error) {
    await actor.supabase.storage.from(BUCKET).remove([path]); // órfão: permitido pela política de limpeza do bucket
    const own = ['23514', '22023', 'P0002', '42501'].includes(error.code ?? '') && (error.message ?? '').length <= 200 && !/violat|constraint|relation|column/i.test(error.message ?? '');
    return json({ ok: false, message: own ? `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.` : messageForDbError(error) }, 400);
  }
  logEvent('info', 'document.uploaded', { kind: actor.kind, size: file.size });
  return json({ ok: true, id: String(data), message: 'Documento enviado.' }, 201);
}
