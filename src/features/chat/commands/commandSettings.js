/**
 * The commands without AI as the browser keeps them: `settings.noAiCommands`, an array edited in
 * Configurazione → Database → Comandi senza AI and read by the chat (`matchCommand.js`) and by the server
 * (functions/src/db/commandSettings.js, which reads only what it needs: keep the two readers, and their
 * defaults, identical; functions/scripts/database-commands.test.mjs compares them).
 *
 * A command:
 *   id            stable, generated (`newCommandId`); shortcuts point to it
 *   name          what the panel and the shortcut picker show
 *   enabled       off until the admin switches it on (and only a runnable command can be switched on)
 *   triggers      exact messages that run it: see `matchesTrigger`
 *   connectionId  a connection of the Database tab: never guessed
 *   sql           '' = the format's default query, for a format that has one (`hasDefaultSql`)
 *   format        how the rows become the answer: a key of COMMAND_FORMATS (formats.js)
 *   title, intro  the `table` format's heading and opening line (optional)
 *   maxRows       a result that reaches it is an error, never a partial answer
 *   timeoutSeconds  the server caps it at 600 when it runs
 *   errorMessage  what the chat says when it fails; '' = the default one (`defaultErrorMessage`)
 *
 * Settings saved when there was only one command hold it in `erogatoCommand`: `normalizeCommands` reads it as
 * the command with id 'erogato' until the array exists.
 *
 * Pure and dependency-free (apart from the format registry), so it loads in plain node.
 */
import { normalizeTrigger } from './matchCommand.js';

/** The id the old single command keeps: shortcuts saved with `command: 'erogato'` keep working. */
export const LEGACY_EROGATO_ID = 'erogato';
const LEGACY_ERROR_MESSAGE = "Non sono riuscito a leggere l'erogato in questo momento, riprova tra poco.";

export const MAX_ROWS = { min: 1000, max: 50_000, default: 10_000 };
export const DEFAULT_TIMEOUT_SECONDS = 60;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
// a Firestore auto id: anything else cannot be a connection (the server turns it into a document path)
const SAFE_CONNECTION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const text = value => (typeof value === 'string' ? value : '');
const positiveNumber = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** What the chat says when a command fails and the admin wrote no message of their own. */
export const defaultErrorMessage = command =>
  `Non sono riuscito a eseguire «${command?.name || 'il comando'}» in questo momento, riprova tra poco.`;

/** One command as the browser uses it, or null when it is not one (no safe id). Missing values get the defaults. */
export function normalizeCommand(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id).trim();
  if (!SAFE_ID.test(id)) return null;
  const connectionId = text(raw.connectionId).trim();
  return {
    id,
    name: text(raw.name).trim() || id,
    enabled: raw.enabled === true,
    // an empty list is the admin's choice (no word runs it, only a shortcut)
    triggers: Array.isArray(raw.triggers) ? raw.triggers.filter(t => typeof t === 'string') : [],
    connectionId: SAFE_CONNECTION_ID.test(connectionId) ? connectionId : '',
    sql: text(raw.sql),
    format: text(raw.format).trim() || 'table',
    title: text(raw.title),
    intro: text(raw.intro),
    maxRows: Math.min(MAX_ROWS.max, Math.max(1, Math.round(positiveNumber(raw.maxRows) ?? MAX_ROWS.default))),
    timeoutSeconds: positiveNumber(raw.timeoutSeconds) ?? DEFAULT_TIMEOUT_SECONDS,
    errorMessage: text(raw.errorMessage)
  };
}

/** The old single command, as the first command of the list. A missing list of triggers is the old default. */
function fromLegacy(legacy) {
  return normalizeCommand({
    ...legacy,
    id: LEGACY_EROGATO_ID,
    name: 'Erogato',
    format: 'erogato',
    triggers: Array.isArray(legacy.triggers) ? legacy.triggers : ['erogato'],
    errorMessage: typeof legacy.errorMessage === 'string' ? legacy.errorMessage : LEGACY_ERROR_MESSAGE
  });
}

/**
 * The commands in a stored settings object: the array when there is one (an empty one too: the admin
 * deleted them all), else the old `erogatoCommand` as one command, else none. The first of two commands
 * with the same id wins.
 */
export function normalizeCommands(stored) {
  let commands;
  if (Array.isArray(stored?.noAiCommands)) {
    commands = stored.noAiCommands.map(normalizeCommand);
  } else if (stored?.erogatoCommand && typeof stored.erogatoCommand === 'object') {
    commands = [fromLegacy(stored.erogatoCommand)];
  } else {
    commands = [];
  }
  const seen = new Set();
  return commands.filter(command => {
    if (!command || seen.has(command.id)) return false;
    seen.add(command.id);
    return true;
  });
}

/** A new id, different from the ones in `existing`: 'cmd-' and eight letters or digits. */
export function newCommandId(existing = []) {
  const taken = new Set(existing.map(command => command.id));
  let id;
  do id = `cmd-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
  while (taken.has(id));
  return id;
}

/** Trimmed, no empty lines, no repeats within the list: what stays once the admin leaves the field. */
export function cleanTriggers(list) {
  const seen = new Set();
  return list
    .map(word => String(word).trim())
    .filter(word => {
      const key = normalizeTrigger(word);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Cleans a command's trigger list against the other commands: besides `cleanTriggers`, a word another
 * command already has is left out, so two commands never share one. Returns the list that stays and the
 * words left out, with the name of the command that has them: `{ triggers, rejected: [{ trigger, owner }] }`.
 */
export function claimTriggers(list, others) {
  const taken = new Map(); // normalized trigger -> name of the command that has it
  for (const other of others) {
    for (const trigger of other.triggers ?? []) {
      const key = normalizeTrigger(trigger);
      if (key && !taken.has(key)) taken.set(key, other.name);
    }
  }
  const rejected = [];
  const triggers = cleanTriggers(list).filter(word => {
    const owner = taken.get(normalizeTrigger(word));
    if (owner === undefined) return true;
    rejected.push({ trigger: word, owner });
    return false;
  });
  return { triggers, rejected };
}

/**
 * A new command from a preset (`{ format, name, triggers, sql, errorMessage }`, which the server serves: the
 * SQL is theirs) or empty (`preset` null: a `table` command). Off, with no connection: the admin chooses it.
 * The preset's words another command already has are left out (`rejected`, as in `claimTriggers`).
 */
export function createCommand(existing, preset = null) {
  const { triggers, rejected } = claimTriggers(preset?.triggers ?? [], existing);
  const command = normalizeCommand({
    id: newCommandId(existing),
    name: preset?.name ?? 'Nuovo comando',
    enabled: false,
    triggers,
    connectionId: '',
    sql: preset?.sql ?? '',
    format: preset?.format ?? 'table',
    maxRows: preset ? MAX_ROWS.default : 1000,
    errorMessage: preset?.errorMessage ?? ''
  });
  return { command, rejected };
}
