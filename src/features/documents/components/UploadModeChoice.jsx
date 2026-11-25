import { Archive, BookOpen } from 'lucide-react';
import { DOCUMENT_MODES, DOCUMENT_MODE } from '@/features/documents/archiveMode';

const ICONS = { [DOCUMENT_MODE.studied]: BookOpen, [DOCUMENT_MODE.archive]: Archive };

/**
 * The choice made before uploading: does Vale study the files or only keep them to hand over. It applies to
 * the files picked next and can be changed later, per document, on its row.
 */
export default function UploadModeChoice({ value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Come Vale usa i file che carichi"
      className="mt-3 grid grid-cols-2 gap-2"
    >
      {DOCUMENT_MODES.map(mode => {
        const Icon = ICONS[mode.id];
        const selected = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode.id)}
            className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition ${
              selected
                ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
                : 'border-line hover:border-brand-200 hover:bg-surface'
            }`}
          >
            <span
              className={`flex items-center gap-1.5 text-fs-12 font-semibold ${selected ? 'text-brand-600' : 'text-ink'}`}
            >
              <Icon size={13} /> {mode.name}
            </span>
            <span className="text-fs-11 leading-snug text-slate-soft">{mode.description}</span>
          </button>
        );
      })}
    </div>
  );
}
