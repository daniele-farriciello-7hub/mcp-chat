/**
 * `export_excel` tool: offers a download button for a table of data the model already has in hand —
 * from `query_database`, from documents it opened, or a comparison it put together itself. This is
 * deliberately separate from `query_database`'s own result: the first real test showed the model
 * asked for an export on a table it built from *documents* (bank policies), not from a live query,
 * and with no export mechanism that covered that case it just typed a ```csv code fence into the
 * reply text — which the chat's markdown renderer doesn't support, so it showed up as raw text,
 * backticks included. One export path, independent of where the data came from, replaces that.
 *
 * A real `.xlsx`, not a CSV: Excel on an Italian locale expects semicolons in a CSV (comma is the
 * decimal separator), so a comma-delimited file often lands in one column on open — see
 * `shared/xlsx.js`. No network call here either way: the model hands over the rows itself, so this
 * is a pure in-memory hand-off to the same activity-row mechanism `query_database` result cards use
 * for their own download button.
 */
export const EXPORT_EXCEL_TOOL_NAME = 'export_excel';

export const EXPORT_EXCEL_TOOL = {
  functionDeclarations: [
    {
      name: EXPORT_EXCEL_TOOL_NAME,
      description:
        'Mostra un pulsante per scaricare come file Excel una tabella di dati che hai già in mano — da ' +
        'una query, da documenti che hai letto, o da un confronto che hai costruito tu. Usalo SOLO quando ' +
        "l'operatore ha chiesto esplicitamente di esportare, scaricare o avere un file: mai di tua " +
        'iniziativa. Non scrivere mai i dati nel testo della risposta, in un blocco di codice o altrove: ' +
        'chiama questo strumento, il pulsante compare da solo sopra alla risposta. Dopo averlo chiamato, ' +
        "di' solo a parole che i dati sono scaricabili dal pulsante qui sopra — non ripetere la tabella.",
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Etichetta breve per il file, es. "Prodotti mutuo per banca".'
          },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Intestazioni delle colonne, in ordine.'
          },
          rows: {
            type: 'array',
            items: { type: 'array', items: { type: 'string' } },
            description:
              'Una voce per riga: i valori nello stesso ordine delle colonne, tutti come testo — ' +
              'anche i numeri, scritti come stringa.'
          }
        },
        required: ['columns', 'rows']
      }
    }
  ]
};

/** One call to `export_excel`. Returns the `{response}` half of a functionResponse. */
export async function runExportExcelCall(call, { round, index, onActivityStart, onActivityEnd }) {
  const { title, columns, rows } = call.args || {};
  const activityId = `export-${round}-${index}`;
  const safeColumns = Array.isArray(columns) ? columns.filter(c => typeof c === 'string') : [];
  const safeRows = Array.isArray(rows) ? rows.filter(Array.isArray) : [];

  onActivityStart(activityId, { label: 'Preparo il file' });

  if (!safeColumns.length || !safeRows.length) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Niente da esportare' });
    return { response: { error: 'columns and rows are required and must not be empty' } };
  }

  // shaped the same way query_database's rows already are, so the download button and the xlsx
  // builder (downloadXlsx in shared/xlsx.js) don't need to know which tool produced them
  const objectRows = safeRows.map(row =>
    Object.fromEntries(safeColumns.map((column, i) => [column, row[i] ?? '']))
  );

  onActivityEnd(activityId, {
    outcome: 'done',
    label: 'File pronto',
    detail: `${title ? `${title} · ` : ''}${objectRows.length} righ${objectRows.length === 1 ? 'a' : 'e'}`,
    exportTitle: title,
    columns: safeColumns,
    rows: objectRows
  });

  return { response: { ok: true, rowCount: objectRows.length } };
}
