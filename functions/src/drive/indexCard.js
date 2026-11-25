/**
 * What Gemini is asked to write for a document, and how the answer is cleaned: the index card.
 *
 * KEEP IN STEP WITH THE BROWSER. `INDEX_CARD_SCHEMA`, the prompt and the defaults below are a copy of
 * src/features/documents/indexing.js (`INDEX_CARD_SCHEMA`, `indexingPrompt`, `uniqueStrings`),
 * src/features/settings/defaultSettings.js (the indexing defaults) and src/features/settings/models.js,
 * which index the documents an admin uploads. A card written here for a Drive file must be the same
 * as one written there for an uploaded file, or the chat would treat the two differently. Change one,
 * change the other. (Only the PDF branches of the prompt are here: the Drive sync takes nothing else.)
 *
 * The same goes for what depends on the document's `mode` and on the categories: the short card of an archive
 * document (LIGHT_CARD_SCHEMA, LIGHT_INDEXING_INSTRUCTIONS, `light: true`), the schema of one request
 * (categoriesProperty, categoriesInstruction, schemaFor) and the choice of categories from the admins' list
 * (`foldText`, `pickCategories`, `categoryUpdate`, DEFAULT_DOCUMENT_CATEGORIES: src/features/documents/
 * textMatch.js and categories.js, which functions/scripts/archive-categories.test.mjs runs next to these).
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

// the short card of an archive document: found and handed over, never read to answer. Copied from src/features/documents/indexing.js
export const LIGHT_CARD_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: "1-2 frasi: cos'è il file e a cosa serve, per chi deve ritrovarlo."
    },
    banks: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Istituti o banche a cui il file si riferisce, solo se evidenti, col nome per esteso. Altrimenti array vuoto.'
    },
    products: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Prodotti a cui il file si riferisce (mutuo, cessione del quinto...), solo se evidenti. Altrimenti array vuoto.'
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Da 5 a 10 termini, sigle e sinonimi con cui un operatore cercherebbe questo file.'
    }
  },
  required: ['summary', 'keywords']
};

// not editable by the admin, unlike the instructions of the full card: it is what makes the card short
export const LIGHT_INDEXING_INSTRUCTIONS = `Sei il bibliotecario di una società di mediazione creditizia.
Ti do UN file che non va studiato ma solo ritrovato e consegnato: un modulo, un contratto, un logo, una locandina. Scrivi la sua scheda BREVE per il motore di ricerca interno.
"summary": 1 o 2 frasi che dicono cos'è il file e a cosa serve, per esempio «Modulo privacy per richiesta mutuo, da far firmare al cliente».
"keywords": da 5 a 10 termini, sigle e sinonimi con cui un operatore lo cercherebbe (tipo di file, prodotto, istituto, uso).
"banks" e "products": solo se evidenti dal file, altrimenti array vuoti.
Usa solo quello che c'è nel file, non inventare. Scrivi in italiano.
Rispondi esclusivamente con JSON conforme allo schema.`;

// the categories property of the answer: names of the admins' list only
export const categoriesProperty = categories => ({
  type: 'array',
  items: { type: 'string', enum: categories },
  description: 'Da 1 a 3 categorie, scelte SOLO fra quelle indicate. Array vuoto se nessuna si adatta.'
});

// said in the prompt too, so the list is read even if the schema's enum is not
export const categoriesInstruction = categories =>
  categories.length
    ? `Categorie: scegli da 1 a 3 categorie per questo documento, SOLO fra queste: ${categories.join('; ')}. ` +
      "Se nessuna si adatta, lascia l'elenco vuoto. Non inventare categorie nuove."
    : null;

// the schema of one request: the card of the document's mode, with `categories` when there is a list to choose from
export const schemaFor = (mode, categories) => {
  const base = mode === 'archive' ? LIGHT_CARD_SCHEMA : INDEX_CARD_SCHEMA;
  if (!categories.length) return base;
  return {
    ...base,
    properties: { ...base.properties, categories: categoriesProperty(categories) },
    required: [...base.required, 'categories']
  };
};

const isArchive = document => document?.mode === 'archive';

// textMatch.js foldText
export const foldText = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// categories.js DEFAULT_DOCUMENT_CATEGORIES
export const DEFAULT_DOCUMENT_CATEGORIES = [
  'Mutuo',
  'Cessione del quinto',
  'Prestito',
  'Policy banca',
  'Modulistica',
  'Contratti',
  'Procedure interne',
  'Marketing'
];

// categories.js MAX_CATEGORIES_PER_DOCUMENT
const MAX_CATEGORIES_PER_DOCUMENT = 3;

/** What the model proposed, reduced to the admins' list: only its names, spelled as there, each once, at most `max`. */
export function pickCategories(proposed, allowed, max = MAX_CATEGORIES_PER_DOCUMENT) {
  const byKey = new Map();
  for (const name of Array.isArray(allowed) ? allowed : []) {
    if (!byKey.has(foldText(name))) byKey.set(foldText(name), name);
  }
  const picked = [];
  for (const raw of Array.isArray(proposed) ? proposed : []) {
    const name = byKey.get(foldText(raw));
    if (name && !picked.includes(name)) picked.push(name);
    if (picked.length >= max) break;
  }
  return picked;
}

/**
 * What indexing writes about categories on a document: nothing when an admin set them by hand (`manual`) or
 * there is no list, otherwise the model's pick, limited to the list.
 */
export function categoryUpdate({ proposed, allowed, manual }) {
  if (manual === true || !allowed?.length) return {};
  return { categories: pickCategories(proposed, allowed) };
}

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
 * `categories` is the admins' list; an empty list is their choice, only a missing field takes the seed list.
 */
export function indexingSettings(stored = {}) {
  return {
    modelId: (stored.indexingModel ?? DEFAULT_INDEXING_MODEL) || (stored.chatModel ?? DEFAULT_CHAT_MODEL),
    instructions: stored.indexingInstructions ?? DEFAULT_INDEXING_INSTRUCTIONS,
    attachments: Array.isArray(stored.indexingAttachments) ? stored.indexingAttachments : [],
    categories: Array.isArray(stored.documentCategories)
      ? stored.documentCategories.filter(name => typeof name === 'string' && name.trim())
      : DEFAULT_DOCUMENT_CATEGORIES
  };
}

// the admin edits the instructions in the panel; what is appended here cannot be lost: the file name and
// what the admin wrote about it. An archive document gets the short instructions instead of the admin's, and
// none of the attached guides (written for the full card); the categories of the list come last.
export const indexingPrompt = (instructions, attachments, document, categories = []) =>
  [
    isArchive(document) ? LIGHT_INDEXING_INSTRUCTIONS : instructions || DEFAULT_INDEXING_INSTRUCTIONS,
    isArchive(document) ? null : attachmentsBlock(attachments),
    `Il documento si chiama "${document.name}".`,
    document.description?.trim() &&
      `Chi l'ha caricato lo descrive così: «${document.description.trim()}». È la fonte più affidabile su cosa sia ` +
        'e a cosa serva: la scheda deve essere coerente con questa descrizione e riprenderne i termini.',
    categoriesInstruction(categories)
  ]
    .filter(Boolean)
    .join('\n');

const uniqueStrings = list => [
  ...new Set((Array.isArray(list) ? list : []).map(v => String(v).trim()).filter(Boolean))
];

/** Gemini's JSON answer as the card the archive stores; the short card of an archive document is marked `light`. */
export const cardFromAnswer = (card, mode) => ({
  summary: String(card.summary || '').trim(),
  banks: uniqueStrings(card.banks),
  products: uniqueStrings(card.products),
  topics: uniqueStrings(card.topics),
  keywords: uniqueStrings(card.keywords),
  ...(mode === 'archive' ? { light: true } : {})
});
