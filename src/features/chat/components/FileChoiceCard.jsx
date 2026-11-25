/**
 * Archive files to pick from (`offer_files`): a small grid of thumbnails, each with its name. Picking one
 * is handled by the conversation hook (`useConversation.pickFile`), with no round trip through the model:
 * the pick is marked here (and remembered, so it survives a reload) and the exchange continues further
 * down as in any chat — a user bubble "Ho scelto …" and the usual shared-file card with "Scarica". This card
 * does not draw the file itself, so the conversation reads in order: the question, the answer, the file.
 * The other thumbnails stay in view, dimmed and off. "Nessuno di questi" is the way out: it sends a normal
 * message, so the model can carry on. The card is rebuilt from document ids alone.
 *
 * The header depends on why the card is there (`reason`): "Non ho trovato esattamente quello che cerchi.
 * Forse intendevi:" when nothing matched exactly (`no_exact_match`); otherwise the card's own title, i.e. the
 * question ("Quale logo intendi?", `ambiguous`) or the title of the list ("Moduli per il mutuo", `listing`).
 * A `listing` is the operator browsing what exists, not choosing among candidates, so it has no "Nessuno di
 * questi" and, without a title, reads "File disponibili".
 *
 * `answered` means a message followed the card (the operator picked, typed, or asked for none of them).
 */
'use client';

import { useEffect, useState } from 'react';
import { Check, FileX } from 'lucide-react';
import { getDocumentFile } from '@/features/documents/documentStore';
import { isImage, mimeTypeOf } from '@/features/documents/fileTypes';
import FileTypeIcon from '@/features/documents/components/FileTypeIcon';
import PreviewImage from '@/features/documents/components/PreviewImage';

const NONE_OF_THESE = 'Nessuno di questi';
const NO_EXACT_MATCH = 'Non ho trovato esattamente quello che cerchi. Forse intendevi:';
const LISTING_FALLBACK = 'File disponibili';

/**
 * One thumbnail. `chosen` is the picked file; `dimmed` the others once one is picked. A pick reports the
 * name the archive has now (it may have been renamed since the card was written), falling back to the stored one.
 */
function FileOption({ file, chosen, dimmed, disabled, onPick }) {
  const { documentId, documentName } = file;
  const [found, setFound] = useState(undefined); // undefined while loading, null when gone

  useEffect(() => {
    let cancelled = false;
    getDocumentFile(documentId)
      .then(document => !cancelled && setFound(document))
      .catch(error => {
        console.error('[chat] loading an offered file failed:', error);
        if (!cancelled) setFound(null);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const gone = found === null;
  const name = found?.name || documentName;
  // not known yet while loading: the name says whether to hold room for a picture
  const isPicture = found ? isImage(found.mimeType) : isImage(mimeTypeOf({ name: documentName || '' }));

  return (
    <button
      type="button"
      onClick={() => onPick({ documentId, documentName: name })}
      disabled={disabled || gone}
      aria-label={`Scegli ${name || 'il file'}`}
      aria-pressed={chosen}
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-panel text-left transition disabled:cursor-default ${
        chosen ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-line'
      } ${dimmed || gone ? 'opacity-50' : ''} ${disabled || gone ? '' : 'hover:border-brand-300 hover:shadow-soft'}`}
    >
      <span
        className={`relative flex h-24 w-full items-center justify-center ${
          isPicture && !gone ? 'thumb-checker p-2' : 'bg-surface text-brand-fg'
        }`}
      >
        {gone ? (
          <FileX size={22} className="text-slate-soft" />
        ) : isPicture ? (
          // fills the frame above: skeleton while it loads, a quiet "non disponibile" if it never does
          <PreviewImage src={found?.url ?? null} loading="lazy" decoding="async" iconSize={18} />
        ) : (
          <FileTypeIcon mimeType={found?.mimeType} size={28} />
        )}
        {chosen && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-on-brand">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="border-t border-line px-2 py-1.5">
        <span className="block truncate text-fs-12 font-semibold text-ink" title={name}>
          {name}
        </span>
        {gone && <span className="block text-fs-11 text-slate-soft">Non più nell’archivio</span>}
      </span>
    </button>
  );
}

export default function FileChoiceCard({ activity, answered, onPickFile, onAsk }) {
  const { label, files, reason, selected } = activity;
  const decided = answered || Boolean(selected);
  const chosenFile = files.find(file => file.documentId === selected);
  const noExactMatch = reason === 'no_exact_match';
  const listing = reason === 'listing';
  const title = noExactMatch ? NO_EXACT_MATCH : label || (listing ? LISTING_FALLBACK : '');

  return (
    <div
      className="overflow-hidden rounded-card border border-line bg-panel shadow-soft"
      style={{ animation: 'var(--animate-fade-up)' }}
      role="group"
      aria-label={label}
    >
      <div
        className={`border-b border-line bg-surface px-3 py-1.5 ${
          noExactMatch
            ? 'text-fs-12 font-semibold leading-snug text-ink'
            : 'text-fs-11 font-semibold uppercase tracking-[0.08em] text-slate-soft'
        }`}
      >
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2.5">
        {files.map(file => (
          <FileOption
            key={file.documentId}
            file={file}
            chosen={file.documentId === selected}
            dimmed={decided && file.documentId !== selected}
            disabled={decided}
            onPick={picked => onPickFile(activity.id, picked)}
          />
        ))}
      </div>
      {!chosenFile && !listing && (
        <div className="border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={() => onAsk(NONE_OF_THESE)}
            disabled={decided}
            className="text-fs-12 font-semibold text-brand-600 transition hover:text-brand-700 disabled:cursor-default disabled:text-slate-soft/60"
          >
            {NONE_OF_THESE}
          </button>
        </div>
      )}
    </div>
  );
}
