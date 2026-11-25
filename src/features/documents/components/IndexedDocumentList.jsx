/**
 * The indexed documents. A checkbox on each row (and "Seleziona tutti" for what the filters show) lets the
 * admin switch several to "solo archivio" or back to "studiato" in one go, or add, take off or replace their
 * categories (BulkCategoriesMenu): with hundreds of documents, mostly from Drive, doing it one row at a time
 * would not be realistic. The documents that need a new full card when they go back to studied are queued for
 * indexing (documentMode.js). Whatever the action, the selection is cleared when it is over; the categories'
 * summary then stays in the place of the bar until it is closed or a new selection starts.
 */
'use client';

import { useState } from 'react';
import { Archive, BookOpen, Loader2, X } from 'lucide-react';
import { DOCUMENT_MODE, isArchive } from '@/features/documents/archiveMode';
import { describeCategoryChange, planCategoryChange } from '@/features/documents/bulkCategories';
import { changeDocumentsMode } from '@/features/documents/documentMode';
import { setCategoriesOnDocuments } from '@/features/documents/documentStore';
import BulkCategoriesMenu from './BulkCategoriesMenu';
import IndexedDocumentRow from './IndexedDocumentRow';
import ProgressBar from './ProgressBar';

export default function IndexedDocumentList({ documents, filtersActive, categories }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total } while categories are being written
  const [notice, setNotice] = useState(null); // { tone: 'ok' | 'error', text }: how the last categories change went

  // what is selected and no longer listed (a filter changed, the document went away) does not count
  const selected = documents.filter(document => selectedIds.has(document.id));
  const allSelected = documents.length > 0 && selected.length === documents.length;
  const toArchive = selected.filter(document => !isArchive(document));
  const toStudied = selected.filter(isArchive);

  const toggle = id => {
    setNotice(null);
    setSelectedIds(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setNotice(null);
    setSelectedIds(allSelected ? new Set() : new Set(documents.map(d => d.id)));
  };

  const change = async (list, mode) => {
    setBusy(true);
    setError(null);
    const failed = await changeDocumentsMode(list, mode);
    if (failed) setError(`${failed} documenti non sono stati aggiornati. Riprova.`);
    setSelectedIds(new Set());
    setBusy(false);
  };

  /** Adds, takes off or replaces categories on the selected documents (a plan first, then the batches). */
  const changeCategories = async change => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const plan = planCategoryChange(selected, change, categories);
      let failed = 0;
      if (plan.updates.length) {
        setProgress({ done: 0, total: plan.updates.length });
        ({ failed } = await setCategoriesOnDocuments(plan.updates, { onProgress: setProgress }));
      }
      setNotice(describeCategoryChange(change, plan, failed));
    } catch (e) {
      console.error('[documents] changing the categories failed:', e);
      setNotice({ tone: 'error', text: 'Non riesco a cambiare le categorie: riprova.' });
    }
    setProgress(null);
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
              {progress && (
                <div className="basis-full">
                  <ProgressBar value={progress.done} total={progress.total} />
                  <p className="mt-1 text-fs-11 text-slate-soft">
                    Categorie: {progress.done} di {progress.total} documenti
                  </p>
                </div>
              )}
              <span className="flex-1 text-fs-12 font-medium text-ink">{selected.length} selezionati</span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg px-2 py-1.5 text-fs-12 text-slate-soft transition hover:text-ink"
              >
                Deseleziona
              </button>
              {busy && <Loader2 size={14} className="animate-spin text-slate-soft" />}
              <BulkCategoriesMenu
                categories={categories}
                count={selected.length}
                disabled={busy}
                onApply={changeCategories}
              />
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
          {notice && selected.length === 0 && (
            <div
              role="status"
              className={`sticky bottom-0 flex items-start gap-2 rounded-b-xl border-t border-line px-3 py-2 text-fs-12 font-medium ${
                notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'
              }`}
            >
              <span className="min-w-0 flex-1 leading-snug">{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Chiudi"
                className="shrink-0 rounded-lg p-0.5 transition hover:opacity-70"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
