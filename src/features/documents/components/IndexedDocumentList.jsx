/**
 * The indexed documents. A checkbox on each row (and "Seleziona tutti" for what the filters show) lets the
 * admin switch several to "solo archivio" or back to "studiato" in one go: with hundreds of documents,
 * mostly from Drive, doing it one row at a time would not be realistic. The documents that need a new full
 * card when they go back to studied are queued for indexing (documentMode.js).
 */
'use client';

import { useState } from 'react';
import { Archive, BookOpen, Loader2 } from 'lucide-react';
import { DOCUMENT_MODE, isArchive } from '@/features/documents/archiveMode';
import { changeDocumentsMode } from '@/features/documents/documentMode';
import IndexedDocumentRow from './IndexedDocumentRow';

export default function IndexedDocumentList({ documents, filtersActive, categories }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // what is selected and no longer listed (a filter changed, the document went away) does not count
  const selected = documents.filter(document => selectedIds.has(document.id));
  const allSelected = documents.length > 0 && selected.length === documents.length;
  const toArchive = selected.filter(document => !isArchive(document));
  const toStudied = selected.filter(isArchive);

  const toggle = id =>
    setSelectedIds(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(documents.map(d => d.id)));

  const change = async (list, mode) => {
    setBusy(true);
    setError(null);
    const failed = await changeDocumentsMode(list, mode);
    if (failed) setError(`${failed} documenti non sono stati aggiornati. Riprova.`);
    setSelectedIds(new Set());
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-line">
      {documents.length === 0 ? (
        <p className="px-3 py-6 text-center text-fs-12 text-slate-soft">
          {filtersActive
            ? 'Nessun documento indicizzato corrisponde.'
            : 'Nessun documento indicizzato finora.'}
        </p>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-t-xl border-b border-line bg-surface px-3 py-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-brand-500"
              aria-label="Seleziona tutti"
            />
            <span className="text-fs-11 font-medium text-slate-soft">
              Seleziona tutti ({documents.length})
            </span>
          </label>
          {error && (
            <p className="border-b border-line bg-danger-soft px-3 py-2 text-fs-11 text-danger">{error}</p>
          )}
          <div className="divide-y divide-line">
            {documents.map(document => (
              <IndexedDocumentRow
                key={document.id}
                document={document}
                categories={categories}
                selected={selectedIds.has(document.id)}
                onToggle={() => toggle(document.id)}
              />
            ))}
          </div>
          {selected.length > 0 && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-panel/95 px-3 py-2 shadow-lift backdrop-blur">
              <span className="flex-1 text-fs-12 font-medium text-ink">{selected.length} selezionati</span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg px-2 py-1.5 text-fs-12 text-slate-soft transition hover:text-ink"
              >
                Deseleziona
              </button>
              {busy && <Loader2 size={14} className="animate-spin text-slate-soft" />}
              <button
                type="button"
                disabled={busy || toStudied.length === 0}
                onClick={() => change(toStudied, DOCUMENT_MODE.studied)}
                title="Vale rilegge i file che hanno solo la scheda breve e scrive la scheda completa"
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-fs-12 font-semibold text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              >
                <BookOpen size={14} /> Studia {toStudied.length || ''}
              </button>
              <button
                type="button"
                disabled={busy || toArchive.length === 0}
                onClick={() => change(toArchive, DOCUMENT_MODE.archive)}
                title="Vale li trova e li consegna, ma non risponde sul contenuto"
                className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-fs-12 font-semibold text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Archive size={14} /> Solo archivio {toArchive.length || ''}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
