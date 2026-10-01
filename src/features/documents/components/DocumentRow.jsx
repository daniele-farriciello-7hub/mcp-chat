import { AlertTriangle, Loader2, Upload } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { formatFileSize, formatTimestamp } from '@/features/documents/format';
import { getIndexingBlocker } from '@/features/documents/indexability';
import { describeIndexingError } from '@/features/documents/indexingErrors';
import { INDEXING_STATUS } from '@/features/documents/schema';
import DeleteDocumentButton from './DeleteDocumentButton';
import FileActionButton from './FileActionButton';
import FileTypeIcon from './FileTypeIcon';

const PHASE_LABELS = { reading: 'Gemini sta leggendo…' };

/** One line under the name saying what is going on, or nothing when the document is simply waiting. */
function StatusLine({ document, phase, blocker }) {
  if (phase) {
    return (
      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-600">
        <Loader2 size={11} className="animate-spin" /> {PHASE_LABELS[phase]}
      </span>
    );
  }
  if (blocker) {
    return (
      <span className="mt-1 block text-[11px] leading-snug text-slate-soft">
        <span className="font-semibold text-ink">{blocker.label}.</span> {blocker.reason}
      </span>
    );
  }
  if (document.indexingStatus === INDEXING_STATUS.failed) {
    return (
      <span
        className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-danger"
        title={document.error}
      >
        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
        {describeIndexingError(document.error)}
      </span>
    );
  }
  return null;
}

/** A document not yet indexed. `phase` is set while the queue works on it. */
export default function DocumentRow({ document, selected, onToggle, phase }) {
  const blocker = getIndexingBlocker(document);
  // blocked documents stay selectable so they can be deleted in bulk; indexing skips them
  const selectable = !phase;
  const location = `Caricato ${formatTimestamp(document.createdAt) || ''}`.trim();
  const meta = [location, formatFileSize(document.sizeBytes)].filter(Boolean).join(' · ');

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 transition ${selected ? 'bg-brand-50/60' : ''} ${
        selectable ? 'cursor-pointer hover:bg-surface/60' : ''
      }`}
      onClick={selectable ? onToggle : undefined}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={!selectable}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500 disabled:invisible"
        aria-label={`Seleziona ${document.name}`}
      />
      <FileTypeIcon
        mimeType={document.mimeType}
        size={15}
        className={`mt-0.5 shrink-0 ${blocker ? 'text-slate-soft' : 'text-brand-500'}`}
      />
      <div className="min-w-0 flex-1">
        <Tooltip label={document.name} align="left" className="block w-full">
          <div className={`truncate text-[13px] font-medium ${blocker ? 'text-slate-soft' : 'text-ink'}`}>
            {document.name}
          </div>
        </Tooltip>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-soft">
          <Upload size={10} />
          <span className="truncate">{meta}</span>
        </div>
        <StatusLine document={document} phase={phase} blocker={blocker} />
      </div>
      <div className="flex shrink-0 items-center" onClick={e => e.stopPropagation()}>
        <FileActionButton document={document} />
        <DeleteDocumentButton document={document} disabled={Boolean(phase)} />
      </div>
    </div>
  );
}
