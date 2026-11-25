/**
 * Changing how a document is used (`mode`, archiveMode.js) after it was uploaded or synchronised from Drive.
 * It is a metadata update: the Drive sync writes only the fields it names, so it does not undo it.
 *
 *   studied → archive   only the mode changes: the full card the document has is more than the short one
 *                       needs, and the chat stops reading it from one moment to the next
 *   archive → studied   a document that has only the short card (`indexCard.light`) goes back to "pending" and
 *                       is queued for indexing, so the full card is written; the chat does not read it until
 *                       then. One that was studied before keeps its full card and is ready at once.
 *
 * A document that is not indexed yet just takes the mode: indexing will write the card that goes with it.
 */
'use client';

import { updateDoc } from 'firebase/firestore';
import { DOCUMENT_MODE, modeOf } from './archiveMode';
import { invalidateChatCatalog } from './chatCatalog';
import { enqueueForIndexing } from './indexingQueue';
import { INDEXING_STATUS, documentRef } from './schema';

const needsFullCard = (document, mode) =>
  mode === DOCUMENT_MODE.studied &&
  document.indexingStatus === INDEXING_STATUS.done &&
  document.indexCard?.light === true;

/** Switches one document. Resolves once the document is saved; the new card, if any, is written in the background. */
export async function changeDocumentMode(document, mode) {
  if (modeOf(document) === mode) return;
  const rewrite = needsFullCard(document, mode);
  await updateDoc(documentRef(document.id), {
    mode,
    ...(rewrite ? { indexingStatus: INDEXING_STATUS.pending, error: null } : {})
  });
  invalidateChatCatalog();
  if (rewrite) enqueueForIndexing([{ ...document, mode, indexingStatus: INDEXING_STATUS.pending }]);
}

/** Switches several; resolves to how many could not be saved. */
export async function changeDocumentsMode(documents, mode) {
  const results = await Promise.allSettled(documents.map(document => changeDocumentMode(document, mode)));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) {
    console.error(
      '[documents] changing the mode failed:',
      failures.map(f => f.reason)
    );
  }
  return failures.length;
}
