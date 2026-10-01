/**
 * Manual review/edit of one table's card — the summary and, per column, what it means. Prefilled
 * from whatever is already there (an AI draft or a previous edit); saving here is always available,
 * whether or not the card came from `cardQueue.js`.
 */
'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { saveTableCard } from '../connectionStore';

export default function TableCardEditor({ connectionId, table }) {
  const [summary, setSummary] = useState(table.card?.summary || '');
  const [columnText, setColumnText] = useState(() =>
    Object.fromEntries(table.columns.map(c => [c.name, table.card?.columns?.[c.name] ?? c.comment ?? '']))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const columns = Object.fromEntries(Object.entries(columnText).filter(([, v]) => v.trim()));
      await saveTableCard(connectionId, table.id, { summary, columns });
      setSaved(true);
    } catch (error) {
      console.error('[database] saving table card failed:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-2.5">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-ink">Riassunto</span>
        <textarea
          rows={2}
          value={summary}
          onChange={e => {
            setSummary(e.target.value);
            setSaved(false);
          }}
          className={`${INPUT_CLASS} resize-y text-[12px]`}
          placeholder="A cosa serve questa tabella…"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-ink">Colonne</span>
        {table.columns.map(column => (
          <div key={column.name} className="grid grid-cols-[minmax(0,110px)_1fr] items-center gap-2">
            <span
              className="truncate text-[11px] font-mono text-slate-soft"
              title={`${column.name} — ${column.columnType || column.dataType}`}
            >
              {column.name}
            </span>
            <input
              className={`${INPUT_CLASS} py-1 text-[12px]`}
              value={columnText[column.name] || ''}
              onChange={e => {
                setColumnText(current => ({ ...current, [column.name]: e.target.value }));
                setSaved(false);
              }}
              placeholder="Cosa contiene…"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button primary onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Salva scheda
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-[12px] text-ok">
            <Check size={14} strokeWidth={3} /> Salvata
          </span>
        )}
      </div>
    </div>
  );
}
