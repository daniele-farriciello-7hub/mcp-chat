/**
 * `offer_files` tool: when the operator asks for a file and several could be the right one (the light
 * and the dark logo, two formats), or none matches exactly but some come close, the model does not guess
 * and does not stack several `share_file` cards: it shows the candidates as thumbnails to pick from
 * (`components/FileChoiceCard.jsx`). The pick is handled by the app, with no round trip through the
 * model, and turns into the normal shared-file card (`SharedFileCard.jsx`). Like `share_file`, the card
 * is drawn from document ids alone, so it also comes back after a reload.
 *
 * The model's turn ends here: it is told to stop and wait, and the operator's answer either needs
 * nothing more (a file picked) or arrives as a normal message ("Nessuno di questi").
 */
export const OFFER_FILES_TOOL_NAME = 'offer_files';

const MAX_FILES = 6;
const MAX_QUESTION_CHARS = 200;
const REASONS = ['ambiguous', 'no_exact_match'];

export const OFFER_FILES_TOOL = {
  functionDeclarations: [
    {
      name: OFFER_FILES_TOOL_NAME,
      description:
        "Mostra all'operatore le anteprime di 2-6 file dell'archivio fra cui scegliere, con un clic. Usalo quando " +
        'più file potrebbero essere quello giusto e la richiesta non dice quale (la versione chiara e quella ' +
        'scura di un logo, formati diversi), oppure quando nessun file corrisponde esattamente ma alcuni ci ' +
        "vanno vicino. Non chiamare share_file più volte al posto suo. Quando l'operatore sceglie, l'app gli " +
        'mostra il file con il pulsante per scaricarlo: tu non devi fare altro. Usa solo id che compaiono ' +
        "nell'elenco dei documenti indicizzati. Dopo averlo chiamato chiudi il turno con al massimo una frase " +
        "breve e aspetta: non rispondere alla domanda al posto dell'operatore.",
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'La domanda, breve, scritta per l\'operatore: ad esempio "Quale logo intendi?".'
          },
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: "Da 2 a 6 id di file presi dall'elenco, i più probabili per primi."
          },
          reason: {
            type: 'string',
            enum: REASONS,
            description:
              '"ambiguous" (default): più file corrispondono davvero. "no_exact_match": nessuno corrisponde ' +
              'esattamente, questi sono i più vicini.'
          }
        },
        required: ['question', 'ids']
      }
    }
  ]
};

/** One call to `offer_files`. Returns the `{response}` half of a functionResponse. */
export async function runOfferFilesCall(call, { catalog, round, index, onActivityStart, onActivityEnd }) {
  const { question, ids, reason } = call.args || {};
  const activityId = `files-${round}-${index}`;
  onActivityStart(activityId, { kind: 'file_choice', label: 'Preparo le opzioni' });

  // ids that are not in the catalog (invented, or the file was deleted meanwhile) are dropped, not fatal
  const requested = Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string'))] : [];
  const files = requested
    .map(id => catalog.find(entry => entry.id === id))
    .filter(Boolean)
    .slice(0, MAX_FILES)
    .map(entry => ({ documentId: entry.id, documentName: entry.name }));

  if (!files.length) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Nessuna opzione' });
    return { response: { error: 'no valid file id: use ids from the list of indexed documents' } };
  }

  onActivityEnd(activityId, {
    outcome: 'done',
    label:
      (typeof question === 'string' && question.trim().slice(0, MAX_QUESTION_CHARS)) || 'Quale file intendi?',
    files,
    reason: REASONS.includes(reason) ? reason : 'ambiguous'
  });
  return {
    response: {
      ok: true,
      shown: 'the operator will pick one; stop here and wait',
      ...(files.length < requested.length
        ? { ignored: 'some ids were not in the list and were dropped' }
        : {})
    }
  };
}
