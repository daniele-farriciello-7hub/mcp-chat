import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import ShortcutEditor from './ShortcutEditor';
import AllPersonalShortcuts from '@/features/shortcuts/AllPersonalShortcuts';
import Switch from '@/shared/ui/Switch';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import { loadAppUsers } from '@/features/history/appUsers';
import { inSubsection } from '@/features/settings/settingsSections';

const EMPTY_SHORTCUT = { icon: 'question', title: '', description: '', prompt: '' };

/** `subsection` (settingsSections.js): riquadri (the tiles of the chat) or personali (the operators' own); none = both. */
export default function ShortcutsTab({
  shortcuts,
  commands,
  onChange,
  personalLimit = 0,
  onPersonalLimitChange,
  subsection
}) {
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

  const shows = id => inSubsection(subsection, id);
  return (
    <div className="flex flex-col gap-2.5">
      {shows('riquadri') && (
        <>
          <p className="text-fs-11 leading-snug text-slate-soft">
            I riquadri che l’operatore vede aprendo la chat, nell’ordine in cui compaiono. Toccarne uno
            equivale a scrivere la domanda. Ognuno può essere per tutti o solo per alcuni utenti; in più, ogni
            operatore può crearsi le sue scorciatoie personali dalla schermata iniziale.
          </p>

          {shortcuts.map((shortcut, index) => (
            <ShortcutEditor
              key={index}
              shortcut={shortcut}
              commands={commands}
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
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-fs-13 font-medium text-brand-600 transition hover:border-brand-300 hover:bg-brand-50/50"
          >
            <Plus size={15} /> Aggiungi un riquadro
          </button>
        </>
      )}

      {shows('personali') && (
        <div className={`flex flex-col gap-3 ${subsection ? '' : 'mt-6 border-t border-line pt-4'}`}>
          <div>
            {/* in the sidebar the page title says it */}
            {!subsection && (
              <h3 className="text-fs-11 font-bold uppercase tracking-[0.12em] text-brand-600">
                Scorciatoie personali
              </h3>
            )}
            <p className={`${subsection ? '' : 'mt-1 '}text-fs-11 leading-snug text-slate-soft`}>
              Ogni operatore non admin può crearsi le sue dall’ingranaggio o dalla schermata iniziale. Le vede
              solo lui; qui sotto le vedi tutte. Le tue, da admin, sono{' '}
              {subsection ? 'quelle tra i «Riquadri»' : 'quelle qui sopra'} con «Per chi» uguale a te: le puoi
              creare anche dalla schermata iniziale.
            </p>
          </div>
          <Switch
            checked={personalLimit > 0}
            onChange={on => onPersonalLimitChange(on ? 10 : 0)}
            label="Limita quante può crearne ognuno"
            description={personalLimit > 0 ? `Al massimo ${personalLimit} a testa.` : 'Nessun limite.'}
          />
          {personalLimit > 0 && (
            <label className="flex items-center gap-2 text-fs-12 text-ink">
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
          <AllPersonalShortcuts />
        </div>
      )}
    </div>
  );
}
