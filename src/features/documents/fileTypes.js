/** File families, what Gemini can index, and how documents are compared. */

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const isImage = mimeType => /^image\//.test(mimeType || '');

/** Filter chips in the panel, in display order. */
export const FILE_TYPES = [
  { id: 'pdf', name: 'PDF', matches: m => m === 'application/pdf' },
  { id: 'gdoc', name: 'Documento Google', matches: m => m === 'application/vnd.google-apps.document' },
  { id: 'gsheet', name: 'Foglio Google', matches: m => m === 'application/vnd.google-apps.spreadsheet' },
  { id: 'text', name: 'Testo', matches: m => /^text\//.test(m || '') },
  { id: 'word', name: 'Word', matches: m => /msword|wordprocessingml/.test(m || '') },
  { id: 'excel', name: 'Excel', matches: m => /ms-excel|spreadsheetml/.test(m || '') },
  { id: 'image', name: 'Immagine', matches: isImage }
];

export const fileTypeOf = mimeType => FILE_TYPES.find(t => t.matches(mimeType))?.id || 'other';

/**
 * What can get an index card. Word and Excel must be converted to PDF first. Images: PNG, JPEG and
 * WebP are read by Gemini as they are, an SVG is sent as the XML text it is, and a GIF — which Gemini
 * cannot look at — is indexed from its name and the admin's description alone.
 */
export const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml'
]);

const GEMINI_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * What Gemini is told an uploaded file is (`indexMimeType` on the document): PDF and the images it
 * reads as they are, null for a GIF (nothing to send), plain text for everything else — an SVG included.
 */
export function indexMimeTypeFor(mimeType) {
  if (mimeType === 'application/pdf' || GEMINI_IMAGE_MIME_TYPES.has(mimeType)) return mimeType;
  return mimeType === 'image/gif' ? null : 'text/plain';
}

/** Same, for a stored document; null when there is no file Gemini can be given. */
export const geminiMimeTypeOf = document =>
  document.indexMimeType || (isImage(document.mimeType) ? null : 'application/pdf');

const MIME_BY_EXTENSION = {
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml'
};

/** The browser's MIME type for a picked file; some systems leave it empty for .md and .svg. */
export const mimeTypeOf = file =>
  file.type || MIME_BY_EXTENSION[(file.name.split('.').pop() || '').toLowerCase()] || '';

export const safeFileName = name =>
  String(name || 'documento')
    .replace(/[\\/#?[\]*]/g, '_')
    .slice(0, 180);
