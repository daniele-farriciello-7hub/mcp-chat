/**
 * A handful of rows from one table, used only to help draft a table's index card in the admin
 * panel — never by the chat. Opt-in per connection (`allowSampling`): this is the one place real
 * row content reaches the browser and, from there, Gemini, before an admin has reviewed anything.
 */
import { withConnection } from './mysqlClient.js';
import { qualifiedTable, quoteIdentifier } from './identifiers.js';

const SAMPLE_ROWS = 5;
const MAX_CELL_CHARS = 120;

const truncateCell = value => {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[binary, ${value.length} byte]`;
  const text = typeof value === 'string' ? value : String(value);
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
};

/** @returns {Promise<{columns: string[], rows: object[]}>} */
export async function sampleTableRows(connectionId, tableName) {
  return withConnection(connectionId, async (pool, database) => {
    const columns = (
      await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
        [database, tableName]
      )
    )[0].map(r => r.COLUMN_NAME);
    if (!columns.length) throw new Error(`table "${tableName}" not found in ${database}`);

    const columnList = columns.map(quoteIdentifier).join(', ');
    const [rows] = await pool.query(
      `SELECT ${columnList} FROM ${qualifiedTable(database, tableName)} LIMIT ${SAMPLE_ROWS}`
    );

    return {
      columns,
      rows: rows.map(row => Object.fromEntries(columns.map(c => [c, truncateCell(row[c])])))
    };
  });
}
