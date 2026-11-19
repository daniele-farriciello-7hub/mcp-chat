/**
 * A command's reply, with the same callbacks as `streamAgentReply` (agent.js) so `useConversation` runs
 * either one the same way: it records the question, shows the activity and the reply, and writes the turn
 * to the history alike. No model is called. The server runs the query (`command` action of the `database`
 * function, which reads the SQL and the connection from the settings: only the command's id is sent), and
 * the composer of the command's format (formats.js) writes the markdown.
 *
 * If it fails the reply is the admin's error message for that command (`command.errorMessage`, or the
 * default one) and the turn is recorded as failed, with the technical reason for admins. It never falls
 * back to the model.
 */
import { callFunction } from '@/shared/firebase/functions';
import { describeErrorDetail } from '../errors';
import { defaultErrorMessage } from './commandSettings';
import { COMMAND_FORMATS } from './formats';
import { COMMAND_MODEL } from './matchCommand';

const ACTIVITY_ID = 'command';

export async function streamCommandReply({
  command,
  onActivityStart,
  onActivityEnd,
  onReplyStart,
  onChunk,
  onDone
}) {
  const startedAt = Date.now();
  // nothing was billed: stored as zeros, so the Storico totals and averages count it as it is. `model` is
  // the marker of a command; the command's name goes next to it, as the admin called it today
  const usage = { input: 0, output: 0, thinking: 0 };
  const stored = { usage, model: COMMAND_MODEL, command: command.name };

  onActivityStart(ACTIVITY_ID, { kind: 'data', label: 'Sto interrogando' });
  let rows;
  let markdown;
  try {
    const answer = await callFunction('database', 'command', { commandId: command.id });
    rows = answer.rows;
    // the format the server ran (settings may have changed since this page loaded)
    const format = COMMAND_FORMATS[answer.format ?? command.format];
    if (!format) throw new Error(`formato sconosciuto: ${answer.format}`);
    markdown = format.compose({ rows, columns: answer.columns, command });
  } catch (error) {
    console.error(`[command] ${command.id} failed:`, error);
    const errorDetail = describeErrorDetail(error);
    onActivityEnd(ACTIVITY_ID, { outcome: 'failed', label: 'Non riuscita', errorDetail });
    onReplyStart();
    onChunk(command.errorMessage?.trim() || defaultErrorMessage(command));
    return onDone({ ...stored, durationMs: Date.now() - startedAt, error: true, errorDetail });
  }

  onActivityEnd(ACTIVITY_ID, {
    outcome: 'done',
    label: 'Dati letti',
    detail: `${rows.length} righ${rows.length === 1 ? 'a' : 'e'}`
  });
  onReplyStart();
  onChunk(markdown);
  return onDone({ ...stored, durationMs: Date.now() - startedAt });
}
