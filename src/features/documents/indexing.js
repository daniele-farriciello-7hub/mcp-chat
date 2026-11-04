/**
 * Indexing runs in the browser, as in instant-rating: Gemini reads the file from Storage through a
 * gs:// URI and returns an index card (summary, topics, keywords) that the chat uses to decide
 * which documents to open.
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
const indexingPrompt = (instructions, attachments, document, canSeeFile) =>
  [
    instructions || DEFAULT_SETTINGS.indexingInstructions,
    attachmentsBlock(attachments),
    `Il documento si chiama "${document.name}".`,
    isImage(document.mimeType) && IMAGE_CARD_HINT,
    document.mimeType === 'image/svg+xml' &&
      "L'immagine ti arriva come codice SVG: ricava cosa raffigura da testi, colori e forme.",
    document.description?.trim() &&
      `Chi l'ha caricato lo descrive così: «${document.description.trim()}». È la fonte più affidabile su cosa sia ` +
        'e a cosa serva: la scheda deve essere coerente con questa descrizione e riprenderne i termini.',
    !canSeeFile &&
      'Non puoi vedere questo file: scrivi la scheda solo dal nome e dalla descrizione, senza inventare quello che non sai.'
  ]
    .filter(Boolean)
    .join('\n');

const uniqueStrings = list => [
  ...new Set((Array.isArray(list) ? list : []).map(v => String(v).trim()).filter(Boolean))
];

async function generateIndexCard(document) {
  const { indexingModel, chatModel, indexingInstructions, indexingAttachments } = await getSettings({
    refresh: true
  });
  const modelId = indexingModel || chatModel;
  // no maxOutputTokens: the model's own ceiling applies, so a long card is not truncated
  const model = getModel({
    model: modelId,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: INDEX_CARD_SCHEMA
    }
  });
  // null for a GIF: there is no file to give Gemini, the card comes from name and description only
  const fileMimeType = geminiMimeTypeOf(document);
  const parts = [
    { text: indexingPrompt(indexingInstructions, indexingAttachments, document, Boolean(fileMimeType)) },
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
    summary: String(card.summary || '').trim(),
    banks: uniqueStrings(card.banks),
    products: uniqueStrings(card.products),
    topics: uniqueStrings(card.topics),
    keywords: uniqueStrings(card.keywords)
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
    const fresh = {
      ...document,
      description: current.exists() ? current.data().description : document.description
    };
    const freshBlocker = getIndexingBlocker(fresh);
    if (freshBlocker) throw new Error(`${freshBlocker.label}: ${freshBlocker.reason}`);
    const { modelId, ...indexCard } = await generateIndexCard(fresh);
    await updateDoc(docRef, {
      indexCard,
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
