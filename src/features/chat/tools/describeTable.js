/**
 * `describe_table` tool: the full column list (types, keys, ENUM values, per-column description)
 * for one table the model has decided is relevant, kept out of the system instruction to save
 * tokens on every other message — see the comment on `tableBlock` in `systemPrompt.js`.
 *
 * Unlike `read_document` and `query_database`, this needs no network call: `schema` already holds
 * every enabled table's full column data (`chatSchema.js` fetched it once for the conversation), so
 * this is a plain in-memory lookup — cheap enough that the model should reach for it freely instead
 * of guessing a column's type or skipping it "to save a round".
 */
export const DESCRIBE_TABLE_TOOL_NAME = 'describe_table';

export const DESCRIBE_TABLE_TOOL = {
  functionDeclarations: [
    {
      name: DESCRIBE_TABLE_TOOL_NAME,
      description:
        'Restituisce le colonne di una tabella — nome, tipo, chiave primaria, valori ENUM ed eventuale ' +
        'descrizione — prima di scrivere una query che la usa. Usa solo un id di tabella che compare ' +
        "nell'elenco ricevuto nell'istruzione di sistema: non inventarne uno. Non serve rileggerla se l'hai " +
        'già chiesta in questa stessa conversazione.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "L'id della tabella, preso dall'elenco." }
        },
        required: ['id']
      }
    }
  ]
};

function columnLine(column, card) {
  const type = column.columnType || column.dataType;
  const bits = [column.name, column.key === 'PRI' ? `${type}, chiave primaria` : type];
  const description = card?.columns?.[column.name];
  return description ? `${bits.join(' ')}: ${description}` : bits.join(' ');
}

/** One call to `describe_table`. Returns the `{response}` half of a functionResponse. */
export async function runDescribeTableCall(call, { schema, round, index, onActivityStart, onActivityEnd }) {
  const id = call.args?.id;
  let table = null;
  let connectionId = null;
  let connectionLabel = null;
  for (const connection of schema) {
    const found = connection.tables.find(t => t.id === id);
    if (found) {
      table = found;
      connectionId = connection.connectionId;
      connectionLabel = connection.label;
      break;
    }
  }

  const activityId = `describe-${round}-${index}`;
  onActivityStart(activityId, {
    label: table ? 'Sto controllando la struttura di' : 'Sto controllando una tabella',
    databaseLabel: table ? table.name : undefined,
    // same table already described earlier in this exchange: the answer would be identical, so
    // useConversation.js skips adding a second card for it (see its onActivityStart)
    dedupeKey: table ? `describe:${connectionId}:${id}` : undefined
  });

  if (!table) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Non trovata' });
    return { response: { error: 'table not found' } };
  }

  onActivityEnd(activityId, { outcome: 'done', label: 'Struttura letta', databaseLabel: table.name });
  return {
    response: {
      connectionLabel,
      table: table.name,
      kind: table.kind,
      columns: table.columns.map(c => columnLine(c, table.card))
    }
  };
}
