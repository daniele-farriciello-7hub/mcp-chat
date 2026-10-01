import IndexedDocumentRow from './IndexedDocumentRow';

export default function IndexedDocumentList({ documents, filtersActive }) {
  return (
    <div className="rounded-xl border border-line">
      {documents.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] text-slate-soft">
          {filtersActive
            ? 'Nessun documento indicizzato corrisponde.'
            : 'Nessun documento indicizzato finora.'}
        </p>
      ) : (
        <div className="divide-y divide-line">
          {documents.map(document => (
            <IndexedDocumentRow key={document.id} document={document} />
          ))}
        </div>
      )}
    </div>
  );
}
