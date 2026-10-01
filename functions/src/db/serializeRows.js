/**
 * Makes a driver result set safe to `JSON.stringify` and cheap to hand to the model:
 * `JSON.stringify` throws on a raw `BigInt`, `Buffer` values are unreadable as JSON, and an
 * unbounded result would blow the response size and the model's context on one wide table.
 */
const MAX_CELL_CHARS = 500;
const MAX_TOTAL_CHARS = 60_000;

function serializeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `[binary, ${value.length} byte]`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
    return `${value.slice(0, MAX_CELL_CHARS)}…`;
  }
  return value;
}

/**
 * @param {object[]} rows
 * @param {number} maxRows already-applied row cap, only used to say whether it was hit
 * @returns {{columns: string[], rows: object[], rowCount: number, truncated: boolean}}
 */
export function serializeRows(rows, { maxRows }) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const serialized = [];
  let charBudget = MAX_TOTAL_CHARS;
  let truncated = rows.length >= maxRows;

  for (const row of rows) {
    const cells = Object.fromEntries(columns.map(c => [c, serializeCell(row[c])]));
    const cost = JSON.stringify(cells).length;
    if (cost > charBudget && serialized.length > 0) {
      truncated = true;
      break;
    }
    charBudget -= cost;
    serialized.push(cells);
  }

  return { columns, rows: serialized, rowCount: serialized.length, truncated };
}
