import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import Field from '@/shared/ui/Field';
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import Tooltip from '@/shared/ui/Tooltip';
import IconPicker from './IconPicker';
import ShortcutIcon from './ShortcutIcon';
import UserMultiSelect from '@/features/history/components/UserMultiSelect';

/** How the shortcut looks in the welcome screen; also the row you tap to expand the editor. */
function ShortcutPreview({ icon, title, description, uids }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-50 text-brand-500">
        <ShortcutIcon id={icon} size={15} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-semibold text-ink">
          {title || 'Riquadro senza titolo'}
        </span>
        <span className="block truncate text-[11px] text-slate-soft">
          {description || 'Una riga che spiega a cosa serve'}
        </span>
        <span className="block text-[10px] font-medium text-brand-600">
          {uids?.length ? `Solo per ${uids.length} ${uids.length === 1 ? 'utente' : 'utenti'}` : 'Per tutti'}
        </span>
      </span>
    </span>
  );
}

const ICON_BUTTON_CLASS =
  'rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';

export default function ShortcutEditor({
  shortcut,
  users,
  index,
  count,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove
}) {
  return (
    <div
      className={`rounded-xl border transition ${expanded ? 'border-brand-200 shadow-soft' : 'border-line'}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl p-2.5 text-left transition hover:bg-surface"
      >
        <ShortcutPreview {...shortcut} />
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-soft transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
          <Field label="Icona">
            <IconPicker value={shortcut.icon} onChange={value => onChange('icon', value)} />
          </Field>
          <Field label="Titolo">
            <input
              value={shortcut.title}
              onChange={e => onChange('title', e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Riga sotto il titolo">
            <input
              value={shortcut.description}
              onChange={e => onChange('description', e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Domanda"
            help="Quello che viene scritto in chat quando l’operatore tocca il riquadro."
          >
            <input
              value={shortcut.prompt}
              onChange={e => onChange('prompt', e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            label="Per chi"
            help="Nessuno scelto: lo vedono tutti. Altrimenti solo gli utenti scelti, oltre alle loro scorciatoie personali."
          >
            <UserMultiSelect
              users={users}
              selected={new Set(shortcut.uids || [])}
              onChange={selected => onChange('uids', [...selected])}
            />
          </Field>

          <div className="flex items-center gap-1 border-t border-line pt-2.5">
            <Tooltip label="Sposta su" align="left">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                aria-label="Sposta su"
                className={ICON_BUTTON_CLASS}
              >
                <ChevronUp size={15} />
              </button>
            </Tooltip>
            <Tooltip label="Sposta giù">
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === count - 1}
                aria-label="Sposta giù"
                className={ICON_BUTTON_CLASS}
              >
                <ChevronDown size={15} />
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-soft transition hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={14} /> Elimina
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
