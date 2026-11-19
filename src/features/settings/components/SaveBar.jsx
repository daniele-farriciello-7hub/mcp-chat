import { Check } from 'lucide-react';

/** `saveState` is null | 'saving' | 'saved' | 'failed'. */
export default function SaveBar({ saveState, hasUnsavedChanges, onSave }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saveState === 'saving' || !hasUnsavedChanges}
        className="rounded-xl bg-brand-500 px-4 py-2 text-fs-14 font-semibold text-on-brand transition hover:bg-brand-hover disabled:opacity-40"
      >
        {saveState === 'saving' ? 'Salvo…' : 'Salva'}
      </button>
      {saveState === 'saved' && !hasUnsavedChanges && (
        <span className="flex items-center gap-1.5 text-fs-13 text-ok">
          <Check size={14} strokeWidth={3} /> Salvato
        </span>
      )}
      {saveState === 'failed' && (
        <span className="text-fs-13 text-danger">Non sono riuscito a salvare. Riprova.</span>
      )}
      {!saveState && hasUnsavedChanges && (
        <span className="text-fs-12 text-slate-soft">Le modifiche non sono ancora online.</span>
      )}
    </div>
  );
}
