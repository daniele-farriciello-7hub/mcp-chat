/** File families, what Gemini can index, and how documents are compared. */

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Filter chips in the panel, in display order. */
export const FILE_TYPES = [
  { id: 'pdf', name: 'PDF', matches: m => m === 'application/pdf' },
  { id: 'gdoc', name: 'Documento Google', matches: m => m === 'application/vnd.google-apps.document' },
  { id: 'gsheet', name: 'Foglio Google', matches: m => m === 'application/vnd.google-apps.spreadsheet' },
  { id: 'text', name: 'Testo', matches: m => /^text\//.test(m || '') },
  { id: 'word', name: 'Word', matches: m => /msword|wordprocessingml/.test(m || '') },
  { id: 'excel', name: 'Excel', matches: m => /ms-excel|spreadsheetml/.test(m || '') },
  { id: 'image', name: 'Immagine', matches: m => /^image\//.test(m || '') }
];

export const fileTypeOf = mimeType => FILE_TYPES.find(t => t.matches(mimeType))?.id || 'other';

/** What Gemini can read. Word and Excel must be converted to PDF first. */
export const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet'
]);

export const safeFileName = name =>
  String(name || 'documento')
    .replace(/[\\/#?[\]*]/g, '_')
    .slice(0, 180);
