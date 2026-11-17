/**
 * `query_database` tool: lets the model run a read-only SQL query against an enabled database
 * connection. The query is re-validated server-side (`functions/src/db/validateSelect.js`) against
 * the tables actually enabled for that connection — the enabled list is the allowlist, not a hint,
 * so a call naming a disabled table is refused there even if it slipped past this description.
 */
import { callFunction } from '@/shared/firebase/functions';

export const QUERY_DATABASE_TOOL_NAME = 'query_database';

export const QUERY_DATABASE_TOOL = {
  functionDeclarations: [
    {
      name: QUERY_DATABASE_TOOL_NAME,
      description:
        'Esegue una query SQL di sola lettura (una singola SELECT) su una connessione al database elencata ' +
        "nell'istruzione di sistema, per rispondere con dati veri invece che a memoria. Usa solo tabelle e " +
        "colonne che compaiono nello schema ricevuto: non inventarne. Se la query fallisce, l'errore dice " +
        'perché: correggila invece di ripeterla identica.',
      parameters: {
        type: 'object',
        properties: {
          connectionId: {
            type: 'string',
            description: "L'id della connessione da interrogare, preso dallo schema ricevuto."
          },
          sql: {
            type: 'string',
            description: 'La query, una singola istruzione SELECT (o WITH ... SELECT).'
          }
        },
        required: ['connectionId', 'sql']
      }
    }
  ]
};

/**
 * One call to `query_database`. Returns the `{response}` half of a functionResponse.
 *
 * What the operator sees is the same plain-language activity as any other tool (ActivityRow's own
 * rule — never function names or raw parameters). Two more fields ride on the activity, for the
 * conversation history only (`recordTurn` stores them, the admin's Storico shows them; no live
 * component draws either, and a failed activity is not drawn at all): `sql`, sent from the start for
 * admins and on a failure for every user, and `errorDetail`, the raw reason of a failure. Without them
 * a failed query leaves nothing to look at afterwards, for the operators who are not admins.
 */
export async function runQueryDatabaseCall(
  call,
  { schema, round, index, isAdmin, onActivityStart, onActivityEnd, maxQueryRows, queryTimeoutSeconds }
) {
  const { connectionId, sql } = call.args || {};
  const connectionLabel = schema.find(entry => entry.connectionId === connectionId)?.label;
  const activityId = `query-${round}-${index}`;
  // normalized so re-sending the exact same query with only whitespace changed still dedupes; a
  // genuinely different query (even on the same table) is new work and keeps its own card
  const normalizedSql = typeof sql === 'string' ? sql.trim().replace(/\s+/g, ' ') : null;
  onActivityStart(activityId, {
    kind: 'data',
    label: 'Sto interrogando',
    databaseLabel: connectionLabel || 'il database',
    dedupeKey: normalizedSql ? `query:${connectionId}:${normalizedSql}` : undefined,
    ...(isAdmin ? { sql } : {})
  });

  // history-only fields of a failed call (see above); `sql` stays whatever the model sent, if it is text
  const failure = (label, errorDetail) => ({
    outcome: 'failed',
    label,
    errorDetail,
    ...(typeof sql === 'string' ? { sql } : {})
  });

  if (!connectionId || !sql) {
    const reason = 'connectionId and sql are required';
    onActivityEnd(activityId, failure('Query non valida', reason));
    return { response: { error: reason } };
  }

  try {
    const result = await callFunction('database', 'query', {
      connectionId,
      sql,
      maxRows: maxQueryRows,
      timeoutSeconds: queryTimeoutSeconds
    });
    onActivityEnd(activityId, {
      outcome: 'done',
      label: 'Dati letti',
      detail: `${result.rowCount} righ${result.rowCount === 1 ? 'a' : 'e'}${result.truncated ? ', risultato troncato' : ''}`
    });
    return {
      response: {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        // impossible for the model to miss this and still report the row count as a total
        ...(result.truncated
          ? { warning: 'Risultato troncato: il numero di righe qui sopra non è il totale reale.' }
          : {})
      }
    };
  } catch (error) {
    const reason = error.message || 'query failed';
    onActivityEnd(activityId, {
      ...failure('Non riuscita', reason),
      message: 'Non sono riuscito a leggere questi dati dal database.'
    });
    // the raw reason goes back to the model, not the sentence shown above: it needs the real cause
    // to correct the query, not a sentence written for a person (see plan edge case 16)
    return { response: { error: reason } };
  }
}
