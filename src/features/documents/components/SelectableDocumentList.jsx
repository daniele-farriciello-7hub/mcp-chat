/**
 * Documents to index ("pending") or to retry ("failed"). Documents that cannot be indexed right now
 * are grouped at the bottom with the reason; they can still be selected, to delete them.
 */
import { useState } from 'react';
import { deleteDocument } from '@/features/documents/documentStore';
import { canIndexNow } from '@/features/documents/indexability';
import { enqueueForIndexing, isQueued } from '@/features/documents/indexingQueue';
import { useIndexingQueue } from '@/features/documents/useIndexingQueue';
import DocumentRow from './DocumentRow';
import SelectionBar from './SelectionBar';

const COPY = {
  pending: { action: 'Indicizza', empty: 'Niente da indicizzare. Carica un file per iniziare.' },
  failed: { action: 'Riprova', empty: 'Nessun documento con errori.' }
};

export default function SelectableDocumentList({ mode, documents, filtersActive }) {
  const queue = useIndexingQueue();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteError, setDeleteError] = useState(null);
  const copy = COPY[mode];

  const phaseOf = id => queue?.inProgress?.get(id)?.phase;
  const indexable = documents.filter(canIndexNow);
  const blocked = documents.filter(d => !canIndexNow(d));
  // a document already in the indexing queue is not selectable: it would be indexed or deleted mid-work
  const selectable = documents.filter(d => !isQueued(d.id));
  const selected = selectable.filter(d => selectedIds.has(d.id));
  const selectedIndexable = selected.filter(canIndexNow);
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
  const indexSelected = () => {
    enqueueForIndexing(selectedIndexable);
    clearSelection();
  };

  const deleteSelected = async () => {
    setDeleteError(null);
    const results = await Promise.allSettled(selected.map(deleteDocument));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      console.error(
        '[documents] bulk delete failed:',
        failures.map(f => f.reason)
      );
      setDeleteError(`${failures.length} documenti non sono stati eliminati. Riprova.`);
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

          {deleteError && (
            <p className="border-b border-line bg-danger-soft px-3 py-2 text-[11px] text-danger">
              {deleteError}
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
