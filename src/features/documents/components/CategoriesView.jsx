/**
 * "Categorie" of the Documents tab: the fixed list the admins keep (add, rename, remove, reorder) and the
 * button that gives categories to the documents that have none. The list is the setting `documentCategories`;
 * every change is saved at once (like the rest of this tab: no "Salva" bar), through `saveSettingsFields` so
 * it never overwrites what someone else saved meanwhile, and `onSaved` tells the settings panel, whose own
 * copy would otherwise write the old list back the next time "Salva" is used on another tab.
 *
 * Renaming moves the documents along (they keep the category under its new name). Removing leaves the name
 * written on the documents but unseen — the panel, the chat and the search ignore a name that is not in the
 * list — so putting it back restores it; the count ("6 documenti") says how many documents it concerns, and
 * opens the list of the indexed documents filtered by that category (`onShowCategory`).
 */
'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';
import { INPUT_CLASS, HELP_TEXT_CLASS } from '@/shared/ui/formStyles';
import { saveSettingsFields } from '@/features/settings/settingsStore';
import { invalidateChatCatalog } from '@/features/documents/chatCatalog';
import { renameCategoryOnDocuments } from '@/features/documents/documentStore';
import {
  MAX_CATEGORIES_IN_LIST,
  MAX_CATEGORY_NAME_CHARS,
  hasCategory,
  normalizeCategoryList,
  visibleCategories
} from '@/features/documents/categories';
import ClassifyDocuments from './ClassifyDocuments';

const documentsLabel = count =>
  count === 0 ? 'nessun documento' : count === 1 ? '1 documento' : `${count} documenti`;

const iconButton =
  'rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-soft';

function CategoryRow({ name, count, index, last, busy, onMove, onRename, onRemove, onShow }) {
  const [mode, setMode] = useState(null); // null | 'rename' | 'remove'
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState(null);

  const submitRename = async () => {
    const problem = await onRename(name, draft);
    if (problem) setError(problem);
    else setMode(null);
  };

  if (mode === 'rename') {
    return (
      <li className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={MAX_CATEGORY_NAME_CHARS}
            onChange={e => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setMode(null);
            }}
            aria-label={`Nuovo nome di ${name}`}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={submitRename}
            disabled={busy}
            aria-label="Salva il nome"
            className={iconButton}
          >
            <Check size={14} />
          </button>
          <button type="button" onClick={() => setMode(null)} aria-label="Annulla" className={iconButton}>
            <X size={14} />
          </button>
        </div>
        {error ? (
          <p className="mt-1 text-fs-11 text-danger">{error}</p>
        ) : (
          count > 0 && (
            <p className={HELP_TEXT_CLASS}>
              {count === 1 ? 'Il documento che la ha' : `I ${count} documenti che la hanno`} la terranno col
              nuovo nome.
            </p>
          )
        )}
      </li>
    );
  }

  if (mode === 'remove') {
    return (
      <li className="flex flex-wrap items-center gap-2 bg-danger-soft/50 px-3 py-2">
        <span className="min-w-0 flex-1 text-fs-12 text-ink">
          Togliere <span className="font-semibold">{name}</span>?{' '}
          {count > 0
            ? `${count === 1 ? '1 documento la perde' : `${count} documenti la perdono`} di vista; se la rimetti con lo stesso nome la ritrovano.`
            : 'Nessun documento la usa.'}
        </span>
        <button
          type="button"
          onClick={() => setMode(null)}
          className="text-fs-12 text-slate-soft hover:text-ink"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={() => onRemove(name)}
          disabled={busy}
          className="rounded-lg bg-danger px-2.5 py-1 text-fs-12 font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Togli
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-fs-13 font-medium text-ink">{name}</span>
      {count > 0 && onShow ? (
        <Tooltip label="Mostra i documenti" align="right">
          <button
            type="button"
            onClick={() => onShow(name)}
            aria-label={`Mostra ${documentsLabel(count)} con ${name}`}
            className="mr-1 whitespace-nowrap rounded text-fs-11 text-slate-soft underline decoration-dotted underline-offset-2 transition hover:text-brand-600"
          >
            {documentsLabel(count)}
          </button>
        </Tooltip>
      ) : (
        <span className="mr-1 whitespace-nowrap text-fs-11 text-slate-soft">{documentsLabel(count)}</span>
      )}
      <Tooltip label="Sposta su" align="right">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={busy || index === 0}
          aria-label={`Sposta su ${name}`}
          className={iconButton}
        >
          <ArrowUp size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Sposta giù" align="right">
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={busy || last}
          aria-label={`Sposta giù ${name}`}
          className={iconButton}
        >
          <ArrowDown size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Rinomina" align="right">
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setError(null);
            setMode('rename');
          }}
          disabled={busy}
          aria-label={`Rinomina ${name}`}
          className={iconButton}
        >
          <Pencil size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Togli dall’elenco" align="right">
        <button
          type="button"
          onClick={() => setMode('remove')}
          disabled={busy}
          aria-label={`Togli ${name}`}
          className={`${iconButton} hover:!text-danger`}
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>
    </li>
  );
}

export default function CategoriesView({ categories, documents, onSaved, onShowCategory }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone: 'error' | 'ok', text }

  const countOf = name =>
    documents.filter(document => visibleCategories(document.categories, [name]).length > 0).length;

  /** Saves the list; resolves to an error sentence, or null when it is saved. */
  const persist = async next => {
    setBusy(true);
    try {
      const saved = await saveSettingsFields({ documentCategories: next });
      invalidateChatCatalog();
      onSaved(saved.documentCategories);
      return null;
    } catch (error) {
      console.error('[categories] saving the list failed:', error);
      return 'Non riesco a salvare l’elenco: riprova.';
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const [name] = normalizeCategoryList([newName]);
    if (!name) return;
    if (hasCategory(categories, name))
      return setMessage({ tone: 'error', text: 'Questa categoria esiste già.' });
    if (categories.length >= MAX_CATEGORIES_IN_LIST) {
      return setMessage({ tone: 'error', text: `Al massimo ${MAX_CATEGORIES_IN_LIST} categorie.` });
    }
    const problem = await persist([...categories, name]);
    setMessage(problem ? { tone: 'error', text: problem } : null);
    if (!problem) setNewName('');
  };

  const move = async (index, step) => {
    const next = [...categories];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    const problem = await persist(next);
    setMessage(problem ? { tone: 'error', text: problem } : null);
  };

  const remove = async name => {
    const problem = await persist(categories.filter(item => item !== name));
    setMessage(problem ? { tone: 'error', text: problem } : null);
  };

  /** Resolves to an error sentence for the row, or null when renamed. */
  const rename = async (from, to) => {
    const [name] = normalizeCategoryList([to]);
    if (!name) return 'Scrivi un nome.';
    if (name === from) return null;
    if (hasCategory(categories, name, from)) return 'Esiste già una categoria con questo nome.';
    const problem = await persist(categories.map(item => (item === from ? name : item)));
    if (problem) return problem;
    // the list is saved first: from here on the new name is a real one, then the documents follow
    try {
      const moved = await renameCategoryOnDocuments(documents, from, name);
      setMessage({
        tone: 'ok',
        text: moved
          ? `Rinominata: ${moved} ${moved === 1 ? 'documento aggiornato' : 'documenti aggiornati'}.`
          : 'Rinominata.'
      });
    } catch (error) {
      console.error('[categories] renaming on the documents failed:', error);
      setMessage({
        tone: 'error',
        text: 'Rinominata nell’elenco, ma alcuni documenti non sono stati aggiornati: rinominala di nuovo con lo stesso nome per riprovare.'
      });
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-line">
        <div className="border-b border-line px-3 py-2.5">
          <h3 className="text-fs-13 font-bold text-ink">Elenco delle categorie</h3>
          <p className="mt-0.5 text-fs-11 leading-snug text-slate-soft">
            Quando indicizza un documento Gemini sceglie fino a 3 categorie di questo elenco, mai altre. Puoi
            correggerle documento per documento, e da quel momento restano tue.
          </p>
        </div>

        {categories.length === 0 ? (
          <p className="px-3 py-5 text-center text-fs-12 text-slate-soft">
            Nessuna categoria: finché l’elenco è vuoto Gemini non ne assegna.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {categories.map((name, index) => (
              <CategoryRow
                key={name}
                name={name}
                count={countOf(name)}
                index={index}
                last={index === categories.length - 1}
                busy={busy}
                onMove={move}
                onRename={rename}
                onRemove={remove}
                onShow={onShowCategory}
              />
            ))}
          </ul>
        )}

        <div className="border-t border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              maxLength={MAX_CATEGORY_NAME_CHARS}
              onChange={e => {
                setNewName(e.target.value);
                setMessage(null);
              }}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="Nuova categoria"
              aria-label="Nome della nuova categoria"
              className={INPUT_CLASS}
            />
            <Button primary onClick={add} disabled={busy || !newName.trim()}>
              <Plus size={14} /> Aggiungi
            </Button>
          </div>
          {message && (
            <p
              className={`mt-1.5 text-fs-11 ${message.tone === 'error' ? 'text-danger' : 'font-medium text-ok'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-line p-3">
        <h3 className="text-fs-13 font-bold text-ink">Assegna le categorie</h3>
        <p className="mb-2.5 mt-0.5 text-fs-11 leading-snug text-slate-soft">
          I documenti nuovi le ricevono quando vengono indicizzati. Per quelli già indicizzati senza
          categoria, “Classifica” le assegna senza rifare la scheda. Quelli che hai corretto a mano non si
          toccano.
        </p>
        <ClassifyDocuments documents={documents} categories={categories} scope="dell’archivio" compact />
      </section>
    </div>
  );
}
