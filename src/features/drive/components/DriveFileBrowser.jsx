import { useMemo, useState } from 'react';
import { ChevronRight, Folder, Loader2 } from 'lucide-react';
import FileActionButton from '@/features/documents/components/FileActionButton';
import FileTypeIcon from '@/features/documents/components/FileTypeIcon';
import { formatFileSize } from '@/features/documents/format';
import { describeIndexingError } from '@/features/documents/indexingErrors';
import { INDEXING_STATUS } from '@/features/documents/schema';
import Tooltip from '@/shared/ui/Tooltip';
import {
  countByState,
  existingPath,
  indexDocuments,
  indexingStateOf,
  listFolder,
  sortByName
} from '../driveTree';
import { plural } from '../plural';
import DriveLinkButton from './DriveLinkButton';

const PILL = 'shrink-0 rounded-pill px-2 py-0.5 text-fs-10 font-semibold';

/** Where a PDF stands: indexed, waiting (or being indexed by the sync running right now) or failed. */
function IndexingPill({ document, syncing }) {
  const state = indexingStateOf(document);
  if (state === INDEXING_STATUS.done) {
    return <span className={`${PILL} bg-ok-soft text-ok`}>Indicizzato</span>;
  }
  if (state === INDEXING_STATUS.failed) {
    return (
      <Tooltip label={describeIndexingError(document.error)} align="left">
        <span className={`${PILL} bg-danger-soft text-danger`}>Errore</span>
      </Tooltip>
    );
  }
  if (syncing) {
    return (
      <span className={`${PILL} flex items-center gap-1 bg-brand-50 text-brand-600`}>
        <Loader2 size={10} className="animate-spin" /> In indicizzazione
      </span>
    );
  }
  return (
    <Tooltip label="Viene indicizzato alla prossima sincronizzazione" align="left">
      <span className={`${PILL} bg-surface text-slate-soft`}>Da indicizzare</span>
    </Tooltip>
  );
}

/** "12 PDF · 10 indicizzati · 2 da indicizzare": the whole source, only the parts that are not zero. */
function Summary({ counts, syncing }) {
  const parts = [
    [counts.total, 'PDF', 'PDF', 'font-semibold text-ink'],
    [counts.done, 'indicizzato', 'indicizzati', 'text-ok'],
    [
      counts.pending,
      syncing ? 'in indicizzazione' : 'da indicizzare',
      syncing ? 'in indicizzazione' : 'da indicizzare',
      ''
    ],
    [counts.failed, 'con errore', 'con errore', 'text-danger']
  ].filter(([count]) => count > 0);

  return (
    <p className="text-fs-11 leading-snug text-slate-soft">
      {parts.map(([count, one, many, tone], index) => (
        <span key={one}>
          {index > 0 && ' · '}
          <span className={tone}>{plural(count, one, many)}</span>
        </span>
      ))}
    </p>
  );
}

/** Source name › folder › folder: every part but the last takes you back to that folder. */
function Breadcrumb({ rootName, path, onGo }) {
  const crumbs = [rootName, ...path];
  return (
    <nav aria-label="Percorso" className="flex flex-wrap items-center gap-y-0.5 text-fs-12">
      {crumbs.map((name, depth) => {
        const current = depth === crumbs.length - 1;
        return (
          <span key={depth} className="flex min-w-0 items-center">
            {depth > 0 && <ChevronRight size={12} className="mx-0.5 shrink-0 text-slate-soft" aria-hidden />}
            <button
              type="button"
              onClick={() => onGo(depth)}
              disabled={current}
              aria-current={current ? 'page' : undefined}
              title={name}
              className={`flex min-w-0 max-w-[12rem] items-center gap-1 rounded-lg px-1.5 py-0.5 transition ${
                current ? 'font-semibold text-ink' : 'text-slate-soft hover:bg-panel hover:text-ink'
              }`}
            >
              {depth === 0 && (
                <Folder
                  size={12}
                  className="shrink-0 text-brand-fg"
                  fill="currentColor"
                  fillOpacity={0.18}
                  aria-hidden
                />
              )}
              <span className="truncate">{name}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function FolderRow({ folder, syncing, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-surface"
    >
      <Folder
        size={16}
        className="shrink-0 text-brand-fg"
        fill="currentColor"
        fillOpacity={0.18}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span title={folder.name} className="block truncate text-fs-13 font-medium text-ink">
          {folder.name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-10 text-slate-soft">
          {plural(folder.total, 'PDF', 'PDF')}
          {folder.failed > 0 ? (
            <span className={`${PILL} bg-danger-soft text-danger`}>{folder.failed} con errore</span>
          ) : (
            folder.pending > 0 && (
              <span className={`${PILL} bg-surface text-slate-soft`}>
                {folder.pending} {syncing ? 'in indicizzazione' : 'da indicizzare'}
              </span>
            )
          )}
        </span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-slate-soft" aria-hidden />
    </button>
  );
}

function FileRow({ document, syncing }) {
  const size = formatFileSize(document.sizeBytes);
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-surface/60">
      <FileTypeIcon mimeType={document.mimeType} size={16} className="shrink-0 text-brand-fg" />
      <div className="min-w-0 flex-1">
        <div title={document.name} className="truncate text-fs-13 font-medium text-ink">
          {document.name}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <IndexingPill document={document} syncing={syncing} />
          {size && <span className="text-fs-10 text-slate-soft">{size}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <DriveLinkButton document={document} />
        <FileActionButton document={document} />
      </div>
    </div>
  );
}

/**
 * The files a Drive source brought into the archive, browsed like Google Drive: the sub-folders first,
 * then the PDFs, with the folder path on top to go back up. Built from the archive's own documents
 * (`documents`: those of this source), so it follows the sync live. A single-PDF source is just its file.
 * `syncing` is true while a run is working on the source: the files not indexed yet are being indexed.
 */
export default function DriveFileBrowser({ source, documents, syncing }) {
  const [path, setPath] = useState([]);
  const isFolder = source.kind === 'folder';
  const entries = useMemo(() => indexDocuments(documents), [documents]);
  const counts = useMemo(() => countByState(documents), [documents]);
  // a folder that lost its last file in a sync is no longer there to stay in
  const current = useMemo(() => (isFolder ? existingPath(entries, path) : []), [isFolder, entries, path]);
  const { folders, files } = useMemo(
    () => (isFolder ? listFolder(entries, current) : { folders: [], files: sortByName(documents) }),
    [isFolder, entries, current, documents]
  );

  const rows = (
    <div className="flex flex-col gap-0.5 p-1">
      {folders.map(folder => (
        <FolderRow
          key={folder.name}
          folder={folder}
          syncing={syncing}
          onOpen={() => setPath([...current, folder.name])}
        />
      ))}
      {files.map(document => (
        <FileRow key={document.id} document={document} syncing={syncing} />
      ))}
    </div>
  );

  if (!isFolder) return <div className="mt-2.5 rounded-xl border border-line">{rows}</div>;

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <Summary counts={counts} syncing={syncing} />
      <div className="rounded-xl border border-line">
        <div className="rounded-t-xl border-b border-line bg-surface/60 px-1.5 py-1.5">
          <Breadcrumb
            rootName={source.name}
            path={current}
            onGo={depth => setPath(current.slice(0, depth))}
          />
        </div>
        {rows}
      </div>
    </div>
  );
}
