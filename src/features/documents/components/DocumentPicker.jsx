/**
 * Chooses documents by hand, in an order, for a list of documents without AI whose selection is "Scelti a mano"
 * (NoAiDocumentListRow.jsx): what has been chosen so far, with up / down / remove, and under it a search box over the
 * indexed documents to add more from. `documents` are the indexed documents as catalog entries (`catalogEntryOf`:
 * id, name, mode), `value` the chosen ids in order, `onChange` gets the new ids. An id that is no longer among the
 * indexed documents (deleted, or not indexed any more) stays in the list as "non più disponibile" until the admin
 * takes it off: the chat skips it without a word, so nothing is lost by leaving it, but the admin sees it.
 */
'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import { HELP_TEXT_CLASS } from '@/shared/ui/formStyles';
import { foldText } from '@/features/documents/textMatch';
import { MAX_FIXED_DOCUMENTS } from '@/features/chat/documentLists/documentListSettings';

const ICON_BUTTON =
  'rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-soft';

// the result list shows this many at most: a search narrows it, scrolling through hundreds does not help
const MAX_RESULTS = 40;

export default function DocumentPicker({ documents, value, onChange }) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(documents.map(entry => [entry.id, entry])), [documents]);
  const full = value.length >= MAX_FIXED_DOCUMENTS;

  const needle = foldText(query);
  const matches = useMemo(() => {
    const taken = new Set(value);
    return documents
      .filter(entry => !taken.has(entry.id) && (!needle || foldText(entry.name).includes(needle)))
      .slice(0, MAX_RESULTS + 1);
  }, [documents, value, needle]);

  const move = (index, step) => {
    const next = [...value];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-fs-12 font-semibold text-ink">Documenti scelti</span>
          <span className="text-fs-11 text-slate-soft">
            {value.length} di {MAX_FIXED_DOCUMENTS}
          </span>
        </div>
        {value.length === 0 ? (
          <p className="rounded-xl bg-surface px-3 py-3 text-center text-fs-12 text-slate-soft">
            Nessun documento: cercalo qui sotto e aggiungilo.
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {value.map((id, index) => {
              const entry = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-1 px-3 py-1.5">
                  <span
                    className={`min-w-0 flex-1 truncate text-fs-12 ${entry ? 'font-medium text-ink' : 'italic text-slate-soft'}`}
                    title={entry?.name}
                  >
                    {entry ? entry.name : 'Documento non più disponibile'}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Sposta su"
                    className={ICON_BUTTON}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === value.length - 1}
                    aria-label="Sposta giù"
                    className={ICON_BUTTON}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter(item => item !== id))}
                    aria-label={`Togli ${entry?.name ?? 'il documento'}`}
                    className={ICON_BUTTON}
                  >
                    <X size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={14} className="text-slate-soft" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca un documento da aggiungere"
            aria-label="Cerca un documento da aggiungere"
            className="w-full bg-transparent text-fs-13 text-ink outline-none placeholder:text-slate-soft"
          />
        </label>
        {full && (
          <p className={HELP_TEXT_CLASS}>Hai raggiunto il massimo di {MAX_FIXED_DOCUMENTS} documenti.</p>
        )}
        {matches.length === 0 ? (
          <p className={HELP_TEXT_CLASS}>
            {documents.length === 0
              ? 'Non c’è ancora nessun documento indicizzato.'
              : needle
                ? 'Nessun documento con questo nome.'
                : 'Hai già scelto tutti i documenti indicizzati.'}
          </p>
        ) : (
          <ul className="mt-1.5 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {matches.slice(0, MAX_RESULTS).map(entry => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onChange([...value, entry.id])}
                  disabled={full}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={13} className="shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1 truncate text-fs-12 text-ink" title={entry.name}>
                    {entry.name}
                  </span>
                </button>
              </li>
            ))}
            {matches.length > MAX_RESULTS && (
              <li className="px-3 py-1.5 text-fs-11 text-slate-soft">
                Ce ne sono altri: scrivi qualche lettera in più per restringere.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
