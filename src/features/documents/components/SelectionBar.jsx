import { useState } from 'react';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';

/**
 * Sticky actions for the selected documents: index (only the ones that can be) or delete, with an
 * in-place confirmation before deleting.
 */
export default function SelectionBar({ count, indexableCount, actionLabel, onIndex, onDelete, onClear }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="sticky bottom-0 flex items-center gap-2 rounded-b-xl border-t border-line bg-white/95 px-3 py-2 shadow-lift backdrop-blur">
      {confirmingDelete ? (
        <>
          <span className="flex-1 text-[12px] font-medium text-ink">
            Eliminare {count === 1 ? 'il documento selezionato' : `${count} documenti`}? Non si può annullare.
          </span>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className="rounded-lg px-2 py-1.5 text-[12px] text-slate-soft transition hover:text-ink"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-xl bg-danger px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Elimina
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-[12px] font-medium text-ink">{count} selezionati</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg px-2 py-1.5 text-[12px] text-slate-soft transition hover:text-ink"
          >
            Deseleziona
          </button>
          <Tooltip label="Elimina dall’archivio i documenti selezionati" align="right">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Elimina i selezionati"
              className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[12px] font-semibold text-danger transition hover:bg-danger-soft"
            >
              <Trash2 size={14} /> Elimina
            </button>
          </Tooltip>
          <Button
            primary
            onClick={onIndex}
            disabled={indexableCount === 0}
            tooltip={
              indexableCount === 0
                ? 'Nessuno dei selezionati si può indicizzare per ora'
                : indexableCount < count
                  ? `${count - indexableCount} non si possono indicizzare per ora e verranno saltati`
                  : undefined
            }
            tooltipAlign="right"
          >
            <Sparkles size={14} /> {actionLabel} {indexableCount}
          </Button>
        </>
      )}
    </div>
  );
}
