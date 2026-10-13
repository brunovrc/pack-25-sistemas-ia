// Validação do ARQUIVO enviado: o tipo declarado pelo navegador não vale nada; o que vale são os primeiros bytes (assinatura).
// Espelha a lista permitida do banco (documents.mime_type). Não substitui antivírus: ver docs/DOCUMENTS.md («Limites conhecidos»).
export const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'text/plain',
] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MIME_LABELS: Record<AllowedMime, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
  'image/png': 'Imagem PNG',
  'image/jpeg': 'Imagem JPEG',
  'text/plain': 'Texto (.txt)',
};
export const ACCEPT_ATTR = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt';

const EXT_TO_MIME: Record<string, AllowedMime> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
};

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/**
 * Detecta o tipo pelos bytes iniciais. Retorna `null` se não for um dos tipos aceitos.
 * - PDF: «%PDF-»; PNG: 89 50 4E 47 0D 0A 1A 0A; JPEG: FF D8 FF.
 * - DOCX/XLSX são ZIP («PK\x03\x04»); a distinção vem da extensão, validada contra o conteúdo do ZIP quando possível.
 * - TXT: nenhum byte nulo/de controle nos primeiros 4 KB e UTF-8 válido.
 */
export function sniffMime(bytes: Uint8Array, fileName: string): AllowedMime | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const declared = EXT_TO_MIME[ext];
  if (!declared) return null;
  const head = bytes.subarray(0, 4096);
  if (declared === 'application/pdf') return startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? declared : null;
  if (declared === 'image/png') return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? declared : null;
  if (declared === 'image/jpeg') return startsWith(head, [0xff, 0xd8, 0xff]) ? declared : null;
  if (declared === 'text/plain') {
    for (const v of head) if (v < 9 || (v > 13 && v < 32)) return null; // nulo e controles: binário disfarçado de texto
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes); // arquivo inteiro: UTF-8 válido
    } catch {
      return null;
    }
    return declared;
  }
  // Office Open XML: ZIP com [Content_Types].xml e a pasta esperada (word/ ou xl/) nas primeiras entradas.
  if (!startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return null;
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
  if (!text.includes('[Content_Types].xml')) return null;
  const marker = declared.includes('wordprocessing') ? 'word/' : 'xl/';
  // O diretório central do ZIP fica no fim do arquivo: procura o marcador nos dois extremos.
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
  return text.includes(marker) || tail.includes(marker) ? declared : null;
}

/** Nome para exibição/download: sem caminho, sem controle, sem barras, limitado. */
export function safeFileName(name: string): string {
  const base = name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim();
  return (base || 'arquivo').slice(0, 200);
}

export function titleFromFile(name: string): string {
  return safeFileName(name).replace(/\.[A-Za-z0-9]+$/, '').slice(0, 160) || 'Documento';
}
