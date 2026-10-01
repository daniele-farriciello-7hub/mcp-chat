/**
 * "Documenti" tab of the settings panel. Guides the admin through upload → index → ready for chat:
 * counters that open each list, a collapsible upload summary that offers to index what was just
 * uploaded, and a progress card for the background indexing queue (which survives closing the panel).
 */
'use client';

import { useState } from 'react';
import { canIndexNow } from '@/features/documents/indexability';
import { enqueueForIndexing } from '@/features/documents/indexingQueue';
import { useDocuments } from '@/features/documents/useDocuments';
import { useIndexingQueue } from '@/features/documents/useIndexingQueue';
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

  if (!catalog.documents && !catalog.loadError) return <LoadingSkeleton />;

  const indexUploaded = () => {
    const ids = new Set(uploads.uploadedIds);
    enqueueForIndexing((catalog.documents || []).filter(d => ids.has(d.id) && canIndexNow(d)));
    uploads.dismiss();
    setView('pending');
  };

  const showsSelectableList = view === 'pending' || view === 'failed';

  return (
    <div className="flex flex-col gap-3">
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
        onReplace={uploads.replaceExisting}
        onReplaceAll={uploads.replaceAllExisting}
        onIndexUploaded={indexUploaded}
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
