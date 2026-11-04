/**
 * `share_file` tool: hands the operator a file from the archive — the logo, the brochure, the PDF they
 * asked for — as a card with a preview (for images) and a "Scarica" button, instead of the model
 * describing it. Nothing is sent back to the model but a confirmation: the card is drawn by the app
 * (`components/SharedFileCard.jsx`) from the document id alone, which is why it also comes back after a
 * reload. The model opens a file to *read* it with `read_document`; this one is for *giving* it.
 */
import { getDocumentUrlById } from '@/features/documents/documentStore';

export const SHARE_FILE_TOOL_NAME = 'share_file';

export const SHARE_FILE_TOOL = {
  functionDeclarations: [
    {
      name: SHARE_FILE_TOOL_NAME,
      description:
        "Mostra all'operatore un file dell'archivio — un logo, un'immagine, un PDF — con l'anteprima e un " +
        'pulsante per scaricarlo. Usalo quando chiede di avere, vedere o scaricare un file ("mi dai il logo di ' +
        '…", "mandami il PDF di …"): non descriverlo a parole al posto di mostrarlo e non scrivere mai un link. ' +
        "Una chiamata per file. Usa solo un id che compare nell'elenco dei documenti indicizzati ricevuto " +
        "nell'istruzione di sistema: non inventarne uno. Dopo averlo chiamato di' in una riga cosa hai mostrato: " +
        'il pulsante compare da solo sopra alla risposta.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "L'id del file da mostrare, preso dall'elenco." }
        },
        required: ['id']
      }
    }
  ]
};

/** One call to `share_file`. Returns the `{response}` half of a functionResponse. */
export async function runShareFileCall(call, { catalog, round, index, onActivityStart, onActivityEnd }) {
  const id = call.args?.id;
  const entry = catalog.find(candidate => candidate.id === id);
  const activityId = `share-${round}-${index}`;
  // no dedupeKey: asking for the same logo again later must show a new card, right where the question is
  onActivityStart(activityId, { kind: 'file', label: 'Cerco il file' });

  // the file may have been deleted since the catalog was loaded
  const url = entry ? await getDocumentUrlById(id).catch(() => null) : null;
  if (!entry || !url) {
    onActivityEnd(activityId, {
      outcome: 'failed',
      label: 'Non trovato',
      message: 'Non trovo questo file nell’archivio.'
    });
    return { response: { error: 'file not found: use an id from the list of indexed documents' } };
  }

  onActivityEnd(activityId, {
    outcome: 'done',
    label: 'File pronto',
    documentId: id,
    documentName: entry.name
  });
  return { response: { ok: true, name: entry.name, shown: 'preview and download button are on screen' } };
}
