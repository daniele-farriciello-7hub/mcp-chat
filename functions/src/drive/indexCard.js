/**
 * What Gemini is asked to write for a document, and how the answer is cleaned: the index card.
 *
 * KEEP IN STEP WITH THE BROWSER. `INDEX_CARD_SCHEMA`, the prompt and the defaults below are a copy of
 * src/features/documents/indexing.js (`INDEX_CARD_SCHEMA`, `indexingPrompt`, `uniqueStrings`),
 * src/features/settings/defaultSettings.js (the indexing defaults) and src/features/settings/models.js,
 * which index the documents an admin uploads. A card written here for a Drive file must be the same
 * as one written there for an uploaded file, or the chat would treat the two differently. Change one,
 * change the other. (Only the PDF branches of the prompt are here: the Drive sync takes nothing else.)
 */
import { attachmentsBlock } from './promptAttachments.js';

export const INDEX_CARD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-4 frasi: a cosa serve il documento e cosa contiene.' },
    banks: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Istituti, banche o societa finanziarie di cui parla il documento, col nome per esteso come ' +
        'compare nel testo. Array vuoto se il documento non ne riguarda nessuno in particolare.'
    },
    products: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Prodotti o tipi di pratica trattati, per esempio mutuo, cessione del quinto, prestito ' +
        'personale, delega di pagamento, lead. Usa i termini del documento. Array vuoto se non ce ne sono.'
    },
    topics: {
      type: 'array',
      items: { type: 'string' },
      description: 'Temi e sezioni trattate, da 3 a 15, concisi.'
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Termini, sigle e sinonimi che farebbero pensare a questo documento, da 5 a 20.'
    }
  },
  required: ['summary', 'banks', 'products', 'topics', 'keywords']
};

// defaultSettings.js DEFAULT_INDEXING_INSTRUCTIONS, models.js DEFAULT_CHAT_MODEL / DEFAULT_INDEXING_MODEL
export const DEFAULT_INDEXING_INSTRUCTIONS = `Sei il bibliotecario di una società di mediazione creditizia.
Ti do UN documento. Crea la sua scheda-indice per un motore di ricerca interno.
Riconosci gli istituti di cui parla e i prodotti che tratta (mutuo, cessione del quinto, prestito personale, lead...): servono a capire, fra tanti documenti simili, che questo è quello giusto.
Usa solo quello che c'è nel documento, non inventare. Scrivi in italiano.
Rispondi esclusivamente con JSON conforme allo schema.`;
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash';
export const DEFAULT_INDEXING_MODEL = 'gemini-3.1-pro-preview';

/**
 * The indexing part of `apps/<app>/config/settings`, completed with the defaults the way the browser's
 * `withDefaults` (settingsStore.js) does: a missing field takes the default, an empty model means "the chat model".
 */
export function indexingSettings(stored = {}) {
  return {
    modelId: (stored.indexingModel ?? DEFAULT_INDEXING_MODEL) || (stored.chatModel ?? DEFAULT_CHAT_MODEL),
    instructions: stored.indexingInstructions ?? DEFAULT_INDEXING_INSTRUCTIONS,
    attachments: Array.isArray(stored.indexingAttachments) ? stored.indexingAttachments : []
  };
}

// the admin edits the instructions in the panel; what is appended here cannot be lost: the file name and
// what the admin wrote about it
export const indexingPrompt = (instructions, attachments, document) =>
  [
    instructions || DEFAULT_INDEXING_INSTRUCTIONS,
    attachmentsBlock(attachments),
    `Il documento si chiama "${document.name}".`,
    document.description?.trim() &&
      `Chi l'ha caricato lo descrive così: «${document.description.trim()}». È la fonte più affidabile su cosa sia ` +
        'e a cosa serva: la scheda deve essere coerente con questa descrizione e riprenderne i termini.'
  ]
    .filter(Boolean)
    .join('\n');

const uniqueStrings = list => [
  ...new Set((Array.isArray(list) ? list : []).map(v => String(v).trim()).filter(Boolean))
];

/** Gemini's JSON answer as the card the archive stores. */
export const cardFromAnswer = card => ({
  summary: String(card.summary || '').trim(),
  banks: uniqueStrings(card.banks),
  products: uniqueStrings(card.products),
  topics: uniqueStrings(card.topics),
  keywords: uniqueStrings(card.keywords)
});
