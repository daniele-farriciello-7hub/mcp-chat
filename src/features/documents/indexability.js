import { INDEXABLE_MIME_TYPES, isImage } from './fileTypes';

/**
 * An image needs the admin's word on what it is before it is indexed: a picture alone gives the chat
 * little to find it by ("il logo di X"). `short` finishes the sentence "N file saltati: ..." in the
 * selection bar.
 */
export const MISSING_DESCRIPTION = {
  label: 'Descrizione mancante',
  reason: 'Scrivi cosa mostra l’immagine per poterla indicizzare.',
  short: 'senza descrizione'
};

/** An image with nothing written about it. Anything else never lacks one. */
export const lacksDescription = document => isImage(document?.mimeType) && !document?.description?.trim();

/**
 * Why the file itself cannot be indexed, or null. These documents are grouped apart in the pending
 * list, and do not count as "the" copy of a name when uploading: what is missing is not something a
 * field can fix, unlike a description.
 */
export function getFileBlocker(document) {
  if (!INDEXABLE_MIME_TYPES.has(document?.mimeType)) {
    return {
      label: 'Formato non supportato',
      reason: 'Convertilo in PDF e caricalo dal computer.',
      short: 'formato non supportato'
    };
  }
  if (!document?.storagePath) {
    return {
      label: 'File mancante',
      reason: 'Manca il file: caricalo di nuovo dal computer.',
      short: 'file mancante'
    };
  }
  return null;
}

/**
 * Why a document cannot be indexed right now, or null if it can: the file's problems first, then a
 * missing description. Shown on the row instead of letting indexing start and fail.
 */
export function getIndexingBlocker(document) {
  return getFileBlocker(document) || (lacksDescription(document) ? MISSING_DESCRIPTION : null);
}

export const canIndexNow = document => !getIndexingBlocker(document);

/** Documents are unique by name: the key ignores case and surrounding spaces. */
export const nameKey = document => (document.name || '').trim().toLowerCase();
