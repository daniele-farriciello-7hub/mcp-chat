/**
 * What the admin's "Comandi senza AI" section asks the `database` function (settings → Database). Both are
 * server actions: the SQL and the connection of a command are the server's, never sent from here.
 */
import { callFunction } from '@/shared/firebase/functions';

/**
 * The ready-made commands ("Da modello") with their SQL: `[{ format, name, triggers, sql, errorMessage }]`.
 * Admin only.
 */
export async function loadCommandPresets() {
  const { presets } = await callFunction('database', 'commandPresets');
  return presets;
}

/**
 * Runs a command as the signed-in admin, with the SAVED settings: the same call the chat makes, so the
 * server's checks (connection, tables, row cap, columns of the format) answer here too. Resolves to the
 * number of rows and the time of the query; throws the server's reason (in Italian) when it does not run.
 */
export async function testCommand(commandId) {
  const { rowCount, tookMs } = await callFunction('database', 'command', { commandId });
  return { rowCount, tookMs };
}
