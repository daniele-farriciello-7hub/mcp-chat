/**
 * `read_document` tool: lets the model open a whole indexed document when its index card is not
 * enough. The file goes back INSIDE the functionResponse (`parts`): the SDK rejects a message that
 * mixes a functionResponse with other parts. Dispatch across every tool lives in `runToolCalls.js`.
 * Images open like any other file (the model looks at them); a GIF is the exception, Gemini cannot see it.
 * An archive file (`mode: 'archive'`, documents/archiveMode.js) is refused: it is found and handed over, never
 * read to answer. The refusal tells the model what to do instead (say it is available for download, offer it).
 */
import { getDocumentForReading } from '@/features/documents/chatCatalog';
import { ARCHIVE_ONLY_REFUSAL, readingRefusal } from '@/features/documents/archiveMode';

export const READ_DOCUMENT_TOOL_NAME = 'read_document';

export const READ_DOCUMENT_TOOL = {
  functionDeclarations: [
    {
      name: READ_DOCUMENT_TOOL_NAME,
      description:
        "Apre per intero un documento dell'archivio, quando la sintesi nell'elenco non basta a rispondere con " +
        "sicurezza. Usa solo un id che compare nell'elenco dei documenti indicizzati ricevuto nell'istruzione di " +
        'sistema: non inventarne uno. I file di solo archivio (trovati con search_archive) non si aprono: servono ' +
        'solo a essere consegnati.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "L'id del documento da aprire, preso dall'elenco." }
        },
        required: ['id']
      }
    }
  ]
};

/** One call to `read_document`. Returns the `{response, parts?}` half of a functionResponse. */
export async function runReadDocumentCall(call, { catalog, round, index, onActivityStart, onActivityEnd }) {
  const id = call.args?.id;
  const catalogEntry = catalog.find(entry => entry.id === id);
  const catalogName = catalogEntry?.name;
  const activityId = `read-${round}-${index}`;
  onActivityStart(activityId, {
    kind: 'documents',
    label: catalogName ? 'Sto leggendo' : 'Sto leggendo un documento',
    documentName: catalogName,
    // same document already opened earlier in this exchange: skip a second identical card
    // (useConversation.js's onActivityStart) — the call still runs, the model still gets the file
    dedupeKey: id ? `doc:${id}` : undefined
  });

  // an archive file is refused as soon as the catalog says so, and again on what the document itself says
  const document = readingRefusal(catalogEntry)
    ? { archiveOnly: true }
    : id
      ? await getDocumentForReading(id).catch(() => null)
      : null;
  if (document?.archiveOnly) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Solo archivio' });
    return { response: { error: ARCHIVE_ONLY_REFUSAL } };
  }
  if (!document) {
    onActivityEnd(activityId, {
      outcome: 'failed',
      label: 'Non trovato',
      message: 'Non trovo questo documento nell’archivio.'
    });
    return { response: { error: 'document not found' } };
  }

  // a file Gemini cannot look at (a GIF): all the model has is the card it already got
  if (!document.fileUri) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Non leggibile' });
    return { response: { error: 'this file cannot be opened: rely on its description and index card' } };
  }

  onActivityEnd(activityId, { outcome: 'done', label: 'Info prese da', documentId: id });
  return {
    response: { ok: true, name: document.name },
    parts: [{ fileData: { mimeType: document.mimeType, fileUri: document.fileUri } }]
  };
}
