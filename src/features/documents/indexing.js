/**
 * Indexing runs in the browser, as in instant-rating: Gemini reads the file from Storage through a
 * gs:// URI and returns an index card (summary, topics, keywords) that the chat uses to decide
 * which documents to open.
 *
 * Documents synchronised from Google Drive are indexed on the server instead, with a copy of
 * INDEX_CARD_SCHEMA, of the prompt below and of the indexing defaults: functions/src/drive/indexCard.js.
 * KEEP THEM IDENTICAL — change one, change the other (functions/scripts/drive-sync.test.mjs fails if
 * the schema, the default instructions or the prompt sentences drift apart). The same goes for the short
 * card of an archive document (LIGHT_CARD_SCHEMA, LIGHT_INDEXING_INSTRUCTIONS) and for the categories
 * (categoriesProperty, categoriesInstruction, schemaFor).
 *
 * What is written depends on the document's `mode` (archiveMode.js): a studied document gets the full card
 * and the admin's indexing instructions; an archive one a short card (a summary of one or two sentences,
 * keywords, institutes and products only when obvious, marked `light: true`) and a dedicated short prompt.
 * Both are asked for 1–3 categories from the admins' list, unless an admin already set them by hand
 * (`categoriesManual`): then they are neither asked for nor written (categories.js).
 */
'use client';

import { getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getModel } from '@/shared/firebase/ai';
import { withRetry } from '@/shared/retry';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { getSettings } from '@/features/settings/settingsStore';
import { attachmentsBlock } from '@/shared/promptAttachments';
import { INDEXING_STATUS, documentRef } from './schema';
import { getIndexingBlocker } from './indexability';
import { geminiMimeTypeOf, isImage } from './fileTypes';
import { gcsUri } from './chatCatalog';
import { isArchive } from './archiveMode';
import { categoryUpdate } from './categories';

// copied in functions/src/drive/indexCard.js
const INDEX_CARD_SCHEMA = {
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

// the short card of an archive document: found and handed over, never read to answer. Copied in functions/src/drive/indexCard.js
const LIGHT_CARD_SCHEMA = {
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
// (copied in functions/src/drive/indexCard.js)
const LIGHT_INDEXING_INSTRUCTIONS = `Sei il bibliotecario di una società di mediazione creditizia.
Ti do UN file che non va studiato ma solo ritrovato e consegnato: un modulo, un contratto, un logo, una locandina. Scrivi la sua scheda BREVE per il motore di ricerca interno.
"summary": 1 o 2 frasi che dicono cos'è il file e a cosa serve, per esempio «Modulo privacy per richiesta mutuo, da far firmare al cliente».
"keywords": da 5 a 10 termini, sigle e sinonimi con cui un operatore lo cercherebbe (tipo di file, prodotto, istituto, uso).
"banks" e "products": solo se evidenti dal file, altrimenti array vuoti.
Usa solo quello che c'è nel file, non inventare. Scrivi in italiano.
Rispondi esclusivamente con JSON conforme allo schema.`;

// the categories property of the answer: names of the admins' list only (copied in functions/src/drive/indexCard.js)
export const categoriesProperty = categories => ({
  type: 'array',
  items: { type: 'string', enum: categories },
  description: 'Da 1 a 3 categorie, scelte SOLO fra quelle indicate. Array vuoto se nessuna si adatta.'
});

// said in the prompt too, so the list is read even if the schema's enum is not (copied in functions/src/drive/indexCard.js)
export const categoriesInstruction = categories =>
  categories.length
    ? `Categorie: scegli da 1 a 3 categorie per questo documento, SOLO fra queste: ${categories.join('; ')}. ` +
      "Se nessuna si adatta, lascia l'elenco vuoto. Non inventare categorie nuove."
    : null;

// the schema of one request: the card of the document's mode, with `categories` when there is a list to choose from
// (copied in functions/src/drive/indexCard.js)
const schemaFor = (mode, categories) => {
  const base = mode === 'archive' ? LIGHT_CARD_SCHEMA : INDEX_CARD_SCHEMA;
  if (!categories.length) return base;
  return {
    ...base,
    properties: { ...base.properties, categories: categoriesProperty(categories) },
    required: [...base.required, 'categories']
  };
};

// What the card should say about an image: people ask for "il logo di X", so the card has to say whose
// logo it is and which version, not just describe the picture.
const IMAGE_CARD_HINT =
  'Il file è un\'immagine (logo, foto, banner, schema...). Nella scheda: "summary" dice cosa raffigura e ' +
  'a cosa serve, in modo che chi cerca "il logo di X" la trovi; "keywords" include il nome del soggetto o ' +
  'del marchio, la versione (a colori, bianco, nero, sfondo trasparente, orizzontale, verticale), i colori ' +
  'principali e ogni scritta leggibile. "banks" e "products" restano vuoti se l\'immagine non riguarda un ' +
  'istituto o un prodotto.';

// the admin edits the instructions in the panel; what is appended here cannot be lost: the file name,
// what the admin wrote about it, and what to do with a file Gemini cannot look at
// (the PDF part of this is copied in functions/src/drive/indexCard.js: keep them identical)
const indexingPrompt = (instructions, attachments, document, canSeeFile, categories = []) =>
  [
    isArchive(document) ? LIGHT_INDEXING_INSTRUCTIONS : instructions || DEFAULT_SETTINGS.indexingInstructions,
    // the guides are written for the full card: the short one does not carry them
    isArchive(document) ? null : attachmentsBlock(attachments),
    `Il documento si chiama "${document.name}".`,
    isImage(document.mimeType) && IMAGE_CARD_HINT,
    document.mimeType === 'image/svg+xml' &&
      "L'immagine ti arriva come codice SVG: ricava cosa raffigura da testi, colori e forme.",
    document.description?.trim() &&
      `Chi l'ha caricato lo descrive così: «${document.description.trim()}». È la fonte più affidabile su cosa sia ` +
        'e a cosa serva: la scheda deve essere coerente con questa descrizione e riprenderne i termini.',
    !canSeeFile &&
      'Non puoi vedere questo file: scrivi la scheda solo dal nome e dalla descrizione, senza inventare quello che non sai.',
    categoriesInstruction(categories)
  ]
    .filter(Boolean)
    .join('\n');

const uniqueStrings = list => [
  ...new Set((Array.isArray(list) ? list : []).map(v => String(v).trim()).filter(Boolean))
];

async function generateIndexCard(document) {
  const { indexingModel, chatModel, indexingInstructions, indexingAttachments, documentCategories } =
    await getSettings({ refresh: true });
  const modelId = indexingModel || chatModel;
  const archive = isArchive(document);
  // a document whose categories an admin set by hand is not asked for them: they would be thrown away
  const categories = document.categoriesManual === true ? [] : documentCategories;
  // no maxOutputTokens: the model's own ceiling applies, so a long card is not truncated
  const model = getModel({
    model: modelId,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: schemaFor(archive ? 'archive' : 'studied', categories)
    }
  });
  // null for a GIF: there is no file to give Gemini, the card comes from name and description only
  const fileMimeType = geminiMimeTypeOf(document);
  const parts = [
    {
      text: indexingPrompt(
        indexingInstructions,
        indexingAttachments,
        document,
        Boolean(fileMimeType),
        categories
      )
    },
    ...(fileMimeType ? [{ fileData: { mimeType: fileMimeType, fileUri: gcsUri(document.storagePath) } }] : [])
  ];
  // Gemini answers 503 when overloaded: retried with backoff instead of failing the document
  const result = await withRetry(() => model.generateContent(parts));
  if (result.response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Risposta troncata dal limite di token.');
  }
  let card;
  try {
    card = JSON.parse(result.response.text());
  } catch {
    throw new Error('La risposta del modello non era JSON valido.');
  }
  return {
    modelId,
    indexCard: {
      summary: String(card.summary || '').trim(),
      banks: uniqueStrings(card.banks),
      products: uniqueStrings(card.products),
      topics: uniqueStrings(card.topics),
      keywords: uniqueStrings(card.keywords),
      ...(archive ? { light: true } : {})
    },
    // what the model proposed and the list it chose from: `categoryUpdate` reduces one to the other
    proposedCategories: card.categories,
    allowedCategories: categories
  };
}

/** Indexes one document and writes the outcome on it, failures included. */
export async function indexDocument(document, onPhase = () => {}) {
  const docRef = documentRef(document.id);
  try {
    const blocker = getIndexingBlocker(document);
    if (blocker) throw new Error(`${blocker.label}: ${blocker.reason}`);
    onPhase('reading');
    // the admin may have edited the description while the document waited in the queue, and an image
    // never gets a card without one: what is saved now is what counts, not what the caller held
    const current = await getDoc(docRef);
    // same for the mode and the categories: switched on the row, or corrected by hand, while it waited
    const fresh = {
      ...document,
      description: current.exists() ? current.data().description : document.description,
      mode: current.exists() ? current.data().mode : document.mode,
      categoriesManual: current.exists() ? current.data().categoriesManual : document.categoriesManual
    };
    const freshBlocker = getIndexingBlocker(fresh);
    if (freshBlocker) throw new Error(`${freshBlocker.label}: ${freshBlocker.reason}`);
    const { modelId, indexCard, proposedCategories, allowedCategories } = await generateIndexCard(fresh);
    await updateDoc(docRef, {
      indexCard,
      ...categoryUpdate({
        proposed: proposedCategories,
        allowed: allowedCategories,
        manual: fresh.categoriesManual
      }),
      indexedWithModel: modelId,
      indexingStatus: INDEXING_STATUS.done,
      error: null,
      indexedAt: serverTimestamp()
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 300);
    await updateDoc(docRef, { indexingStatus: INDEXING_STATUS.failed, error: message }).catch(() => {});
    throw error;
  }
}
