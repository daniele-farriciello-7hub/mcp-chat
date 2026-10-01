import { useState } from 'react';
import { Plus } from 'lucide-react';
import ShortcutEditor from './ShortcutEditor';

const EMPTY_SHORTCUT = { icon: 'question', title: '', description: '', prompt: '' };

export default function ShortcutsTab({ shortcuts, onChange }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

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
        scrivere la domanda.
      </p>

      {shortcuts.map((shortcut, index) => (
        <ShortcutEditor
          key={index}
          shortcut={shortcut}
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
    </div>
  );
}
