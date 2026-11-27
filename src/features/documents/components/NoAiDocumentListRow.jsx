/**
 * One list of documents without AI in Documenti → Documenti senza AI: a compact row (name, trigger words, what it
 * shows, on or off) that opens into its editor. Everything is part of the shared settings object
 * (`settings.noAiDocumentLists`), so the panel's "Salva" bar applies. What the list shows is chosen here, by a rule
 * (categories, a word in the name, the order, how many) or by hand (a picker over the indexed documents); a preview
 * says what it would show right now, with the documents as they are today.
 */
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CircleAlert, Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Field from '@/shared/ui/Field';
import SegmentedControl from '@/shared/ui/SegmentedControl';
import Slider from '@/shared/ui/Slider';
import Switch from '@/shared/ui/Switch';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import { claimTriggers } from '@/features/chat/commands/commandSettings';
import {
  LIST_SELECTION,
  LIST_SORT,
  MAX_LIST_NAME_CHARS,
  MAX_NAME_FILTER_CHARS,
  defaultEmptyMessage
} from '@/features/chat/documentLists/documentListSettings';
import { isDocumentListOn, isDocumentListRunnable } from '@/features/chat/documentLists/matchDocumentList';
import { liveRuleCategories, selectDocuments } from '@/features/chat/documentLists/selectDocuments';
import { formatDocumentDay, documentDay } from '@/features/documents/documentDate';
import { DEFAULT_LISTING_FILES, MAX_LISTING_FILES } from '@/features/documents/listingLimits';
import { foldText } from '@/features/documents/textMatch';
import DocumentPicker from './DocumentPicker';

const quoted = words => words.map(word => `«${word}»`).join(', ');

const SELECTION_OPTIONS = [
  { id: LIST_SELECTION.rule, name: 'Per regola' },
  { id: LIST_SELECTION.fixed, name: 'Scelti a mano' }
];
const SORT_OPTIONS = [
  { id: LIST_SORT.recent, name: 'Più recenti' },
  { id: LIST_SORT.name, name: 'Per nome' }
];

/** Where the list stands, for the pill in its row. */
function statusOf(list) {
  if (isDocumentListOn(list)) return { id: 'on', label: 'Attivo' };
  if (list.enabled) return { id: 'incomplete', label: 'Incompleto' };
  return { id: 'off', label: 'Spento' };
}

const PILL_CLASS = {
  on: 'bg-ok-soft text-ok',
  incomplete: 'bg-danger-soft text-danger',
  off: 'bg-surface text-slate-soft'
};

/** The row's second line: the rule in a few words, or how many documents were chosen. */
function summaryOf(list) {
  if (list.selection === LIST_SELECTION.fixed) {
    const count = list.documentIds.length;
    return `Scelti a mano · ${count === 0 ? 'nessun documento' : count === 1 ? '1 documento' : `${count} documenti`}`;
  }
  const what = list.categories.length ? list.categories.join(', ') : 'tutti i documenti';
  const order = list.sort === LIST_SORT.name ? 'per nome' : 'più recenti';
  return `${what} · ${order}, fino a ${list.limit}`;
}

function DeleteList({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)} tooltip="Elimina questo elenco">
        <Trash2 size={13} /> Elimina
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3">
      <p className="text-fs-12 text-danger">
        Elimini l’elenco? Le scorciatoie che lo usano torneranno a fare la domanda al modello. La modifica è
        definitiva solo dopo «Salva».
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg bg-danger px-2.5 py-1 text-fs-12 font-semibold text-white transition hover:opacity-90"
        >
          Elimina
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg px-2.5 py-1 text-fs-12 text-slate-soft transition hover:text-ink"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

/** What the list would show now: how many, and the first few with their date. */
function Preview({ list, entries, categories }) {
  const shown = useMemo(() => selectDocuments(entries, list, { categories }), [entries, list, categories]);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line p-3">
      <div className="text-fs-12 font-semibold text-ink">Anteprima</div>
      {shown.length === 0 ? (
        <p className={HELP_TEXT_CLASS}>
          Adesso non mostrerebbe nessun documento: in chat comparirebbe il messaggio qui sopra.
        </p>
      ) : (
        <>
          <p className={HELP_TEXT_CLASS}>
            Adesso mostrerebbe {shown.length === 1 ? '1 documento' : `${shown.length} documenti`}
            {shown.length > 5 ? ', i primi:' : ':'}
          </p>
          <ul className="flex flex-col gap-0.5">
            {shown.slice(0, 5).map(entry => (
              <li key={entry.id} className="flex items-baseline gap-2 text-fs-12 text-ink">
                <span className="min-w-0 flex-1 truncate" title={entry.name}>
                  {entry.name}
                </span>
                <span className="shrink-0 text-fs-11 text-slate-soft">
                  {formatDocumentDay(documentDay(entry.date))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * `others` is every other list and every command (anything with a `name` and `triggers`): the words of this list
 * may not belong to any of them. `collisions` is `triggerCollisions` over all of it. `entries` are the indexed
 * documents as catalog entries (`catalogEntryOf`), `categories` the admins' list.
 */
export default function NoAiDocumentListRow({
  list,
  others,
  collisions,
  entries,
  categories,
  expanded,
  onToggle,
  onChange,
  onDelete
}) {
  const [turnOnError, setTurnOnError] = useState(false);
  const [triggersText, setTriggersText] = useState(null); // the field while it is being typed; null = from the list
  const [rejected, setRejected] = useState([]); // words the last edit left out because another list or command has them

  const set = (key, value) => onChange({ ...list, [key]: value });
  const status = statusOf(list);
  const clashes = collisions.filter(entry => entry.commandIds.includes(list.id));
  const nameOf = id => others.find(other => other.id === id)?.name || id;
  const triggers = list.triggers.filter(word => word.trim());
  const rule = list.selection === LIST_SELECTION.rule;

  // names the rule asks for that are no longer in the admins' list: they match nothing
  const live = liveRuleCategories(list, categories).map(foldText);
  const gone = list.categories.filter(name => !live.includes(foldText(name)));

  const turnOn = value => {
    // a list that cannot show anything is not switched on: its words would go to the model anyway
    if (value && !isDocumentListRunnable(list)) {
      setTurnOnError(true);
      return;
    }
    setTurnOnError(false);
    set('enabled', value);
  };

  const commitTriggers = () => {
    if (triggersText === null) return;
    const result = claimTriggers(triggersText.split('\n'), others);
    setRejected(result.rejected);
    setTriggersText(null);
    set('triggers', result.triggers);
  };

  const toggleCategory = name =>
    set(
      'categories',
      list.categories.includes(name)
        ? list.categories.filter(item => item !== name)
        : [...list.categories, name]
    );

  return (
    <div
      className={`rounded-xl border transition ${expanded ? 'border-brand-200 shadow-soft' : 'border-line'} ${
        list.enabled ? '' : 'bg-surface/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl p-3 text-left transition hover:bg-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-fs-13 font-semibold text-ink">
            {list.name.trim() || 'Elenco senza nome'}
          </span>
          <span className="block truncate text-fs-11 text-slate-soft">
            {triggers.length ? quoted(triggers) : 'Nessuna parola: parte solo da una scorciatoia'}
          </span>
          <span className="block truncate text-fs-11 text-slate-soft">{summaryOf(list)}</span>
        </span>
        {clashes.length > 0 && (
          <CircleAlert
            size={14}
            className="shrink-0 text-danger"
            aria-label="Parola usata anche da un altro elenco o comando"
          />
        )}
        <span
          className={`shrink-0 rounded-pill px-2 py-0.5 text-fs-10 font-semibold ${PILL_CLASS[status.id]}`}
        >
          {status.label}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-soft transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3.5 border-t border-line px-3 py-3.5">
          <Switch
            checked={list.enabled}
            onChange={turnOn}
            label="Attiva l’elenco"
            description={
              list.enabled
                ? 'Attivo: le sue parole, e le scorciatoie che lo usano, mostrano l’elenco subito, senza passare dal modello.'
                : 'Spento: le sue parole vanno al modello come qualsiasi altra domanda.'
            }
          />
          {turnOnError && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">
              Per attivarlo scegli almeno un documento.
            </p>
          )}
          {list.enabled && !isDocumentListRunnable(list) && !turnOnError && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">
              Incompleto: finché non c’è nessun documento scelto, le sue parole continuano ad andare al
              modello.
            </p>
          )}

          <Field label="Nome" help="Quello che vedi qui, nell’elenco di una scorciatoia e nello Storico.">
            <input
              value={list.name}
              maxLength={MAX_LIST_NAME_CHARS}
              onChange={e => set('name', e.target.value)}
              placeholder="es. Ultime comunicazioni"
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            label="Parole che lo mostrano"
            help="Una per riga. Parte solo se il messaggio è esattamente una di queste: maiuscole, spazi e un «?» o «.» finali non contano. Una frase più lunga («comunicazioni di ottobre») va al modello. Due elenchi, o un elenco e un comando senza AI, non possono avere la stessa parola."
          >
            <textarea
              rows={2}
              value={triggersText ?? list.triggers.join('\n')}
              onChange={e => setTriggersText(e.target.value)}
              onBlur={commitTriggers}
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>
          {rejected.length > 0 && (
            <p className="-mt-2 rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">
              {rejected.map(entry => `«${entry.trigger}» è già una parola di «${entry.owner}»`).join('; ')}:
              l’ho tolta da qui.
            </p>
          )}
          {clashes.map(entry => (
            <p
              key={entry.trigger}
              className="-mt-2 rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger"
            >
              «{entry.trigger}» è la parola anche di{' '}
              {quoted(entry.commandIds.filter(id => id !== list.id).map(nameOf))}: parte il primo (un comando
              prima di un elenco). Togline una da uno dei due.
            </p>
          ))}

          <Field label="Titolo" help="L’intestazione sopra i file. Vuoto: il nome dell’elenco.">
            <input
              value={list.title}
              onChange={e => set('title', e.target.value)}
              placeholder={list.name}
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Introduzione"
            help="Facoltativa: la frase che l’assistente scrive sotto l’elenco. Vuota: «Ecco i file (N).»."
          >
            <textarea
              rows={2}
              value={list.intro}
              onChange={e => set('intro', e.target.value)}
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>
          <Field
            label="Messaggio se non c’è niente"
            help="Quello che compare in chat quando nessun documento corrisponde (la card non c’è)."
          >
            <textarea
              rows={2}
              value={list.emptyMessage}
              onChange={e => set('emptyMessage', e.target.value)}
              placeholder={defaultEmptyMessage(list)}
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>

          <div className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
            <div>
              <div className="mb-1.5 text-fs-12 font-semibold text-ink">Quali documenti</div>
              <SegmentedControl
                ariaLabel="Come si scelgono i documenti"
                options={SELECTION_OPTIONS}
                value={list.selection}
                onChange={value => set('selection', value)}
              />
              <p className={HELP_TEXT_CLASS}>
                {rule
                  ? 'Una regola sceglie i documenti ogni volta, fra quelli indicizzati: un documento nuovo che la rispetta compare da solo.'
                  : 'Scegli tu i documenti e il loro ordine. Uno eliminato, o non più indicizzato, viene saltato senza dire niente.'}{' '}
                Vanno bene sia i documenti studiati sia quelli di solo archivio.
              </p>
            </div>

            {rule ? (
              <>
                <div>
                  <div className="mb-1.5 text-fs-12 font-semibold text-ink">Categorie</div>
                  {categories.length === 0 && gone.length === 0 ? (
                    <p className={HELP_TEXT_CLASS}>
                      Non ci sono categorie: creale in Documenti → Categorie. Senza categorie la regola guarda
                      tutti i documenti.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map(name => {
                        const on = list.categories.some(item => foldText(item) === foldText(name));
                        return (
                          <button
                            key={name}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              set(
                                'categories',
                                on
                                  ? list.categories.filter(item => foldText(item) !== foldText(name))
                                  : [...list.categories, name]
                              )
                            }
                            className={`rounded-pill border px-2.5 py-1 text-fs-11 font-medium transition ${
                              on
                                ? 'border-brand-300 bg-brand-50 text-brand-600'
                                : 'border-line text-slate-soft hover:text-ink'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                      {gone.map(name => (
                        <button
                          key={`gone-${name}`}
                          type="button"
                          onClick={() => toggleCategory(name)}
                          title="Questa categoria non è più nell’elenco: togliendola la regola smette di cercarla"
                          className="rounded-pill border border-danger px-2.5 py-1 text-fs-11 font-medium text-danger line-through transition hover:bg-danger-soft"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className={HELP_TEXT_CLASS}>
                    Un documento entra se ha almeno una delle categorie scelte. Nessuna scelta: tutti i
                    documenti.
                    {gone.length > 0 &&
                      ' Le categorie barrate non esistono più (rinominate o tolte): toglile con un clic.'}
                  </p>
                </div>

                <Field
                  label="Il nome contiene"
                  help="Facoltativo: una parola o una frase che il nome del file deve contenere (maiuscole e accenti non contano), ad esempio «Direzione»."
                >
                  <input
                    value={list.nameContains}
                    maxLength={MAX_NAME_FILTER_CHARS}
                    onChange={e => set('nameContains', e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>

                <div>
                  <div className="mb-1.5 text-fs-12 font-semibold text-ink">Ordine</div>
                  <SegmentedControl
                    ariaLabel="Ordine dei documenti"
                    options={SORT_OPTIONS}
                    value={list.sort}
                    onChange={value => set('sort', value)}
                  />
                  <p className={HELP_TEXT_CLASS}>
                    «Più recenti» ordina dalla data del documento: l’ultima modifica su Drive, o il giorno in
                    cui è stato caricato.
                  </p>
                </div>

                <Slider
                  label="Quanti documenti"
                  reading={list.limit === 1 ? '1 documento' : `${list.limit} documenti`}
                  min={1}
                  max={MAX_LISTING_FILES}
                  step={1}
                  value={list.limit}
                  rangeLabels={['1', `${MAX_LISTING_FILES}`]}
                  onChange={value => set('limit', value)}
                />
                <p className={`${HELP_TEXT_CLASS} -mt-1.5`}>
                  Fino a {DEFAULT_LISTING_FILES} i file compaiono come anteprime, di più come elenco che
                  scorre.
                </p>
              </>
            ) : (
              <DocumentPicker
                documents={entries}
                value={list.documentIds}
                onChange={ids => set('documentIds', ids)}
              />
            )}
          </div>

          <Preview list={list} entries={entries} categories={categories} />

          <div className="flex justify-end">
            <DeleteList onDelete={onDelete} />
          </div>
        </div>
      )}
    </div>
  );
}
