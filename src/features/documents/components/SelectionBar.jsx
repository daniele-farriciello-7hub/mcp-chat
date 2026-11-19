import { useState } from 'react';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';

/**
 * Sticky actions for the selected documents: index (only the ones that can be, `skippedNote` says how
 * many are left out and why) or delete, with an in-place confirmation before deleting. Documents that
 * come from Google Drive are not deleted from here (`deletableCount` leaves them out).
 */
export default function SelectionBar({
  count,
  deletableCount,
  indexableCount,
  skippedNote,
  actionLabel,
  onIndex,
  onDelete,
  onClear
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const driveCount = count - deletableCount;

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
    <div className="sticky bottom-0 rounded-b-xl border-t border-line bg-panel/95 px-3 py-2 shadow-lift backdrop-blur">
      {!confirmingDelete && skippedNote && (
        <p className="mb-1.5 text-fs-11 leading-snug text-warn">{skippedNote}</p>
      )}
      <div className="flex items-center gap-2">
        {confirmingDelete ? (
          <>
            <span className="flex-1 text-fs-12 font-medium text-ink">
              Eliminare {deletableCount === 1 ? 'il documento selezionato' : `${deletableCount} documenti`}?
              Non si può annullare.
              {driveCount > 0 && (
                <span className="block text-fs-11 font-normal text-warn">
                  {driveCount === 1
                    ? '1 documento di Google Drive resta'
                    : `${driveCount} documenti di Google Drive restano`}
                  : tornerebbero alla prossima sincronizzazione.
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-lg px-2 py-1.5 text-fs-12 text-slate-soft transition hover:text-ink"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-xl bg-danger px-3 py-2 text-fs-12 font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Elimina
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-fs-12 font-medium text-ink">{count} selezionati</span>
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-2 py-1.5 text-fs-12 text-slate-soft transition hover:text-ink"
            >
              Deseleziona
            </button>
            <Tooltip
              label={
                deletableCount === 0
                  ? 'Arrivano da Google Drive: tornerebbero alla prossima sincronizzazione. Toglili da Drive, o scollega la cartella dalla scheda Drive.'
                  : 'Elimina dall’archivio i documenti selezionati'
              }
              align="right"
            >
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deletableCount === 0}
                aria-label="Elimina i selezionati"
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-fs-12 font-semibold text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
    </div>
  );
}
