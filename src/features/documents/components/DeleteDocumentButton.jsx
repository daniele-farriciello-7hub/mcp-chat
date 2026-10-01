import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteDocument } from '@/features/documents/documentStore';
import Tooltip from '@/shared/ui/Tooltip';

const stopEvent = event => {
  event.preventDefault();
  event.stopPropagation();
};

const describeDeleteError = error =>
  error?.code?.includes('unauthorized') || error?.code === 'permission-denied'
    ? 'Permesso negato'
    : 'Non riuscito';

/** Trash icon with in-place confirmation: one click to ask, a second to delete. */
export default function DeleteDocumentButton({ document, disabled }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (deleting) return <Loader2 size={14} className="mx-1.5 mt-1.5 shrink-0 animate-spin text-slate-soft" />;

  if (confirming) {
    const confirm = async event => {
      stopEvent(event);
      setDeleting(true);
      setError(null);
      try {
        await deleteDocument(document);
      } catch (e) {
        console.error('[documents] delete failed:', e);
        setError(describeDeleteError(e));
        setDeleting(false);
        setConfirming(false);
      }
    };

    return (
      <span className="flex shrink-0 items-center gap-1" onClick={stopEvent}>
        <button
          type="button"
          onClick={confirm}
          className="rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
        >
          Elimina
        </button>
        <button
          type="button"
          onClick={event => {
            stopEvent(event);
            setConfirming(false);
          }}
          className="rounded-lg px-1.5 py-1 text-[11px] text-slate-soft transition hover:text-ink"
        >
          Annulla
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center">
      {error && <span className="text-[10px] text-danger">{error}</span>}
      <Tooltip
        label={disabled ? 'Non si può eliminare mentre viene indicizzato' : 'Elimina dal catalogo'}
        align="right"
      >
        <button
          type="button"
          onClick={event => {
            stopEvent(event);
            setConfirming(true);
          }}
          disabled={disabled}
          aria-label={`Elimina ${document.name}`}
          className="rounded-lg p-1.5 text-slate-soft transition hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>
    </span>
  );
}
