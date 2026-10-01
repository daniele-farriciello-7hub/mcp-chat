/**
 * `read_document` tool: lets the model open a whole indexed document when its index card is not
 * enough. The file goes back INSIDE the functionResponse (`parts`): the SDK rejects a message that
 * mixes a functionResponse with other parts. Dispatch across every tool lives in `runToolCalls.js`.
 */
import { getDocumentForReading } from '@/features/documents/chatCatalog';

export const READ_DOCUMENT_TOOL_NAME = 'read_document';

export const READ_DOCUMENT_TOOL = {
  functionDeclarations: [
    {
      name: READ_DOCUMENT_TOOL_NAME,
      description:
        "Apre per intero un documento dell'archivio, quando la sintesi nell'elenco non basta a rispondere con " +
        "sicurezza. Usa solo un id che compare nell'elenco dei documenti indicizzati ricevuto nell'istruzione di " +
        'sistema: non inventarne uno.',
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
  const catalogName = catalog.find(entry => entry.id === id)?.name;
  const activityId = `read-${round}-${index}`;
  onActivityStart(activityId, {
    label: catalogName ? 'Sto leggendo' : 'Sto leggendo un documento',
    documentName: catalogName,
    // same document already opened earlier in this exchange: skip a second identical card
    // (useConversation.js's onActivityStart) — the call still runs, the model still gets the file
    dedupeKey: id ? `doc:${id}` : undefined
  });

  const document = id ? await getDocumentForReading(id).catch(() => null) : null;
  if (!document) {
    onActivityEnd(activityId, {
      outcome: 'failed',
      label: 'Non trovato',
      message: 'Non trovo questo documento nell’archivio.'
    });
    return { response: { error: 'document not found' } };
  }

  onActivityEnd(activityId, { outcome: 'done', label: 'Info prese da', documentId: id });
  return {
    response: { ok: true, name: document.name },
    parts: [{ fileData: { mimeType: document.mimeType, fileUri: document.fileUri } }]
  };
}
