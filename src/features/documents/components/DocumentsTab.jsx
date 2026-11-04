/**
 * "Documenti" tab of the settings panel. Guides the admin through upload → index → ready for chat:
 * counters that open each list, a collapsible upload summary that offers to index what was just uploaded
 * (an image's mandatory description is written on its row in the "Da indicizzare" list, which the summary
 * points to), and a progress card for the background indexing queue (which survives closing the panel).
 */
'use client';

import { useRef, useState } from 'react';
import { canIndexNow, lacksDescription } from '@/features/documents/indexability';
import { enqueueForIndexing } from '@/features/documents/indexingQueue';
import { useDocuments } from '@/features/documents/useDocuments';
import { useIndexingQueue } from '@/features/documents/useIndexingQueue';
import { useTypedDescriptions } from '@/features/documents/useTypedDescriptions';
import { useUploads } from '@/features/documents/useUploads';
import ArchiveHeader from './ArchiveHeader';
import DocumentViewTabs from './DocumentViewTabs';
import FileTypeFilters from './FileTypeFilters';
import IndexedDocumentList from './IndexedDocumentList';
import IndexingProgress from './IndexingProgress';
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

export default function DocumentsTab() {
  const [view, setView] = useState('pending');
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const catalog = useDocuments({ nameFilter, typeFilter });
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

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <ArchiveHeader
        totals={catalog.totals}
        activeView={view}
        onSelectView={setView}
        onUpload={uploads.upload}
        uploading={uploads.summary.running}
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
        <div className="rounded-xl bg-danger-soft p-3 text-[12px] text-danger">{catalog.loadError}</div>
      )}

      <DocumentViewTabs activeView={view} onChange={setView} totals={catalog.totals} />

      <NameFilterInput value={nameFilter} onChange={setNameFilter} />

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
            filtersActive={Boolean(nameFilter) || typeFilter !== 'all'}
          />
        </>
      )}

      {view === 'indexed' && (
        <IndexedDocumentList documents={catalog.indexed} filtersActive={Boolean(nameFilter)} />
      )}
    </div>
  );
}
