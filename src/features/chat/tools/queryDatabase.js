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
 * `isAdmin` only decides whether the SQL text rides along on the activity row: regular operators
 * see the same plain-language activity as any other tool (ActivityRow's own rule — never function
 * names or raw parameters), admins get the query itself to check what actually ran.
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
    label: 'Sto interrogando',
    databaseLabel: connectionLabel || 'il database',
    dedupeKey: normalizedSql ? `query:${connectionId}:${normalizedSql}` : undefined,
    ...(isAdmin ? { sql } : {})
  });

  if (!connectionId || !sql) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Query non valida' });
    return { response: { error: 'connectionId and sql are required' } };
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
    onActivityEnd(activityId, {
      outcome: 'failed',
      label: 'Non riuscita',
      message: 'Non sono riuscito a leggere questi dati dal database.'
    });
    // the raw reason goes back to the model, not the sentence shown above: it needs the real cause
    // to correct the query, not a sentence written for a person (see plan edge case 16)
    return { response: { error: error.message || 'query failed' } };
  }
}
