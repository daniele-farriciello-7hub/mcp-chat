import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import ShortcutEditor from './ShortcutEditor';
import Switch from '@/shared/ui/Switch';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import { loadAppUsers } from '@/features/history/appUsers';

const EMPTY_SHORTCUT = { icon: 'question', title: '', description: '', prompt: '' };

export default function ShortcutsTab({ shortcuts, onChange, personalLimit = 0, onPersonalLimitChange }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [users, setUsers] = useState([]);

  // everyone who may use the app, for "Per chi" (admin-only on the server)
  useEffect(() => {
    loadAppUsers()
      .then(setUsers)
      .catch(error => console.warn('[shortcuts] reading the users failed:', error?.message || error));
  }, []);

  const update = (index, key, value) =>
    onChange(shortcuts.map((shortcut, i) => (i === index ? { ...shortcut, [key]: value } : shortcut)));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= shortcuts.length) return;
    const reordered = [...shortcuts];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onChange(reordered);
    setExpandedIndex(target);
  };

  const remove = index => {
    onChange(shortcuts.filter((_, i) => i !== index));
    setExpandedIndex(null);
  };

  const add = () => {
    onChange([...shortcuts, EMPTY_SHORTCUT]);
    setExpandedIndex(shortcuts.length);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] leading-snug text-slate-soft">
        I riquadri che l’operatore vede aprendo la chat, nell’ordine in cui compaiono. Toccarne uno equivale a
        scrivere la domanda. Ognuno può essere per tutti o solo per alcuni utenti; in più, ogni operatore può
        crearsi le sue scorciatoie personali dalla schermata iniziale.
      </p>

      {shortcuts.map((shortcut, index) => (
        <ShortcutEditor
          key={index}
          shortcut={shortcut}
          users={users}
          index={index}
          count={shortcuts.length}
          expanded={expandedIndex === index}
          onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
          onChange={(key, value) => update(index, key, value)}
          onMove={direction => move(index, direction)}
          onRemove={() => remove(index)}
        />
      ))}

      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-[13px] font-medium text-brand-600 transition hover:border-brand-300 hover:bg-brand-50/50"
      >
        <Plus size={15} /> Aggiungi un riquadro
      </button>

      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">
            Scorciatoie personali
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-slate-soft">
            Ogni operatore può crearsi le sue dall’ingranaggio o dalla schermata iniziale. Le vede solo lui.
          </p>
        </div>
        <Switch
          checked={personalLimit > 0}
          onChange={on => onPersonalLimitChange(on ? 10 : 0)}
          label="Limita quante può crearne ognuno"
          description={personalLimit > 0 ? `Al massimo ${personalLimit} a testa.` : 'Nessun limite.'}
        />
        {personalLimit > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-ink">
            Massimo
            <input
              type="number"
              min="1"
              max="500"
              value={personalLimit}
              onChange={e =>
                onPersonalLimitChange(Math.min(500, Math.max(1, Math.round(Number(e.target.value)) || 1)))
              }
              className={`${INPUT_CLASS} w-24`}
              aria-label="Numero massimo di scorciatoie personali"
            />
            per operatore
          </label>
        )}
        <p className={HELP_TEXT_CLASS}>
          Abbassarlo non cancella niente: chi ne ha già di più le tiene, ma non può aggiungerne finché non
          scende sotto il limite.
        </p>
      </div>
    </div>
  );
}
