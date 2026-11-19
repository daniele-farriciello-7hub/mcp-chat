/**
 * The operator's own shortcuts. Two places, one component:
 *   - `variant="welcome"`: "Le tue scorciatoie" on the welcome screen; tapping one asks its question.
 *   - `variant="panel"`: the settings panel (the gear, for every user): tapping one edits it.
 * The pencil edits, the bin removes (after a confirmation tap).
 */
'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import IconPicker from '@/features/settings/components/IconPicker';
import ShortcutIcon from '@/features/settings/components/ShortcutIcon';
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { SkeletonCards } from '@/shared/ui/Skeleton';
import { useNoAiCommands } from '@/features/chat/commands/useNoAiCommands';
import CommandChoice from './CommandChoice';
import { loadOwnShortcuts, saveOwnShortcuts, shortcutSummary, shortcutText } from './personalShortcuts';

const EMPTY = { icon: 'question', title: '', description: '', prompt: '' };

function ShortcutForm({ initial, commands, onSave, onCancel, saving, error }) {
  const [draft, setDraft] = useState(initial);
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const canSave = draft.title.trim() && (draft.command || draft.prompt.trim());
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (!canSave) return;
        // a command shortcut keeps the command's word as its question: what the chat shows, and what the
        // model gets if the command is switched off or deleted later
        onSave(
          draft.command && !draft.prompt.trim() ? { ...draft, prompt: shortcutText(draft, commands) } : draft
        );
      }}
      className="flex flex-col gap-2.5 rounded-xl border border-brand-200 bg-panel p-3 shadow-soft"
    >
      <input
        autoFocus
        value={draft.title}
        onChange={e => set('title', e.target.value)}
        placeholder="Titolo, es. Le mie pratiche in istruttoria"
        maxLength={60}
        className={INPUT_CLASS}
        aria-label="Titolo"
      />
      <CommandChoice commands={commands} value={draft.command} onChange={value => set('command', value)} />
      {draft.command ? (
        <p className="text-fs-11 leading-snug text-slate-soft">
          Parte da solo, senza il modello: in chat compare «{shortcutText(draft, commands)}» e la risposta
          arriva in pochi secondi.
        </p>
      ) : (
        <textarea
          value={draft.prompt}
          onChange={e => set('prompt', e.target.value)}
          placeholder="La domanda da fare, es. Quali mie pratiche sono in istruttoria da più di 30 giorni?"
          rows={2}
          maxLength={1000}
          className={`${INPUT_CLASS} resize-y`}
          aria-label="Domanda"
        />
      )}
      <input
        value={draft.description}
        onChange={e => set('description', e.target.value)}
        placeholder="Riga sotto il titolo (facoltativa)"
        maxLength={120}
        className={INPUT_CLASS}
        aria-label="Riga sotto il titolo"
      />
      <IconPicker value={draft.icon} onChange={value => set('icon', value)} />
      {error && <p className="text-fs-12 text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-fs-12 font-semibold text-slate-soft hover:bg-surface"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={!canSave || saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-fs-12 font-semibold text-on-brand transition hover:bg-brand-hover disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salva
        </button>
      </div>
    </form>
  );
}

export default function PersonalShortcuts({ uid, isAdmin = false, onAsk, onChanged, variant = 'welcome' }) {
  const inPanel = variant === 'panel';
  const [shortcuts, setShortcuts] = useState(null); // null while loading
  const [editing, setEditing] = useState(null); // null | 'new' | index
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(null); // set by the admin; null = no limit
  const commands = useNoAiCommands(); // the commands without AI a shortcut may run

  useEffect(() => {
    loadOwnShortcuts({ uid, isAdmin })
      .then(result => {
        setShortcuts(result.shortcuts);
        setLimit(result.limit);
      })
      .catch(e => {
        console.warn('[shortcuts] load failed:', e?.message || e);
        setShortcuts([]);
      });
  }, [uid, isAdmin]);

  const persist = async next => {
    setSaving(true);
    setError(null);
    try {
      setShortcuts(await saveOwnShortcuts({ uid, isAdmin }, next));
      onChanged?.();
      setEditing(null);
      setConfirmDelete(null);
    } catch (e) {
      setError(e.message || 'Non sono riuscito a salvare.');
    } finally {
      setSaving(false);
    }
  };

  const full = limit !== null && shortcuts !== null && shortcuts.length >= limit;
  if (shortcuts === null) {
    return inPanel ? <SkeletonCards count={3} /> : null;
  }

  return (
    <div className={inPanel ? '' : 'relative z-10 mt-5 px-4'}>
      {inPanel ? (
        <p className="mb-3 text-fs-11 leading-snug text-slate-soft">
          Le domande che fai spesso, a portata di un tocco nella schermata iniziale della chat. Le vedi solo
          tu.{limit !== null && ` Puoi averne fino a ${limit}.`}
        </p>
      ) : (
        <div className="mb-2 text-fs-11 font-semibold uppercase tracking-[0.12em] text-slate-soft">
          Le tue scorciatoie
        </div>
      )}
      {inPanel && !shortcuts.length && editing !== 'new' && (
        <p className="mb-2 rounded-xl bg-surface px-3 py-3 text-center text-fs-12 text-slate-soft">
          Non hai ancora scorciatoie personali.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {shortcuts.map((shortcut, i) =>
          editing === i ? (
            <ShortcutForm
              key={i}
              initial={shortcut}
              commands={commands}
              saving={saving}
              error={error}
              onCancel={() => setEditing(null)}
              onSave={draft => persist(shortcuts.map((s, j) => (j === i ? draft : s)))}
            />
          ) : (
            <div
              key={i}
              className="group flex items-center gap-1 rounded-xl border border-line bg-panel pr-1.5 transition hover:border-brand-300"
            >
              <button
                type="button"
                onClick={() =>
                  inPanel
                    ? setEditing(i)
                    : onAsk(shortcutText(shortcut, commands), { command: shortcut.command })
                }
                className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-fg">
                  <ShortcutIcon id={shortcut.icon} size={18} strokeWidth={2.25} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-fs-14 font-semibold text-ink">{shortcut.title}</span>
                  <span className="block truncate text-fs-12 leading-snug text-slate-soft">
                    {shortcut.description || shortcutSummary(shortcut, commands)}
                  </span>
                </span>
              </button>
              {confirmDelete === i ? (
                <>
                  <button
                    type="button"
                    onClick={() => persist(shortcuts.filter((_, j) => j !== i))}
                    className="rounded-lg px-2 py-1.5 text-fs-12 font-semibold text-danger hover:bg-danger-soft"
                  >
                    Elimina
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    aria-label="Annulla"
                    className="rounded-lg p-1.5 text-slate-soft hover:bg-surface"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setEditing(i);
                    }}
                    aria-label={`Modifica ${shortcut.title}`}
                    className={`rounded-lg p-1.5 text-slate-soft ${inPanel ? '' : 'opacity-0 focus:opacity-100 group-hover:opacity-100'} transition hover:bg-surface hover:text-ink`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(i)}
                    aria-label={`Elimina ${shortcut.title}`}
                    className={`rounded-lg p-1.5 text-slate-soft ${inPanel ? '' : 'opacity-0 focus:opacity-100 group-hover:opacity-100'} transition hover:bg-danger-soft hover:text-danger`}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          )
        )}

        {editing === 'new' ? (
          <ShortcutForm
            initial={EMPTY}
            commands={commands}
            saving={saving}
            error={error}
            onCancel={() => setEditing(null)}
            onSave={draft => persist([...shortcuts, draft])}
          />
        ) : full ? (
          inPanel && (
            <p className="rounded-xl bg-surface px-3 py-2.5 text-center text-fs-12 text-slate-soft">
              Hai raggiunto il massimo di {limit} scorciatoie: per aggiungerne una, eliminane un’altra.
            </p>
          )
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing('new');
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-fs-13 font-medium text-brand-600 transition hover:border-brand-300 hover:bg-brand-50/50"
          >
            <Plus size={15} /> Aggiungi una scorciatoia
          </button>
        )}
      </div>
    </div>
  );
}
