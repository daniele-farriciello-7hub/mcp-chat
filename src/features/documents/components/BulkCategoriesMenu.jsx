/**
 * "Categorie" in the selection bar of the indexed list: a button that opens a small popover where the admin
 * picks up to three categories of the list and what to do with them on every selected document: "Aggiungi",
 * "Togli" or "Sostituisci" (this one asks to be confirmed first: it overwrites). The popover only chooses;
 * `onApply({ action, names })` does the work (IndexedDocumentList).
 *
 * The popover is placed against the bar (the nearest positioned ancestor: this component draws no box of its own),
 * not against its button, which can end up anywhere when the bar wraps on a narrow panel. Escape or a press outside closes it.
 */
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Tags } from 'lucide-react';
import { HELP_TEXT_CLASS } from '@/shared/ui/formStyles';
import { CATEGORY_ACTION } from '@/features/documents/bulkCategories';
import { MAX_CATEGORIES_PER_DOCUMENT } from '@/features/documents/categories';

const actionButton =
  'rounded-xl border border-line px-2 py-2 text-fs-12 font-semibold text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40';

export default function BulkCategoriesMenu({ categories, count, disabled, onApply }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [confirming, setConfirming] = useState(false); // "Sostituisci" waits for a second click
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverId = useId();

  // the list can change under an open popover (it is edited in another subsection): what is no longer in it is not chosen
  const names = chosen.filter(name => categories.includes(name));
  const full = names.length >= MAX_CATEGORIES_PER_DOCUMENT;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = event => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    setOpen(false);
    buttonRef.current?.focus();
  };

  const toggle = name => {
    setConfirming(false);
    setChosen(names.includes(name) ? names.filter(item => item !== name) : full ? names : [...names, name]);
  };

  const apply = action => {
    setOpen(false);
    setConfirming(false);
    setChosen([]);
    onApply({ action, names });
  };

  const none = categories.length === 0;
  const documentsLabel = count === 1 ? '1 documento' : `${count} documenti`;

  return (
    <span ref={rootRef} className="contents" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || none}
        onClick={() => setOpen(value => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        title={
          none
            ? 'Non c’è ancora nessuna categoria: creale in Documenti → Categorie'
            : 'Aggiungi, togli o sostituisci le categorie dei documenti selezionati'
        }
        className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-fs-12 font-semibold text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Tags size={14} /> Categorie
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Categorie dei documenti selezionati"
          className="absolute bottom-full right-3 z-20 mb-2 w-80 max-w-[calc(100%-1.5rem)] rounded-xl border border-line bg-panel p-3 shadow-lift"
        >
          <p className="text-fs-12 font-semibold text-ink">
            Categorie di {documentsLabel} {count === 1 ? 'selezionato' : 'selezionati'}
          </p>
          <p className={HELP_TEXT_CLASS}>
            Scegli fino a {MAX_CATEGORIES_PER_DOCUMENT} categorie, poi cosa farne.
          </p>

          <ul className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {categories.map(name => {
              const on = names.includes(name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => toggle(name)}
                    title={
                      !on && full
                        ? `Al massimo ${MAX_CATEGORIES_PER_DOCUMENT} categorie alla volta`
                        : undefined
                    }
                    className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-fs-11 font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      on
                        ? 'border-brand-300 bg-brand-50 text-brand-600'
                        : 'border-line text-slate-soft hover:text-ink'
                    }`}
                  >
                    {on && <Check size={10} strokeWidth={3} />} {name}
                  </button>
                </li>
              );
            })}
          </ul>

          {confirming ? (
            <div className="mt-3">
              <p className="text-fs-12 leading-snug text-ink">
                Sostituire le categorie di {documentsLabel} con {names.join(', ')}? Quelle che hanno adesso
                vengono tolte.
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-2 py-1.5 text-fs-12 text-slate-soft transition hover:text-ink"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => apply(CATEGORY_ACTION.replace)}
                  className="rounded-xl bg-brand-500 px-3 py-1.5 text-fs-12 font-semibold text-on-brand transition hover:bg-brand-hover"
                >
                  Sì, sostituisci
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={names.length === 0}
                  onClick={() => apply(CATEGORY_ACTION.add)}
                  title="Le dà a chi ha ancora posto"
                  className="rounded-xl bg-brand-500 px-2 py-2 text-fs-12 font-semibold text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Aggiungi
                </button>
                <button
                  type="button"
                  disabled={names.length === 0}
                  onClick={() => apply(CATEGORY_ACTION.remove)}
                  title="Le toglie a chi le ha"
                  className={actionButton}
                >
                  Togli
                </button>
                <button
                  type="button"
                  disabled={names.length === 0}
                  onClick={() => setConfirming(true)}
                  title="Lascia a ogni documento solo quelle scelte"
                  className={actionButton}
                >
                  Sostituisci
                </button>
              </div>
              <p className={HELP_TEXT_CLASS}>
                “Aggiungi” salta chi non ha posto (al massimo {MAX_CATEGORIES_PER_DOCUMENT} categorie per
                documento). Quelle cambiate qui restano tue: l’indicizzazione non le tocca.
              </p>
            </>
          )}
        </div>
      )}
    </span>
  );
}
