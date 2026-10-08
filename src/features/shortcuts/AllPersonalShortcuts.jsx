/**
 * Admin view, in the Scorciatoie tab: the personal shortcuts every operator made for themselves,
 * grouped by person. Read-only — they are each operator's own; a useful one can be turned into an
 * admin shortcut above, for everyone or for chosen users.
 */
'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ShortcutIcon from '@/features/settings/components/ShortcutIcon';
import { SkeletonCards } from '@/shared/ui/Skeleton';
import { loadAllPersonalShortcuts } from './personalShortcuts';

function Owner({ owner }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">
            {owner.email || owner.uid}
          </span>
          {owner.name && <span className="block truncate text-[11px] text-slate-soft">{owner.name}</span>}
        </span>
        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
          {owner.shortcuts.length}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-soft transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 border-t border-line p-2">
          {owner.shortcuts.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <ShortcutIcon id={s.icon} size={14} strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-ink">{s.title}</span>
                <span className="block text-[11px] leading-snug text-slate-soft">{s.prompt}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AllPersonalShortcuts() {
  const [owners, setOwners] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadAllPersonalShortcuts()
      .then(setOwners)
      .catch(e => {
        console.warn('[shortcuts] loading everyone’s failed:', e?.message || e);
        setError(true);
      });
  }, []);

  if (error)
    return <p className="text-[12px] text-danger">Non riesco a leggere le scorciatoie degli operatori.</p>;
  if (!owners) return <SkeletonCards count={2} />;
  if (!owners.length) {
    return (
      <p className="rounded-xl bg-surface px-3 py-3 text-center text-[12px] text-slate-soft">
        Nessun operatore si è ancora creato scorciatoie personali.
      </p>
    );
  }
  const total = owners.reduce((n, o) => n + o.shortcuts.length, 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-slate-soft">
        {total} scorciatoie di {owners.length} {owners.length === 1 ? 'operatore' : 'operatori'}.
      </p>
      {owners.map(owner => (
        <Owner key={owner.uid} owner={owner} />
      ))}
    </div>
  );
}
