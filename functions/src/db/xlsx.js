/**
 * Rows from a query → an .xlsx file, on the server, for exports too large to pass through the model
 * (`databaseEndpoint.js` → exportFile). Same layout as the browser-side export (`src/shared/xlsx.js`):
 * one sheet, header row from the column names, numbers kept as numbers.
 */
import XLSX from 'xlsx';

const MAX_CELL_CHARS = 32_767; // Excel's own limit per cell

const cell = value => {
  if (value === null || value === undefined) return '';
  if (Buffer.isBuffer(value)) return `[binary, ${value.length} byte]`;
  if (value instanceof Date) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') return JSON.stringify(value).slice(0, MAX_CELL_CHARS);
  // the driver returns DECIMAL/BIGINT as strings (bigNumberStrings): numeric text becomes a number
  // when it fits exactly, so totals can be summed in Excel
  if (
    typeof value === 'string' &&
    /^-?\d+(\.\d+)?$/.test(value) &&
    Number.isSafeInteger(Math.trunc(Number(value))) &&
    value.length <= 15
  ) {
    return Number(value);
  }
  return typeof value === 'string' ? value.slice(0, MAX_CELL_CHARS) : value;
};

/** @returns {Buffer} */
export function buildXlsx(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows.map(row => columns.map(c => cell(row[c])))]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Dati');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
}
