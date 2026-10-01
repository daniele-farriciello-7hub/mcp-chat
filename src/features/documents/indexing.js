/**
 * Indexing runs in the browser, as in instant-rating: Gemini reads the file from Storage through a
 * gs:// URI and returns an index card (summary, topics, keywords) that the chat uses to decide
 * which documents to open.
 */
'use client';

import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { getModel } from '@/shared/firebase/ai';
import { withRetry } from '@/shared/retry';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { getSettings } from '@/features/settings/settingsStore';
import { attachmentsBlock } from '@/shared/promptAttachments';
import { INDEXING_STATUS, documentRef } from './schema';
import { getIndexingBlocker } from './indexability';
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

// the admin edits the instructions in the panel; the file name is appended here so it cannot be lost
const indexingPrompt = (instructions, attachments, name) =>
  [
    instructions || DEFAULT_SETTINGS.indexingInstructions,
    attachmentsBlock(attachments),
    `Il documento si chiama "${name}".`
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
  // Gemini answers 503 when overloaded: retried with backoff instead of failing the document
  const result = await withRetry(() =>
    model.generateContent([
      { text: indexingPrompt(indexingInstructions, indexingAttachments, document.name) },
      {
        fileData: {
          mimeType: document.indexMimeType || 'application/pdf',
          fileUri: gcsUri(document.storagePath)
        }
      }
    ])
  );
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
    const { modelId, ...indexCard } = await generateIndexCard(document);
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
