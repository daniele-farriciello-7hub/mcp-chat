/**
 * One command without AI in the Database tab: a compact row (name, trigger words, on or off) that opens
 * into its editor. Everything is part of the shared settings object (`settings.noAiCommands`), so the
 * panel's "Salva" bar applies. The server reads the saved command itself: the chat sends neither its SQL
 * nor its connection.
 */
'use client';

import { useState } from 'react';
import { ChevronDown, CircleAlert, Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Field from '@/shared/ui/Field';
import Slider from '@/shared/ui/Slider';
import Switch from '@/shared/ui/Switch';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import { MAX_ROWS, claimTriggers, defaultErrorMessage } from '@/features/chat/commands/commandSettings';
import { COMMAND_FORMATS, FORMAT_LIST } from '@/features/chat/commands/formats';
import { isCommandOn, isRunnable } from '@/features/chat/commands/matchCommand';
import { loadCommandPresets } from '@/features/chat/commands/commandsAdminApi';
import { TIMEOUT_STOPS, formatSeconds } from '../timeoutStops';
import TestCommand from './TestCommand';

const quoted = words => words.map(word => `«${word}»`).join(', ');

/** Where the command stands, for the pill in its row and for the message in its editor. */
function statusOf(command) {
  if (isCommandOn(command)) return { id: 'on', label: 'Attivo' };
  if (command.enabled) return { id: 'incomplete', label: 'Incompleto' };
  return { id: 'off', label: 'Spento' };
}

const PILL_CLASS = {
  on: 'bg-ok-soft text-ok',
  incomplete: 'bg-danger-soft text-danger',
  off: 'bg-surface text-slate-soft'
};

function DeleteCommand({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)} tooltip="Elimina questo comando">
        <Trash2 size={13} /> Elimina
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3">
      <p className="text-fs-12 text-danger">
        Elimini il comando? Le scorciatoie che lo usano torneranno a fare la domanda al modello. La modifica è
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

export default function NoAiCommandRow({
  command,
  others,
  connections,
  collisions,
  expanded,
  hasUnsavedChanges,
  onToggle,
  onChange,
  onDelete
}) {
  const [turnOnError, setTurnOnError] = useState(false);
  const [triggersText, setTriggersText] = useState(null); // the field while it is being typed; null = from the command
  const [rejected, setRejected] = useState([]); // words the last edit left out because another command has them
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [defaultError, setDefaultError] = useState(null);

  const set = (key, value) => onChange({ ...command, [key]: value });
  const status = statusOf(command);
  const format = COMMAND_FORMATS[command.format];
  const known = connections?.some(connection => connection.id === command.connectionId);
  const ownSql = command.sql.trim() !== '';
  const clashes = collisions.filter(entry => entry.commandIds.includes(command.id));
  const nameOf = id => others.find(other => other.id === id)?.name || id;

  const triggers = command.triggers.filter(word => word.trim());
  const sqlId = `command-sql-${command.id}`;

  const turnOn = value => {
    // a command that cannot run is not switched on: the chat would send its words to the model anyway
    if (value && !isRunnable(command)) {
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

  // the SQL of the format's own preset, copied into the field to start from it
  const startFromPreset = async () => {
    setLoadingDefault(true);
    setDefaultError(null);
    try {
      const preset = (await loadCommandPresets()).find(entry => entry.format === command.format);
      if (preset) set('sql', preset.sql);
      else setDefaultError('Per questo formato non c’è una query predefinita.');
    } catch (error) {
      setDefaultError(error?.message || 'Non riesco a leggere la query predefinita.');
    } finally {
      setLoadingDefault(false);
    }
  };

  return (
    <div
      className={`rounded-xl border transition ${expanded ? 'border-brand-200 shadow-soft' : 'border-line'} ${
        command.enabled ? '' : 'bg-surface/40'
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
            {command.name.trim() || 'Comando senza nome'}
          </span>
          <span className="block truncate text-fs-11 text-slate-soft">
            {triggers.length ? quoted(triggers) : 'Nessuna parola: parte solo da una scorciatoia'}
          </span>
        </span>
        {clashes.length > 0 && (
          <CircleAlert
            size={14}
            className="shrink-0 text-danger"
            aria-label="Parola usata anche da un altro comando"
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
            checked={command.enabled}
            onChange={turnOn}
            label="Attiva il comando"
            description={
              command.enabled
                ? 'Attivo: le sue parole, e le scorciatoie che lo usano, non passano dal modello.'
                : 'Spento: le sue parole vanno al modello come qualsiasi altra domanda.'
            }
          />
          {turnOnError && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">
              Per attivarlo servono una connessione e una query: scegli la connessione e scrivi la SELECT.
            </p>
          )}
          {command.enabled && !isRunnable(command) && !turnOnError && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">
              Incompleto: finché mancano la connessione o la query, le sue parole continuano ad andare al
              modello.
            </p>
          )}

          <Field label="Nome" help="Quello che vedi qui e nell’elenco dei comandi di una scorciatoia.">
            <input
              value={command.name}
              onChange={e => set('name', e.target.value)}
              placeholder="es. Pratiche aperte oggi"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Formato della risposta" help={format?.summary}>
            <select
              value={command.format}
              onChange={e => set('format', e.target.value)}
              className={INPUT_CLASS}
            >
              {!format && <option value={command.format}>Formato sconosciuto ({command.format})</option>}
              {FORMAT_LIST.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>

          {command.format === 'table' && (
            <>
              <Field label="Titolo" help="Facoltativo: la riga in grassetto sopra la tabella.">
                <input
                  value={command.title}
                  onChange={e => set('title', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Introduzione" help="Facoltativo: una frase sotto il titolo, prima della tabella.">
                <textarea
                  rows={2}
                  value={command.intro}
                  onChange={e => set('intro', e.target.value)}
                  className={`${INPUT_CLASS} resize-y`}
                />
              </Field>
            </>
          )}

          <Field
            label="Connessione"
            help="Il database su cui gira la query: ognuno ci vede solo i dati che i filtri della connessione gli lasciano. Servono attive le tabelle che la query legge."
          >
            <select
              value={command.connectionId}
              onChange={e => set('connectionId', e.target.value)}
              disabled={!connections}
              className={INPUT_CLASS}
            >
              <option value="">Scegli una connessione…</option>
              {command.connectionId && connections && !known && (
                <option value={command.connectionId}>Connessione non trovata</option>
              )}
              {connections?.map(connection => (
                <option key={connection.id} value={connection.id}>
                  {connection.label}
                  {connection.enabled ? '' : ' (disattivata)'}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Parole che lo avviano"
            help="Una per riga. Parte solo se il messaggio è esattamente una di queste: maiuscole, spazi e un «?» o «.» finali non contano. Una frase più lunga («erogato luglio 2026») va al modello. Due comandi non possono avere la stessa parola."
          >
            <textarea
              rows={2}
              value={triggersText ?? command.triggers.join('\n')}
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
              {quoted(entry.commandIds.filter(id => id !== command.id).map(nameOf))}: parte il primo
              dell’elenco. Togline una da uno dei due.
            </p>
          ))}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={sqlId} className="text-fs-12 font-semibold text-ink">
                Query SQL
              </label>
              {format?.hasDefaultSql && (
                <span className="flex items-center gap-1">
                  {!ownSql && (
                    <button
                      type="button"
                      onClick={startFromPreset}
                      disabled={loadingDefault}
                      className="rounded-lg px-2 py-1 text-fs-11 font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-40"
                    >
                      {loadingDefault ? 'Carico…' : 'Parti dalla predefinita'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => set('sql', '')}
                    disabled={!ownSql}
                    className="rounded-lg px-2 py-1 text-fs-11 font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-default disabled:text-slate-soft disabled:hover:bg-transparent"
                  >
                    Ripristina predefinito
                  </button>
                </span>
              )}
            </div>
            <textarea
              id={sqlId}
              rows={format?.hasDefaultSql ? 10 : 6}
              wrap="off"
              spellCheck={false}
              value={command.sql}
              onChange={e => set('sql', e.target.value)}
              placeholder={format?.hasDefaultSql ? 'Vuoto: usa la query predefinita del formato' : 'SELECT …'}
              className={`${INPUT_CLASS} resize-y overflow-x-auto font-mono text-fs-12 leading-snug`}
            />
            {defaultError && <p className="mt-1 text-fs-11 text-danger">{defaultError}</p>}
            <p className={HELP_TEXT_CLASS}>
              {command.format === 'erogato'
                ? 'Una sola SELECT, sulle tabelle attive della connessione. Deve restituire le stesse colonne della predefinita, con gli stessi nomi: se ne manca una il comando dà errore e «Prova ora» dice quale. Lasciala vuota per usare sempre la predefinita, anche quando viene aggiornata.'
                : 'Una sola SELECT, sulle tabelle attive della connessione. Le colonne sono libere e il titolo di ognuna è il suo nome: dai un nome leggibile con AS. Metti un ORDER BY e un LIMIT: se la query restituisce più righe del massimo il comando dà errore.'}
            </p>
          </div>

          <Slider
            label="Righe massime"
            reading={`${command.maxRows.toLocaleString('it-IT')} righe`}
            min={MAX_ROWS.min}
            max={MAX_ROWS.max}
            step={1000}
            value={command.maxRows}
            rangeLabels={['Più prudente', 'Risultati più grandi']}
            onChange={value => set('maxRows', value)}
          />
          <p className={`${HELP_TEXT_CLASS} -mt-1.5`}>
            Se la query ne restituisce di più il comando dà errore invece di mostrare una risposta parziale.
            {command.format === 'erogato' &&
              ' La query predefinita ne produce circa 2.600 per un amministratore.'}
            {command.format === 'table' && ' La tabella ne mostra comunque le prime 50.'}
          </p>
          <Slider
            label="Tempo massimo della query"
            reading={formatSeconds(command.timeoutSeconds)}
            stops={TIMEOUT_STOPS}
            value={command.timeoutSeconds}
            rangeLabels={['Fallisce prima', 'Aspetta di più']}
            onChange={value => set('timeoutSeconds', value)}
          />
          <p className={`${HELP_TEXT_CLASS} -mt-1.5`}>
            Oltre questo tempo è il database a fermare la query. Massimo 10 minuti, ma l’operatore aspetta: un
            comando è fatto per rispondere in pochi secondi.
          </p>

          <Field
            label="Messaggio se non riesce"
            help="Quello che compare in chat quando la lettura fallisce (database lento o irraggiungibile, query sbagliata). Il comando non passa mai al modello: l’admin trova il motivo tecnico nello Storico."
          >
            <textarea
              rows={2}
              value={command.errorMessage}
              onChange={e => set('errorMessage', e.target.value)}
              placeholder={defaultErrorMessage(command)}
              className={`${INPUT_CLASS} resize-y`}
            />
          </Field>

          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div>
              <div className="text-fs-12 font-semibold text-ink">Prova</div>
              <p className={HELP_TEXT_CLASS}>
                Esegue il comando adesso, come lo vedrebbe il tuo utente, con le impostazioni salvate.
                Controlla connessione, tabelle, limiti e colonne della query.
              </p>
            </div>
            <TestCommand commandId={command.id} disabled={hasUnsavedChanges} />
            {hasUnsavedChanges && (
              <p className={HELP_TEXT_CLASS}>Salva prima le modifiche: la prova usa quelle già salvate.</p>
            )}
          </div>

          <div className="flex justify-end">
            <DeleteCommand onDelete={onDelete} />
          </div>
        </div>
      )}
    </div>
  );
}
