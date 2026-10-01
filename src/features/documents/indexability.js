import { INDEXABLE_MIME_TYPES } from './fileTypes';

/**
 * Why a document cannot be indexed right now, or null if it can. Shown on the row instead of
 * letting indexing start and fail.
 */
export function getIndexingBlocker(document) {
  if (!INDEXABLE_MIME_TYPES.has(document?.mimeType)) {
    return { label: 'Formato non supportato', reason: 'Convertilo in PDF e caricalo dal computer.' };
  }
  if (!document?.storagePath) {
    return { label: 'File mancante', reason: 'Manca il file: caricalo di nuovo dal computer.' };
  }
  return null;
}

export const canIndexNow = document => !getIndexingBlocker(document);

/** Documents are unique by name: the key ignores case and surrounding spaces. */
export const nameKey = document => (document.name || '').trim().toLowerCase();
