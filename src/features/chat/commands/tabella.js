/**
 * The answer of the `table` format of the commands without AI: the rows of the query as one markdown table
 * (`renderMarkdownLite` draws it), with an optional title and intro of the admin's. Any columns will do.
 *
 * Pure: rows in, markdown out, no dependencies. Numbers are written the Italian way (1.234,50), dates as
 * dd/mm/yyyy, and only the first TABLE_DISPLAY_ROWS rows are shown: a chat message is not a spreadsheet,
 * and the line under the table says how many there were.
 */

/** Rows drawn in the answer; the rest is counted in the note under the table. */
export const TABLE_DISPLAY_ROWS = 50;

// a DECIMAL column comes back as a string ("450000.00"); a plain run of digits stays text (a code, a phone number)
const DECIMAL_STRING = /^-?\d+\.\d+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?)?$/;
// whole numbers in these columns are labels (a year, an id, a postcode), not quantities: no thousands separator
const LABEL_COLUMN = /(^|_)(id|anno|year|cap|cod|codice|mese|month|giorno|day)($|_)/i;
const MAX_DECIMALS = 4;

const isNumber = value =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && DECIMAL_STRING.test(value));

/** A cell as text for the table: no pipes (they would split the row) and no line breaks. */
const plain = value => String(value).replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

function formatNumber(value, column) {
  if (typeof value === 'string') {
    const decimals = Math.min(MAX_DECIMALS, value.split('.')[1].length);
    return Number(value).toLocaleString('it-IT', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: 'always'
    });
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString('it-IT', { useGrouping: LABEL_COLUMN.test(column) ? false : 'always' });
  }
  return value.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' });
}

function formatCell(value, column) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  if (isNumber(value)) return formatNumber(value, column);
  if (typeof value === 'string') {
    const date = ISO_DATE.exec(value);
    if (date) {
      const [, year, month, day, hours, minutes, seconds] = date;
      const when = `${day}/${month}/${year}`;
      // a DATE column arrives as midnight: only a real time of day is worth showing
      return hours && `${hours}${minutes}${seconds}` !== '000000' ? `${when} ${hours}:${minutes}` : when;
    }
  }
  return plain(typeof value === 'object' ? JSON.stringify(value) : value);
}

/** "numero_pratiche" → "Numero pratiche". */
const heading = column => {
  const text = plain(String(column).replace(/_/g, ' '));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * rows: the rows of the command's query; columns: their names, in order (the server sends them; read from
 * the first row when missing). Returns the markdown of the answer.
 */
export function componiTabella(rows, { columns, title = '', intro = '' } = {}) {
  const out = [];
  if (title.trim()) out.push(`**${plain(title)}**`, '');
  if (intro.trim()) out.push(intro.trim(), '');
  if (!rows.length) {
    out.push('Nessun risultato.');
    return out.join('\n');
  }

  const names = columns?.length ? columns : Object.keys(rows[0]);
  const shown = rows.slice(0, TABLE_DISPLAY_ROWS);
  // a column of numbers is right-aligned; an empty cell does not make it text
  const numeric = names.map(name => {
    const values = shown
      .map(row => row[name])
      .filter(value => value !== null && value !== undefined && value !== '');
    return values.length > 0 && values.every(isNumber);
  });

  out.push(
    `| ${names.map(heading).join(' | ')} |`,
    `|${numeric.map(right => (right ? '---:' : '---')).join('|')}|`,
    ...shown.map(row => `| ${names.map(name => formatCell(row[name], name)).join(' | ')} |`)
  );
  if (rows.length > shown.length) {
    out.push(
      '',
      `_Mostro le prime ${shown.length.toLocaleString('it-IT')} righe su ${rows.length.toLocaleString('it-IT')}._`
    );
  }
  return out.join('\n');
}
