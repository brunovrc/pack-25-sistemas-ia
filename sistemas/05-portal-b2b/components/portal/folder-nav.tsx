import Link from 'next/link';
import { ArchiveFolderButton } from './document-bits';
import type { FolderRow } from '@/lib/portal/data';
import { VisibilityBadge } from './badges';

/** Navegação por pastas: caminho (migalhas) + subpastas da pasta atual. Os parâmetros extras (ex.: client) são preservados. */
export function FolderNav({ base, folders, current, extra, canArchive, staff }: {
  base: string; folders: FolderRow[]; current: string | null; extra: Record<string, string>; canArchive: boolean; staff: boolean;
}) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: FolderRow[] = [];
  for (let f = current ? byId.get(current) : undefined, guard = 0; f && guard < 20; f = f.parent_folder_id ? byId.get(f.parent_folder_id) : undefined, guard++) trail.unshift(f);
  const href = (folder: string | null) => {
    const sp = new URLSearchParams(Object.entries(extra).filter(([, v]) => v));
    if (folder) sp.set('folder', folder);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const children = folders.filter((f) => (f.parent_folder_id ?? null) === current);
  return (
    <div className="space-y-3">
      <nav aria-label="Caminho das pastas" className="flex flex-wrap items-center gap-1 text-sm">
        <Link className="underline-offset-2 hover:underline" href={href(null)}>Todos os documentos</Link>
        {trail.map((f) => <span key={f.id} className="flex items-center gap-1"><span aria-hidden="true">/</span><Link className="underline-offset-2 hover:underline" href={href(f.id)}>{f.name}</Link></span>)}
      </nav>
      {children.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Subpastas">
          {children.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <Link className="font-medium underline-offset-2 hover:underline" href={href(f.id)}>📁 {f.name}</Link>
              <span className="flex items-center gap-2">{staff ? <VisibilityBadge visibility={f.visibility} /> : null}{canArchive ? <ArchiveFolderButton id={f.id} /> : null}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
