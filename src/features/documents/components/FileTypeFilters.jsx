import { FILE_TYPES } from '@/features/documents/fileTypes';

const FILTERS = [{ id: 'all', name: 'Tutti' }, ...FILE_TYPES, { id: 'other', name: 'Altro' }];

/** Only types present among the pending documents get a chip. */
export default function FileTypeFilters({ activeType, countByType, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.filter(type => type.id === 'all' || countByType[type.id]).map(type => (
        <button
          key={type.id}
          type="button"
          onClick={() => onChange(type.id)}
          className={`rounded-pill border px-2.5 py-1 text-[11px] font-medium transition ${
            activeType === type.id
              ? 'border-brand-300 bg-brand-50 text-brand-600'
              : 'border-line text-slate-soft hover:text-ink'
          }`}
        >
          {type.name}
          {type.id !== 'all' && <span className="ml-1 opacity-70">{countByType[type.id]}</span>}
        </button>
      ))}
    </div>
  );
}
