/**
 * A file from the archive that the assistant hands over (`share_file`): the image itself, or a tile
 * with its name, and a "Scarica" button that saves it under its original name. The card is rebuilt
 * from the document id alone (`activity.documentId`), so it also comes back with a restored
 * conversation; a file deleted in the meantime says so instead of leaving a dead button.
 */
'use client';

import { useEffect, useState } from 'react';
import { Check, Download, FileX, Loader2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import { downloadFile } from '@/shared/downloadFile';
import { getDocumentFile } from '@/features/documents/documentStore';
import { isImage } from '@/features/documents/fileTypes';
import { formatFileSize } from '@/features/documents/format';
import FileTypeIcon from '@/features/documents/components/FileTypeIcon';

const CARD_CLASS = 'overflow-hidden rounded-card border border-line bg-white shadow-soft';

/** "PNG · 120 KB": the extension and the size, whichever are known. */
function fileMeta(file) {
  const extension = file.name?.includes('.') ? file.name.split('.').pop() : '';
  return [
    extension.length > 0 && extension.length <= 5 ? extension.toUpperCase() : null,
    formatFileSize(file.sizeBytes)
  ]
    .filter(Boolean)
    .join(' · ');
}

function DownloadFileButton({ file }) {
  const [state, setState] = useState('idle'); // 'idle' | 'saving' | 'saved'

  const save = async () => {
    setState('saving');
    const outcome = await downloadFile(file.url, file.name);
    // opened in a new tab instead: nothing was saved here, so no "Scaricato"
    setState(outcome === 'saved' ? 'saved' : 'idle');
    if (outcome === 'saved') setTimeout(() => setState('idle'), 2500);
  };

  return (
    <Button primary onClick={save} disabled={state === 'saving'}>
      {state === 'saving' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : state === 'saved' ? (
        <Check size={14} strokeWidth={3} />
      ) : (
        <Download size={14} />
      )}
      {state === 'saved' ? 'Scaricato' : 'Scarica'}
    </Button>
  );
}

export default function SharedFileCard({ activity }) {
  const { documentId, documentName } = activity;
  const [file, setFile] = useState(undefined); // undefined while loading, null when gone
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDocumentFile(documentId)
      .then(found => !cancelled && setFile(found))
      .catch(error => {
        console.error('[chat] loading the shared file failed:', error);
        if (!cancelled) setFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (file === null) {
    return (
      <div
        className={`${CARD_CLASS} flex items-center gap-2.5 px-3 py-2.5`}
        style={{ animation: 'var(--animate-fade-up)' }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-slate-soft">
          <FileX size={16} />
        </span>
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-slate-soft">
          <span className="font-semibold text-ink">{documentName || 'Il file'}</span> non è più nell’archivio.
        </p>
      </div>
    );
  }

  if (file === undefined) {
    return <div className="h-16 animate-pulse rounded-card bg-line" aria-hidden />;
  }

  const showPreview = isImage(file.mimeType) && !previewFailed;

  return (
    <div className={CARD_CLASS} style={{ animation: 'var(--animate-fade-up)' }}>
      {showPreview && (
        // opens the full-size image: the download is the button below
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Apri ${file.name} a grandezza intera`}
          className="thumb-checker flex h-44 items-center justify-center p-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a Storage download URL: nothing for next/image to optimise */}
          <img
            src={file.url}
            alt={file.description || file.name}
            onError={() => setPreviewFailed(true)}
            className="max-h-full max-w-full object-contain"
          />
        </a>
      )}
      <div className={`flex items-center gap-2.5 px-3 py-2.5 ${showPreview ? 'border-t border-line' : ''}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
          <FileTypeIcon mimeType={file.mimeType} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ink" title={file.name}>
            {file.name}
          </div>
          <div className="text-[11px] text-slate-soft">{fileMeta(file)}</div>
        </div>
        <DownloadFileButton file={file} />
      </div>
    </div>
  );
}
