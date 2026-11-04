/**
 * Documents to index ("pending") or to retry ("failed"). Documents whose file cannot be indexed are
 * grouped at the bottom with the reason; they can still be selected, to delete them. An image without
 * a description stays in place (so it does not jump away while its description is typed): it is
 * selectable too, and indexing skips it — the selection bar says how many and why.
 */
import { useState } from 'react';
import { deleteDocument } from '@/features/documents/documentStore';
import { canIndexNow, getFileBlocker, getIndexingBlocker } from '@/features/documents/indexability';
import { enqueueForIndexing, isQueued } from '@/features/documents/indexingQueue';
import { useIndexingQueue } from '@/features/documents/useIndexingQueue';
import DocumentRow from './DocumentRow';
import SelectionBar from './SelectionBar';

const COPY = {
  pending: { action: 'Indicizza', empty: 'Niente da indicizzare. Carica un file per iniziare.' },
  failed: { action: 'Riprova', empty: 'Nessun documento con errori.' }
};

/** "Verranno saltati 3 file: 2 senza descrizione, 1 formato non supportato." — or nothing to say. */
function skippedNote(skipped, indexableCount) {
  if (skipped.length === 0) return null;
  const counts = new Map();
  for (const document of skipped) {
    const { short } = getIndexingBlocker(document);
    counts.set(short, (counts.get(short) || 0) + 1);
  }
  const reasons = [...counts].map(([short, n]) => (counts.size > 1 ? `${n} ${short}` : short)).join(', ');
  const lead =
    indexableCount === 0
      ? 'Non si può indicizzare nessuno'
      : skipped.length === 1
        ? 'Verrà saltato 1 file'
        : `Verranno saltati ${skipped.length} file`;
  return `${lead}: ${reasons}.`;
}

export default function SelectableDocumentList({ mode, documents, typed, filtersActive }) {
  const queue = useIndexingQueue();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionError, setActionError] = useState(null);
  const copy = COPY[mode];

  const phaseOf = id => queue?.inProgress?.get(id)?.phase;
  const indexable = documents.filter(d => !getFileBlocker(d));
  const blocked = documents.filter(getFileBlocker);
  // a document already in the indexing queue is not selectable: it would be indexed or deleted mid-work
  const selectable = documents.filter(d => !isQueued(d.id));
  const selected = selectable.filter(d => selectedIds.has(d.id));
  // judged on the text in the description fields, not on what is saved yet
  const selectedIndexable = selected.filter(d => canIndexNow(typed.withTyped(d)));
  const selectedSkipped = selected.filter(d => !canIndexNow(typed.withTyped(d))).map(typed.withTyped);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;

  const toggle = id =>
    setSelectedIds(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(selectable.map(d => d.id)));
  const clearSelection = () => setSelectedIds(new Set());

  // returns immediately: the queue keeps running even if the panel is closed
  const indexSelected = async () => {
    setActionError(null);
    try {
      // the fields save a moment after typing stops: write what is still waiting, so indexing finds it
      await typed.saveTyped(selectedIndexable);
    } catch (error) {
      console.error('[documents] saving the descriptions before indexing failed:', error);
      setActionError('Non riesco a salvare le descrizioni. Controlla la connessione e riprova.');
      return;
    }
    enqueueForIndexing(selectedIndexable.map(typed.withTyped));
    clearSelection();
  };

  const deleteSelected = async () => {
    setActionError(null);
    const results = await Promise.allSettled(selected.map(deleteDocument));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      console.error(
        '[documents] bulk delete failed:',
        failures.map(f => f.reason)
      );
      setActionError(`${failures.length} documenti non sono stati eliminati. Riprova.`);
    }
    clearSelection();
  };

  const renderRow = document => (
    <DocumentRow
      key={document.id}
      document={document}
      selected={selectedIds.has(document.id)}
      onToggle={() => toggle(document.id)}
      phase={phaseOf(document.id)}
      onDescriptionText={typed.report}
    />
  );

  // no overflow-hidden on the wrapper: it would stop the selection bar from sticking while the panel scrolls
  return (
    <div className="rounded-xl border border-line">
      {documents.length === 0 ? (
        <p className="px-3 py-8 text-center text-[12px] text-slate-soft">
          {filtersActive ? 'Nessun documento corrisponde alla ricerca.' : copy.empty}
        </p>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-t-xl border-b border-line bg-surface px-3 py-2">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={selectable.length === 0}
              onChange={toggleAll}
              className="h-4 w-4 accent-brand-500"
              aria-label="Seleziona tutti"
            />
            <span className="text-[11px] font-medium text-slate-soft">
              Seleziona tutti ({selectable.length})
            </span>
          </label>

          {actionError && (
            <p className="border-b border-line bg-danger-soft px-3 py-2 text-[11px] text-danger">
              {actionError}
            </p>
          )}

          <div className="divide-y divide-line">{indexable.map(renderRow)}</div>

          {blocked.length > 0 && (
            <>
              <div className="border-y border-line bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-soft">
                Non indicizzabili per ora ({blocked.length})
              </div>
              <div className="divide-y divide-line">{blocked.map(renderRow)}</div>
            </>
          )}

          {selected.length > 0 && (
            <SelectionBar
              count={selected.length}
              indexableCount={selectedIndexable.length}
              skippedNote={skippedNote(selectedSkipped, selectedIndexable.length)}
              actionLabel={copy.action}
              onIndex={indexSelected}
              onDelete={deleteSelected}
              onClear={clearSelection}
            />
          )}
        </>
      )}
    </div>
  );
}
