'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ActionButton, FormShell, SelectField, TextField, useActionForm, type Opt } from '@/components/app/form-kit';
import { Alert, Button, Input, Select } from '@/components/ui/primitives';
import { archiveDocument, archiveFolder, createFolder, setDocumentVisibility } from '@/lib/portal/actions';
import { ACCEPT_ATTR } from '@/lib/portal/uploads';
import { folderSchema, type FolderInput } from '@/lib/portal/validation';

/** Envio de arquivo ao route handler (/api/documents). O tipo REAL é conferido no servidor pelos bytes; aqui só se avisa cedo sobre tamanho. */
export function UploadForm({ clientId, folderId, maxMb, staff, requestId, deliverableId, label = 'Enviar documento' }: {
  clientId: string; folderId?: string | null; maxMb: number; staff: boolean; requestId?: string; deliverableId?: string; label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState<'client' | 'internal'>('client');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const file = input.current?.files?.[0];
        if (!file) return setMsg({ ok: false, text: 'Escolha um arquivo.' });
        if (file.size > maxMb * 1_048_576) return setMsg({ ok: false, text: `O arquivo excede o limite de ${maxMb} MB.` });
        const body = new FormData();
        body.set('file', file);
        body.set('client', clientId);
        body.set('title', title);
        body.set('visibility', visibility);
        if (folderId) body.set('folder', folderId);
        if (requestId) body.set('request', requestId);
        if (deliverableId) body.set('deliverable', deliverableId);
        start(async () => {
          try {
            const res = await fetch('/api/documents', { method: 'POST', body });
            const json = (await res.json()) as { ok: boolean; message?: string };
            setMsg({ ok: Boolean(json.ok), text: json.message ?? (json.ok ? 'Documento enviado.' : 'Não foi possível enviar o arquivo.') });
            if (json.ok) {
              if (input.current) input.current.value = '';
              setTitle('');
              router.refresh();
            }
          } catch {
            setMsg({ ok: false, text: 'Falha de conexão. Tente novamente.' });
          }
        });
      }}
    >
      <div>
        <label htmlFor="upload-file" className="mb-1 block text-sm font-medium">Arquivo</label>
        <input id="upload-file" ref={input} type="file" accept={ACCEPT_ATTR} required className="block w-full text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-card file:px-3 file:text-sm" />
        <p className="mt-1 text-xs text-muted">PDF, Word (.docx), Excel (.xlsx), PNG, JPEG ou texto (.txt), até {maxMb} MB. O conteúdo do arquivo é conferido, não só a extensão.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="upload-title" className="mb-1 block text-sm font-medium">Título (opcional)</label>
          <Input id="upload-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </div>
        {staff ? (
          <div>
            <label htmlFor="upload-visibility" className="mb-1 block text-sm font-medium">Visibilidade</label>
            <Select id="upload-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as 'client' | 'internal')}>
              <option value="client">Compartilhado com o cliente</option>
              <option value="internal">Interno (só a equipe)</option>
            </Select>
          </div>
        ) : null}
      </div>
      {msg ? <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Enviando…' : label}</Button>
    </form>
  );
}

export function FolderForm({ clientId, parent, staff }: { clientId: string; parent: string | null; staff: boolean }) {
  const { form, state, pending, submit } = useActionForm<FolderInput, unknown>({
    schema: folderSchema as never, defaultValues: { name: '', parent: parent ?? '', visibility: 'client' }, action: (v) => createFolder(clientId, v), resetOnSuccess: true,
  });
  return (
    <FormShell onSubmit={submit} pending={pending} state={state} submitLabel="Criar pasta">
      <TextField form={form} name="name" label="Nome da pasta" maxLength={80} />
      {staff ? <SelectField form={form} name="visibility" label="Visibilidade" options={[{ value: 'client', label: 'Compartilhada com o cliente' }, { value: 'internal', label: 'Interna (só a equipe)' }]} hint="Documentos de uma pasta interna ficam sempre internos." /> : null}
    </FormShell>
  );
}

/** Ações da equipe sobre um documento: compartilhar / tornar interno / arquivar. */
export function DocumentActions({ id, visibility, canArchive }: { id: string; visibility: 'internal' | 'client'; canArchive: boolean }) {
  const to = visibility === 'client' ? 'internal' : 'client';
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        label={to === 'client' ? 'Compartilhar com o cliente' : 'Tornar interno'}
        confirm={to === 'client' ? 'Compartilhar este documento? O cliente passará a vê-lo e baixá-lo.' : 'Tornar interno? O cliente perde o acesso imediatamente.'}
        action={() => setDocumentVisibility(id, to)}
      />
      {canArchive ? <ActionButton label="Arquivar" variant="ghost" confirm="Arquivar este documento? Ele deixa de aparecer para o cliente." action={() => archiveDocument(id)} /> : null}
    </div>
  );
}

export function ArchiveFolderButton({ id }: { id: string }) {
  return <ActionButton label="Arquivar pasta" variant="ghost" confirm="Arquivar esta pasta?" action={() => archiveFolder(id)} />;
}

/** Abre o download/visualização por uma rota autorizada (a URL assinada é emitida na hora e dura 60 s). */
export function DocLinks({ id, mime }: { id: string; mime: string }) {
  const viewable = mime === 'application/pdf' || mime.startsWith('image/');
  const cls = 'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5';
  return (
    <span className="flex flex-wrap gap-2">
      {viewable ? <a className={cls} href={`/api/documents/${id}?action=view`} target="_blank" rel="noopener noreferrer">Visualizar</a> : null}
      <a className={cls} href={`/api/documents/${id}?action=download`}>Baixar</a>
    </span>
  );
}

export type { Opt };
