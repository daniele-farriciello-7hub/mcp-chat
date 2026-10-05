/**
 * Pick one, several or all users by email. Nothing ticked means everyone — the list never has to be
 * cleared one by one to get back to "Tutti gli utenti".
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export default function UserMultiSelect({ users, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => !rootRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = uid => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChange(next);
  };

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? users.filter(u => u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle))
    : users;
  const summary =
    selected.size === 0
      ? 'Tutti gli utenti'
      : selected.size === 1
        ? users.find(u => selected.has(u.uid))?.email || '1 utente'
        : `${selected.size} utenti`;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left text-[13px] text-ink transition hover:border-brand-200"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-soft transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-2 shadow-lift">
          <label className="mb-1.5 flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
            <Search size={13} className="text-slate-soft" />
            <input
              autoFocus
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Cerca per email o nome"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-ink hover:bg-surface"
          >
            <span className="flex h-4 w-4 items-center justify-center">
              {selected.size === 0 && <Check size={13} className="text-brand-500" />}
            </span>
            Tutti gli utenti
          </button>
          <ul
            role="listbox"
            aria-multiselectable="true"
            className="max-h-60 overflow-y-auto border-t border-line pt-1"
          >
            {visible.map(u => {
              const checked = selected.has(u.uid);
              return (
                <li key={u.uid}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(u.uid)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white'
                      }`}
                    >
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-ink">{u.email}</span>
                      {u.name && <span className="block truncate text-[11px] text-slate-soft">{u.name}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {!visible.length && (
              <li className="px-2.5 py-2 text-[12px] text-slate-soft">Nessun utente trovato.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
