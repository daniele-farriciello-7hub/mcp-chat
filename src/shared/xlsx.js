/**
 * Turns tabular data (columns + rows, as `query_database`/`export_excel` already shape them) into a
 * real `.xlsx` file and triggers a browser download.
 *
 * Chosen over a plain CSV: Excel on an Italian locale expects the semicolon as the field
 * separator, because the comma is already the decimal separator — a comma-delimited CSV often
 * lands entirely in one column on open, not split into cells, until someone runs "Dati > Testo in
 * colonne" by hand. A native `.xlsx` has no such ambiguity, and numbers land as real numeric cells
 * (sortable, summable) instead of text.
 *
 * `xlsx` (SheetJS) is loaded on demand: most conversations never click a download button, so the
 * library — sizeable, and used here for its write path only, never to parse a file someone else
 * produced — shouldn't sit in the bundle everyone downloads on page load.
 */

export async function downloadXlsx(filenameBase, columns, rows) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dati');
  XLSX.writeFile(workbook, `${filenameBase}.xlsx`);
}

/** Lowercase, ASCII, hyphen-separated — safe as a filename fragment on every OS. */
export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (città -> citta)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
