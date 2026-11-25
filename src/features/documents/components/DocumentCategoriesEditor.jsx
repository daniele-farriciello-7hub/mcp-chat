'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { releaseDocumentCategories, setDocumentCategories } from '@/features/documents/documentStore';
import {
  MAX_CATEGORIES_PER_DOCUMENT,
  pickCategories,
  visibleCategories
} from '@/features/documents/categories';

/**
 * The categories of one document as buttons to switch on and off, from the admins' list (at most three).
 * Touching one saves at once and marks the document's categories as the admin's own: indexing, the Drive sync's
 * included, leaves them alone from then on. "Lascia scegliere a Gemini" gives that back.
 */
export default function DocumentCategoriesEditor({ document, categories }) {
  const own = visibleCategories(document.categories, categories);
  const [error, setError] = useState(null);
  const manual = document.categoriesManual === true;

  const save = async next => {
    setError(null);
    try {
      await setDocumentCategories(document.id, next, categories);
    } catch (e) {
      console.error('[documents] saving the categories failed:', e);
      setError('Non riesco a salvare le categorie: riprova.');
    }
  };

  const toggle = name => {
    const on = own.includes(name);
    if (!on && own.length >= MAX_CATEGORIES_PER_DOCUMENT) return;
    save(pickCategories(on ? own.filter(n => n !== name) : [...own, name], categories));
  };

  const release = async () => {
    setError(null);
    try {
      await releaseDocumentCategories(document.id);
    } catch (e) {
      console.error('[documents] releasing the categories failed:', e);
      setError('Non riesco a salvare: riprova.');
    }
  };

  if (!categories.length) {
    return (
      <p className="text-fs-11 leading-snug text-slate-soft">
        Non c’è ancora nessuna categoria: creale in Documenti → Categorie.
      </p>
    );
  }

  const full = own.length >= MAX_CATEGORIES_PER_DOCUMENT;
  return (
    <div>
      <ul className="flex flex-wrap gap-1">
        {categories.map(name => {
          const on = own.includes(name);
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => toggle(name)}
                title={!on && full ? `Al massimo ${MAX_CATEGORIES_PER_DOCUMENT} categorie` : undefined}
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
      <p className="mt-1.5 text-fs-11 leading-snug text-slate-soft">
        {manual ? (
          <>
            Scelte da te: la reindicizzazione non le cambia.{' '}
            <button
              type="button"
              onClick={release}
              className="font-semibold text-brand-600 underline decoration-dotted underline-offset-2"
            >
              Lascia scegliere a Gemini
            </button>
          </>
        ) : (
          'Scelte da Gemini: tocca una categoria per correggerle, e restano tue.'
        )}
      </p>
      {error && <p className="mt-1 text-fs-11 text-danger">{error}</p>}
    </div>
  );
}
