import { Archive, BookOpen } from 'lucide-react';
import { DOCUMENT_MODES, modeOf, isArchive } from '@/features/documents/archiveMode';
import { visibleCategories } from '@/features/documents/categories';

/**
 * Mode and categories of a document as small pills, for its row. `categories` is the admins' list: a name
 * that has left it is not shown. The mode pill is the same on every row, so it is quiet for a studied
 * document (what every document was) and stands out for an archive one.
 */
export default function DocumentPills({ document, categories }) {
  const mode = DOCUMENT_MODES.find(m => m.id === modeOf(document));
  const own = visibleCategories(document.categories, categories);
  const Icon = isArchive(document) ? Archive : BookOpen;
  return (
    <>
      <span
        className={`inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-fs-10 font-semibold ${
          isArchive(document) ? 'bg-warn-soft text-warn' : 'bg-surface text-slate-soft'
        }`}
        title={mode.description}
      >
        <Icon size={10} /> {mode.pill}
      </span>
      {own.map(name => (
        <span
          key={name}
          className="rounded-pill bg-brand-50 px-1.5 py-0.5 text-fs-10 font-semibold text-brand-600"
        >
          {name}
        </span>
      ))}
    </>
  );
}
