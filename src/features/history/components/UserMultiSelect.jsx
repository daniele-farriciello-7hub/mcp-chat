/**
 * Pick one, several or all users by email.
 *
 * Nothing ticked and everything ticked both mean "Tutti gli utenti" — the filter never ends up
 * showing nothing because someone cleared the list. "Seleziona tutti" / "Deseleziona" act on what
 * the search shows, so "cerca weunit → seleziona i 12 trovati" is two clicks. The trigger shows who
 * is picked as chips, each removable without opening the list, plus one ✕ to start over.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

const MAX_CHIPS = 2;

export default function UserMultiSelect({ users, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = event => !rootRef.current?.contains(event.target) && setOpen(false);
    const closeOnEscape = event => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? users.filter(u => u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle))
    : users;
  const visibleSelected = visible.filter(u => selected.has(u.uid)).length;
  const everyone = selected.size === 0 || selected.size === users.length;
  const picked = users.filter(u => selected.has(u.uid));

  const toggle = uid => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChange(next);
  };
  const selectVisible = () => onChange(new Set([...selected, ...visible.map(u => u.uid)]));
  const deselectVisible = () => {
    const hidden = new Set(visible.map(u => u.uid));
    onChange(new Set([...selected].filter(uid => !hidden.has(uid))));
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div
        className={`flex min-h-[38px] w-full items-center gap-1.5 rounded-xl border bg-white py-1 pl-2 pr-1 transition ${
          open ? 'border-brand-300' : 'border-line hover:border-brand-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5 text-left text-[13px] text-ink"
        >
          {everyone ? (
            <span className="px-1">Tutti gli utenti</span>
          ) : (
            <>
              {picked.slice(0, MAX_CHIPS).map(u => (
                <span
                  key={u.uid}
                  className="flex max-w-[180px] items-center gap-1 rounded-md bg-brand-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-brand-600"
                >
                  <span className="truncate">{u.email}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Togli ${u.email}`}
                    onClick={event => {
                      event.stopPropagation();
                      toggle(u.uid);
                    }}
                    onKeyDown={event => event.key === 'Enter' && toggle(u.uid)}
                    className="rounded p-0.5 hover:bg-brand-100"
                  >
                    <X size={10} />
                  </span>
                </span>
              ))}
              {picked.length > MAX_CHIPS && (
                <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-slate-soft">
                  +{picked.length - MAX_CHIPS}
                </span>
              )}
            </>
          )}
        </button>
        {!everyone && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            aria-label="Mostra tutti gli utenti"
            title="Mostra tutti gli utenti"
            className="shrink-0 rounded-lg p-1 text-slate-soft hover:bg-surface hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Chiudi elenco utenti' : 'Apri elenco utenti'}
          className="shrink-0 rounded-lg p-1 text-slate-soft hover:bg-surface"
        >
          <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 flex flex-col rounded-xl border border-line bg-white shadow-lift">
          <div className="p-2 pb-1.5">
            <label className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
              <Search size={13} className="text-slate-soft" />
              <input
                autoFocus
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Cerca per email o nome"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none"
              />
              {filter && (
                <button type="button" onClick={() => setFilter('')} aria-label="Cancella ricerca">
                  <X size={12} className="text-slate-soft" />
                </button>
              )}
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-line px-3 pb-2 text-[11px]">
            <span className="text-slate-soft">
              {needle ? `${visible.length} trovati` : `${users.length} utenti`}
              {selected.size > 0 && ` · ${selected.size} selezionati`}
            </span>
            <span className="flex gap-3">
              <button
                type="button"
                onClick={selectVisible}
                disabled={!visible.length || visibleSelected === visible.length}
                className="font-semibold text-brand-600 hover:underline disabled:text-slate-soft disabled:no-underline disabled:opacity-50"
              >
                {needle ? 'Seleziona i trovati' : 'Seleziona tutti'}
              </button>
              <button
                type="button"
                onClick={deselectVisible}
                disabled={!visibleSelected}
                className="font-semibold text-brand-600 hover:underline disabled:text-slate-soft disabled:no-underline disabled:opacity-50"
              >
                Deseleziona
              </button>
            </span>
          </div>

          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto p-1">
            {visible.map(u => {
              const checked = selected.has(u.uid);
              return (
                <li key={u.uid}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(u.uid)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
                      checked ? 'bg-brand-50/60' : 'hover:bg-surface'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
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
              <li className="px-2.5 py-3 text-center text-[12px] text-slate-soft">Nessun utente trovato.</li>
            )}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className="text-[11px] text-slate-soft">
              {everyone
                ? 'Mostro tutti gli utenti'
                : `Mostro ${selected.size} ${selected.size === 1 ? 'utente' : 'utenti'}`}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-brand-500 px-3 py-1 text-[12px] font-semibold text-white transition hover:bg-brand-600"
            >
              Fatto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
