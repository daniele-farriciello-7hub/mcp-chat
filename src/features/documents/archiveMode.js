/**
 * The two ways a document is used (`mode` on the document, see schema.js):
 *
 *   studied   what every document was until now: Gemini reads it, writes a full index card, the card goes
 *             in the system prompt of every chat turn and `read_document` opens the file to answer from it
 *   archive   the assistant only recognises the file and hands it over: a short card, kept out of the
 *             system prompt (found with `search_archive`) and `read_document` refuses it
 *
 * A document without `mode` is a studied one, so everything written before this existed keeps working.
 * Pure, so the chat, the panel and the tests all read it the same way.
 */
export const DOCUMENT_MODE = { studied: 'studied', archive: 'archive' };

/** What the admin sees for each mode (upload choice, row switch, filters). */
export const DOCUMENT_MODES = [
  {
    id: DOCUMENT_MODE.studied,
    name: 'Studia',
    pill: 'Studiato',
    description: 'Vale legge il file e risponde sul contenuto.'
  },
  {
    id: DOCUMENT_MODE.archive,
    name: 'Solo archivio',
    pill: 'Archivio',
    description: 'Vale lo riconosce e lo consegna, ma non risponde sul contenuto.'
  }
];

export const modeOf = document =>
  document?.mode === DOCUMENT_MODE.archive ? DOCUMENT_MODE.archive : DOCUMENT_MODE.studied;

export const isArchive = document => modeOf(document) === DOCUMENT_MODE.archive;

/** The documents the chat reads and the ones it only finds and hands over, as two lists. */
export function splitByMode(documents) {
  const studied = [];
  const archive = [];
  for (const document of documents || []) (isArchive(document) ? archive : studied).push(document);
  return { studied, archive };
}

/**
 * What `read_document` answers when asked to open an archive file. Written for the model, in English like
 * the other tool errors: it says what to do instead, so the model offers the file rather than going on.
 */
export const ARCHIVE_ONLY_REFUSAL =
  'this file is archive-only: it can be found, offered (offer_files) and delivered (share_file), but it is not ' +
  'read to answer questions. Do not answer about its content: tell the operator in one line that the file ' +
  'is available for download, and offer it.';

/**
 * Whether a document may be opened for reading, and why not when it may not. The Firestore document is the
 * authority (the chat's cached catalog may be a minute old), so this runs on what was just read.
 */
export const readingRefusal = document => (isArchive(document) ? ARCHIVE_ONLY_REFUSAL : null);
