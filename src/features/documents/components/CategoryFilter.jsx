import { NO_CATEGORY } from '@/features/documents/categories';

/**
 * Which documents to list by category: one of the admins' list, or those with none. `counts` is `{ name:
 * documents }` for the whole archive, `withoutCount` how many have no category at all. Not drawn without a list.
 */
export default function CategoryFilter({ value, categories, counts, withoutCount, onChange }) {
  if (!categories.length) return null;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Filtra per categoria"
      className="rounded-pill border border-line bg-panel px-2.5 py-1 text-fs-11 font-medium text-ink outline-none transition focus:border-brand-300"
    >
      <option value="all">Tutte le categorie</option>
      {categories.map(name => (
        <option key={name} value={name}>
          {name} ({counts[name] || 0})
        </option>
      ))}
      <option value={NO_CATEGORY}>Senza categoria ({withoutCount})</option>
    </select>
  );
}
