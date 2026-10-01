import { SHORTCUT_ICONS } from '@/features/settings/defaultSettings';
import Tooltip from '@/shared/ui/Tooltip';
import ShortcutIcon from './ShortcutIcon';

/** Icons are picked by looking at them, not by reading names in a dropdown. */
export default function IconPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(SHORTCUT_ICONS).map(([id, name]) => {
        const selected = id === value;
        return (
          <Tooltip key={id} label={name}>
            <button
              type="button"
              onClick={() => onChange(id)}
              aria-label={name}
              aria-pressed={selected}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                selected
                  ? 'border-brand-300 bg-brand-50 text-brand-500'
                  : 'border-line text-slate-soft hover:border-brand-200 hover:text-ink'
              }`}
            >
              <ShortcutIcon id={id} size={16} strokeWidth={2.25} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
