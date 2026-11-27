/**
 * The reply of a list of documents without AI (documentListSettings.js), with the same callbacks as
 * `streamAgentReply` (agent.js) and `streamCommandReply` (../commands/streamCommandReply.js), so `useConversation`
 * runs any of the three the same way: it records the question, shows the card and the reply, and writes the turn
 * to the history alike. No model is called and nothing is billed: the documents come from the catalog the chat
 * already reads (documents/chatCatalog.js, cached for a minute), the selection is `selectDocuments`.
 *
 * What the operator sees, in the order the model's own listings come in: the card (`FileChoiceCard`, `reason:
 * 'listing'`, so picking a file gives the usual shared-file card with its download button), then a line of text —
 * the list's intro, or a plain "Ecco i file (N)". A list that matches nothing shows no card, only the admin's
 * `emptyMessage`. If the catalog cannot be read the reply is a sentence saying so and the turn is recorded as failed,
 * with the technical reason for admins; it never falls back to the model.
 *
 * History: `model: 'elenco'` (DOCUMENT_LIST_MODEL) with the list's name in `command`, zero tokens. The card is
 * stored like an `offer_files` one: ids, names and dates, rebuilt from the ids after a reload.
 */
import { getChatCatalog } from '@/features/documents/chatCatalog';
import { documentDay } from '@/features/documents/documentDate';
import { describeErrorDetail } from '../errors';
import { defaultEmptyMessage, listTitle } from './documentListSettings';
import { DOCUMENT_LIST_MODEL } from './matchDocumentList';
import { selectDocuments } from './selectDocuments';

const ACTIVITY_ID = 'documents';
export const DOCUMENT_LIST_ERROR_MESSAGE =
  'Non sono riuscito a leggere i documenti in questo momento, riprova tra poco.';

/** The line under the card: the admin's intro, or the count. */
const replyLine = (list, count) =>
  list.intro?.trim() || (count === 1 ? 'Ecco il file.' : `Ecco i file (${count}).`);

export async function streamDocumentListReply({
  documentList: list,
  settings,
  onActivityStart,
  onActivityEnd,
  onReplyStart,
  onChunk,
  onDone
}) {
  const startedAt = Date.now();
  // nothing was billed: stored as zeros, so the Storico totals and averages count it as it is. `model` is the
  // marker of a list; the list's name goes next to it, as the admin called it today
  const usage = { input: 0, output: 0, thinking: 0 };
  const stored = { usage, model: DOCUMENT_LIST_MODEL, command: list.name };

  onActivityStart(ACTIVITY_ID, { kind: 'file_choice', label: 'Preparo l’elenco' });
  let entries;
  try {
    const catalog = await getChatCatalog();
    entries = selectDocuments(catalog, list, { categories: settings?.documentCategories });
  } catch (error) {
    console.error(`[document list] ${list.id} failed:`, error);
    const errorDetail = describeErrorDetail(error);
    onActivityEnd(ACTIVITY_ID, { outcome: 'failed', label: 'Non riuscita', errorDetail });
    onReplyStart();
    onChunk(DOCUMENT_LIST_ERROR_MESSAGE);
    return onDone({ ...stored, durationMs: Date.now() - startedAt, error: true, errorDetail });
  }

  if (!entries.length) {
    onActivityEnd(ACTIVITY_ID, { outcome: 'done', label: 'Nessun documento' });
    onReplyStart();
    onChunk(list.emptyMessage?.trim() || defaultEmptyMessage(list));
    return onDone({ ...stored, durationMs: Date.now() - startedAt });
  }

  const files = entries.map(entry => {
    const day = documentDay(entry.date);
    return { documentId: entry.id, documentName: entry.name, ...(day ? { documentDate: day } : {}) };
  });
  onActivityEnd(ACTIVITY_ID, {
    outcome: 'done',
    label: listTitle(list),
    files,
    reason: 'listing'
  });
  onReplyStart();
  onChunk(replyLine(list, files.length));
  return onDone({ ...stored, durationMs: Date.now() - startedAt });
}
