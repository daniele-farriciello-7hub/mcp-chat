import { DOCUMENT_MODE } from '@/features/documents/archiveMode';

const FILTERS = [
  { id: 'all', name: 'Tutti' },
  { id: DOCUMENT_MODE.studied, name: 'Studiati' },
  { id: DOCUMENT_MODE.archive, name: 'Archivio' }
];

/** Which documents to list by how the assistant uses them. `counts` is `{ studied, archive }` for the whole archive. */
export default function ModeFilters({ value, counts, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra per modalità">
      {FILTERS.map(filter => (
        <button
          key={filter.id}
          type="button"
          aria-pressed={value === filter.id}
          onClick={() => onChange(filter.id)}
          className={`rounded-pill border px-2.5 py-1 text-fs-11 font-medium transition ${
            value === filter.id
              ? 'border-brand-300 bg-brand-50 text-brand-600'
              : 'border-line text-slate-soft hover:text-ink'
          }`}
        >
          {filter.name}
          {filter.id !== 'all' && <span className="ml-1 opacity-70">{counts[filter.id] || 0}</span>}
        </button>
      ))}
    </div>
  );
}
