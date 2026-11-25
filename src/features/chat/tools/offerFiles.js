/**
 * `offer_files` tool: when the operator asks for a file and several could be the right one (the light
 * and the dark logo, two formats), or none matches exactly but some come close (a typo, a partial or
 * guessed name), the model does not guess, does not silently correct the request and does not stack
 * several `share_file` cards: it shows the candidates as thumbnails to pick from
 * (`components/FileChoiceCard.jsx`). The pick is handled by the app, with no round trip through the
 * model, and turns into the normal shared-file card (`SharedFileCard.jsx`). Like `share_file`, the card
 * is drawn from document ids alone, so it also comes back after a reload.
 *
 * Why the card is shown (`reason`, which drives its header): `ambiguous` (several files match: "Quale logo
 * intendi?"), `no_exact_match` (none matches exactly, these come close: "Non ho trovato esattamente quello che
 * cerchi") or `listing` (the operator asked what files exist, a category or a kind of file: the header is just
 * the title the model gives it, e.g. "Moduli per il mutuo", and there is no "Nessuno di questi").
 *
 * 1 to 6 files. A single one is a "did you mean this?" and is only meaningful as `no_exact_match`: with
 * `ambiguous` (several files match) fewer than two is a contradiction, so the handler turns it into
 * `no_exact_match` instead of failing. A `listing` of one file stays a listing: a category can hold just one.
 *
 * The ids may be those of archive-only files, found with `search_archive`: this is also how the files of a
 * category are listed with a download button each.
 *
 * The model's turn ends here: it is told to stop and wait, and the operator's answer either needs
 * nothing more (a file picked) or arrives as a normal message ("Nessuno di questi").
 */
export const OFFER_FILES_TOOL_NAME = 'offer_files';

const MAX_FILES = 6;
const MAX_QUESTION_CHARS = 200;
const REASONS = ['ambiguous', 'no_exact_match', 'listing'];
// the card's title when a listing comes without one
const DEFAULT_LISTING_LABEL = 'File disponibili';
const DEFAULT_CHOICE_LABEL = 'Quale file intendi?';

export const OFFER_FILES_TOOL = {
  functionDeclarations: [
    {
      name: OFFER_FILES_TOOL_NAME,
      description:
        "Mostra all'operatore le anteprime di 1-6 file dell'archivio fra cui scegliere, con un clic. Usalo quando " +
        'più file potrebbero essere quello giusto e la richiesta non dice quale (la versione chiara e quella ' +
        'scura di un logo, formati diversi), oppure quando nessun file corrisponde esattamente ma alcuni ci ' +
        'vanno vicino (un refuso, un nome parziale o diverso, una sigla indovinata): in quel caso anche un solo ' +
        'file va bene, come "forse intendevi questo?", invece di correggere la richiesta in silenzio. ' +
        'Serve anche a mostrare l\'elenco dei file di una categoria o di un tipo ("che moduli ci sono per il ' +
        'mutuo?"): in quel caso usa reason "listing". ' +
        "Non chiamare share_file più volte al posto suo. Quando l'operatore sceglie, l'app gli " +
        'mostra il file con il pulsante per scaricarlo: tu non devi fare altro. Usa solo id che compaiono ' +
        "nell'elenco dei documenti indicizzati o fra i risultati di search_archive. Dopo averlo chiamato chiudi il " +
        "turno con al massimo una frase breve e aspetta: non rispondere alla domanda al posto dell'operatore.",
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'La domanda, breve, scritta per l\'operatore: ad esempio "Quale logo intendi?". Con reason "listing" ' +
              'non è una domanda ma il titolo dell\'elenco, senza punto interrogativo: ad esempio "Moduli per il mutuo".'
          },
          ids: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Da 1 a 6 id di file presi dall'elenco o da search_archive, i più probabili per primi. Un solo id è ammesso con " +
              'reason "no_exact_match" o "listing"; con "ambiguous" ne servono almeno 2.'
          },
          reason: {
            type: 'string',
            enum: REASONS,
            description:
              '"ambiguous" (default): più file corrispondono davvero e la richiesta non dice quale. ' +
              '"no_exact_match": nessuno corrisponde esattamente, questi sono i più vicini. ' +
              '"listing": l\'operatore ha chiesto quali file ci sono (una categoria, un tipo di file) e questi sono ' +
              "i file disponibili, nessuno dei quali è un'ipotesi o un'alternativa."
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

  // a single option is by definition a "did you mean this?", whatever the model labelled it, unless it is
  // a listing: a category can hold just one file, and that is still "what is there", not a guess
  const requestedReason = REASONS.includes(reason) ? reason : 'ambiguous';
  const finalReason =
    files.length === 1 && requestedReason !== 'listing' ? 'no_exact_match' : requestedReason;

  onActivityEnd(activityId, {
    outcome: 'done',
    label:
      (typeof question === 'string' && question.trim().slice(0, MAX_QUESTION_CHARS)) ||
      (finalReason === 'listing' ? DEFAULT_LISTING_LABEL : DEFAULT_CHOICE_LABEL),
    files,
    reason: finalReason
  });
  return {
    response: {
      ok: true,
      shown:
        finalReason === 'listing'
          ? 'the operator sees the files as a list to download from; stop here and wait'
          : 'the operator will pick one; stop here and wait',
      ...(files.length < requested.length
        ? { ignored: 'some ids were not in the list and were dropped' }
        : {})
    }
  };
}
