/**
 * "Documenti" tab of the settings panel. Guides the admin through upload → index → ready for chat:
 * counters that open each list, a collapsible upload summary that offers to index what was just uploaded
 * (an image's mandatory description is written on its row in the "Da indicizzare" list, which the summary
 * points to), and a progress card for the background indexing queue (which survives closing the panel).
 * The "Drive" view is the other way in: folders and PDFs on Google Drive that the server keeps in step
 * with the archive (features/drive); their documents show up in the same lists.
 *
 * "Categorie" is a fifth view: the fixed list of categories the admins keep and the button that classifies the
 * documents that have none (CategoriesView). Mode (studied / archive only) and category are chosen at upload,
 * shown as pills, changed on the row, and filter every list of documents.
 *
 * The five views (da indicizzare, con errore, indicizzati, Drive, categorie) are the subsections of this tab in the standalone page's
 * sidebar: it passes `view` and `onViewChange`, the strip of views is not drawn (the sidebar is it) and the counters above
 * still switch view. The tab stays mounted while the view changes, so uploads, filters and the descriptions being typed are
 * kept. Without them (no sidebar) the tab keeps the view itself, as it always did.
 */
'use client';

import { useRef, useState } from 'react';
import { NO_CATEGORY } from '@/features/documents/categories';
import { canIndexNow, lacksDescription } from '@/features/documents/indexability';
import { enqueueForIndexing } from '@/features/documents/indexingQueue';
import { useDocuments } from '@/features/documents/useDocuments';
import { useIndexingQueue } from '@/features/documents/useIndexingQueue';
import { useTypedDescriptions } from '@/features/documents/useTypedDescriptions';
import { useUploads } from '@/features/documents/useUploads';
import DriveView from '@/features/drive/components/DriveView';
import { DOCUMENT_MODE } from '@/features/documents/archiveMode';
import ArchiveHeader from './ArchiveHeader';
import CategoriesView from './CategoriesView';
import CategoryFilter from './CategoryFilter';
import ClassifyDocuments from './ClassifyDocuments';
import DocumentViewTabs from './DocumentViewTabs';
import FileTypeFilters from './FileTypeFilters';
import IndexedDocumentList from './IndexedDocumentList';
import IndexingProgress from './IndexingProgress';
import ModeFilters from './ModeFilters';
import NameFilterInput from './NameFilterInput';
import SelectableDocumentList from './SelectableDocumentList';
import UploadProgressPanel from './UploadProgressPanel';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      <div className="h-28 animate-pulse rounded-xl bg-line" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-line" />
      ))}
    </div>
  );
}

/** The subsections of this tab (settingsSections.js) and the views they show. */
export const DOCUMENT_VIEW_OF_SUBSECTION = {
  'da-indicizzare': 'pending',
  errori: 'failed',
  indicizzati: 'indexed',
  drive: 'drive',
  categorie: 'categories'
};
export const SUBSECTION_OF_DOCUMENT_VIEW = Object.fromEntries(
  Object.entries(DOCUMENT_VIEW_OF_SUBSECTION).map(([subsection, view]) => [view, subsection])
);

/**
 * `categories` is the admins' list (the setting `documentCategories`, kept by the settings panel) and
 * `onCategoriesSaved(list)` is told when this tab saves a new one, so the panel's own copy follows.
 */
export default function DocumentsTab({
  view: controlledView,
  onViewChange,
  categories = [],
  onCategoriesSaved = () => {}
}) {
  const [ownView, setOwnView] = useState('pending');
  const controlled = controlledView !== undefined;
  const view = controlled ? controlledView : ownView;
  const setView = controlled ? onViewChange : setOwnView;
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  // how the files picked next are used: studied unless the admin says otherwise
  const [uploadMode, setUploadMode] = useState(DOCUMENT_MODE.studied);
  // a category taken off the list can no longer be filtered on
  const activeCategoryFilter =
    categoryFilter === 'all' || categoryFilter === NO_CATEGORY || categories.includes(categoryFilter)
      ? categoryFilter
      : 'all';

  const catalog = useDocuments({
    nameFilter,
    typeFilter,
    modeFilter,
    categoryFilter: activeCategoryFilter,
    categories
  });
  const uploads = useUploads();
  const queue = useIndexingQueue();
  const typed = useTypedDescriptions();
  const rootRef = useRef(null);

  if (!catalog.documents && !catalog.loadError) return <LoadingSkeleton />;

  const uploadedIds = new Set(uploads.uploadedIds);
  const uploaded = (catalog.documents || []).filter(d => uploadedIds.has(d.id));
  // judged on the text in the fields, not on what is saved yet: the summary's button must not lag behind
  // typing. Only the rows of the "Da indicizzare" list have a field, so that is where they are written.
  const withoutDescription = uploaded.filter(d => lacksDescription(typed.withTyped(d)));

  // takes the admin to the first just-uploaded image still without a description: in "Da indicizzare",
  // with the filters out of the way if they hide it, scrolled to and focused. The row exists only once
  // that list is on screen, hence the wait for the next frame.
  const showMissingDescriptions = () => {
    const hidden = withoutDescription.some(d => !catalog.pending.some(p => p.id === d.id));
    setView('pending');
    if (hidden) {
      setNameFilter('');
      setTypeFilter('all');
      setModeFilter('all');
      setCategoryFilter('all');
    }
    requestAnimationFrame(() => {
      const missingIds = new Set(withoutDescription.map(d => d.id));
      const fields = [...(rootRef.current?.querySelectorAll('textarea[data-description-field]') || [])];
      const field = fields.find(f => missingIds.has(f.dataset.documentId));
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field?.focus({ preventScroll: true });
    });
  };

  // rejects if a description typed a moment ago cannot be saved: nothing is queued then
  const indexUploaded = async () => {
    // the fields save a moment after typing stops: write what is still waiting, so indexing finds it
    await typed.saveTyped(uploaded);
    enqueueForIndexing(uploaded.map(typed.withTyped).filter(canIndexNow));
    uploads.dismiss();
    setView('pending');
  };

  const showsSelectableList = view === 'pending' || view === 'failed';
  const filtersActive = Boolean(nameFilter) || modeFilter !== 'all' || activeCategoryFilter !== 'all';

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <ArchiveHeader
        totals={catalog.totals}
        activeView={view}
        onSelectView={setView}
        onUpload={uploads.upload}
        uploading={uploads.summary.running}
        uploadMode={uploadMode}
        onUploadModeChange={setUploadMode}
      />

      <UploadProgressPanel
        key={uploads.summary.batchId}
        uploads={uploads.uploads}
        summary={uploads.summary}
        missingDescriptions={withoutDescription.length}
        onReplace={uploads.replaceExisting}
        onReplaceAll={uploads.replaceAllExisting}
        onIndexUploaded={indexUploaded}
        onShowMissingDescriptions={showMissingDescriptions}
        onDismiss={uploads.dismiss}
      />

      {queue && (
        <div className="rounded-xl border border-line">
          <IndexingProgress queue={queue} />
        </div>
      )}

      {catalog.loadError && (
        <div className="rounded-xl bg-danger-soft p-3 text-fs-12 text-danger">{catalog.loadError}</div>
      )}

      {!controlled && <DocumentViewTabs activeView={view} onChange={setView} totals={catalog.totals} />}

      {view !== 'drive' && view !== 'categories' && (
        <>
          <NameFilterInput value={nameFilter} onChange={setNameFilter} />
          <div className="flex flex-wrap items-center gap-2">
            <ModeFilters value={modeFilter} counts={catalog.modeCounts} onChange={setModeFilter} />
            <CategoryFilter
              value={activeCategoryFilter}
              categories={categories}
              counts={catalog.categoryCounts}
              withoutCount={catalog.withoutCategory}
              onChange={setCategoryFilter}
            />
          </div>
        </>
      )}

      {showsSelectableList && (
        <>
          <FileTypeFilters
            activeType={typeFilter}
            countByType={catalog.countByType}
            onChange={setTypeFilter}
          />
          <SelectableDocumentList
            key={view}
            mode={view}
            documents={view === 'pending' ? catalog.pending : catalog.failed}
            typed={typed}
            filtersActive={filtersActive || typeFilter !== 'all'}
          />
        </>
      )}

      {view === 'indexed' && (
        <>
          {/* what the filters show, so a few documents can be classified without touching the rest */}
          <ClassifyDocuments
            documents={catalog.indexed}
            categories={categories}
            scope={filtersActive ? 'di quelli in elenco' : 'indicizzati'}
          />
          <IndexedDocumentList
            documents={catalog.indexed}
            filtersActive={filtersActive}
            categories={categories}
          />
        </>
      )}

      {view === 'drive' && <DriveView documents={catalog.documents || []} />}

      {view === 'categories' && (
        <CategoriesView
          categories={categories}
          documents={catalog.documents || []}
          onSaved={onCategoriesSaved}
        />
      )}
    </div>
  );
}
