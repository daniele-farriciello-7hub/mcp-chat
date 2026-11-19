/**
 * The commands without AI as the server reads them: `settings.noAiCommands`, an array kept in
 * `apps/<app>/config/settings`, edited in Configurazione → Database → Comandi senza AI. The `command`
 * action in `http/databaseEndpoint.js` runs one of them by id; the browser never sends its SQL or its
 * connection, it only names the command, and everything else comes from here.
 *
 * A command: `{ id, name, enabled, format, connectionId, sql, maxRows, timeoutSeconds }`, normalized below.
 * The browser keeps a few fields more (the trigger words, the error message, the title of a table): the
 * server does not match messages and does not write answers, so it does not read them.
 *
 * Settings saved before the commands were a list hold one command in `erogatoCommand`: until the admin
 * saves the panel (which writes the array) it is read as the command with id 'erogato' and the format
 * `erogato`. `src/features/chat/commands/commandSettings.js` does the same conversion in the browser:
 * keep the two identical (functions/scripts/database-commands.test.mjs compares them).
 */
import { getFirestore } from 'firebase-admin/firestore';
import { appRoot } from '../appContext.js';
import { COMMAND_FORMATS } from './commandFormats.js';

/** The id the old single command keeps: shortcuts saved with `command: 'erogato'` keep working. */
export const LEGACY_EROGATO_ID = 'erogato';

// Defaults for a missing field: the same as in src/features/chat/commands/commandSettings.js. The ceiling of
// the timeout is the endpoint's own (QUERY_MAX_SECONDS).
const DEFAULT_MAX_ROWS = 10_000;
const MAX_ROWS_CEILING = 50_000;
const DEFAULT_TIMEOUT_SECONDS = 60;

// the ids the browser generates, and a Firestore auto id: anything else is never a command or a connection
// (a connection id is turned into a document path)
const SAFE_COMMAND_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CONNECTION_ID = /^[A-Za-z0-9_-]{1,128}$/;

const positiveNumber = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

/**
 * One command as the server uses it, or null when it is not one (no safe id). Missing or invalid values
 * fall back to the defaults, except `enabled`, which is only true when it is exactly true. An empty SQL is
 * the format's default query, when it has one (the old command kept an empty SQL to follow the default).
 */
export function normalizeCommand(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!SAFE_COMMAND_ID.test(id)) return null;
  const connectionId = typeof raw.connectionId === 'string' ? raw.connectionId.trim() : '';
  const format = typeof raw.format === 'string' && raw.format.trim() ? raw.format.trim() : 'table';
  const ownSql = typeof raw.sql === 'string' && raw.sql.trim() ? raw.sql : '';
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    enabled: raw.enabled === true,
    format,
    connectionId: SAFE_CONNECTION_ID.test(connectionId) ? connectionId : '',
    sql: ownSql || (Object.hasOwn(COMMAND_FORMATS, format) ? COMMAND_FORMATS[format].defaultSql : ''),
    maxRows: Math.min(
      MAX_ROWS_CEILING,
      Math.max(1, Math.round(positiveNumber(raw.maxRows) ?? DEFAULT_MAX_ROWS))
    ),
    timeoutSeconds: positiveNumber(raw.timeoutSeconds) ?? DEFAULT_TIMEOUT_SECONDS
  };
}

/**
 * The commands in a settings document: the array when there is one (an empty one too: the admin deleted
 * them all), else the old single command, else none. The first of two commands with the same id wins.
 */
export function commandsFromSettings(data) {
  let commands;
  if (Array.isArray(data?.noAiCommands)) {
    commands = data.noAiCommands.map(normalizeCommand);
  } else if (data?.erogatoCommand && typeof data.erogatoCommand === 'object') {
    commands = [
      normalizeCommand({ ...data.erogatoCommand, id: LEGACY_EROGATO_ID, name: 'Erogato', format: 'erogato' })
    ];
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

/**
 * The commands, read from the settings document on every call (one small document: a change the admin just
 * saved, or tests with "Prova ora", applies at once).
 */
export async function readCommands() {
  const snapshot = await getFirestore().doc(`${appRoot()}/config/settings`).get();
  return commandsFromSettings(snapshot.exists ? snapshot.data() : null);
}

/** The command with this id, or null. With a duplicated id (hand-edited settings) the first one in the list. */
export async function commandById(id) {
  return (await readCommands()).find(command => command.id === id) ?? null;
}
