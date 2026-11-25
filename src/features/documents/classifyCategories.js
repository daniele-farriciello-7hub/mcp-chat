/**
 * "Classifica tutti": gives categories to documents that are already indexed and have none, without
 * indexing them again. One short call per document, from what the card already says (no file is read), with
 * the indexing model, asking only for 1–3 names of the admins' list. Only `categories` is written
 * (`setDocumentCategoriesFromAi`): never the card, never `categoriesManual`.
 *
 * It runs in the browser for uploaded and Drive documents alike. That is the whole point of doing it here:
 * the Drive sync writes only the fields it names, so a browser write of `categories` is safe on a Drive
 * document too, and no new server action is needed. A document an admin corrected by hand is never touched
 * (checked again on the stored document right before the write).
 */
'use client';

import { getDoc } from 'firebase/firestore';
import { getModel } from '@/shared/firebase/ai';
import { withRetry } from '@/shared/retry';
import { getSettings } from '@/features/settings/settingsStore';
import { setDocumentCategoriesFromAi } from './documentStore';
import { INDEXING_STATUS, documentRef } from './schema';
import { categoriesInstruction, categoriesProperty } from './indexing';
import { lacksCategories, needsClassifying } from './categories';

const CONCURRENCY = 3;

const joined = (label, list) => (list?.length ? ` ${label}: ${list.join(', ')}.` : '');

/** What the model is asked: the list, the name, what the admin wrote, and the card. */
export const classificationPrompt = (document, categories) =>
  [
    'Sei il bibliotecario di una società di mediazione creditizia. Ti do la scheda di un documento già indicizzato.',
    categoriesInstruction(categories),
    `Il documento si chiama "${document.name}".`,
    document.description?.trim() && `Chi l'ha caricato lo descrive così: «${document.description.trim()}».`,
    `Scheda: ${document.indexCard?.summary || '(vuota)'}` +
      joined('Istituti', document.indexCard?.banks) +
      joined('Prodotti', document.indexCard?.products) +
      joined('Argomenti', document.indexCard?.topics) +
      joined('Parole chiave', document.indexCard?.keywords),
    'Rispondi esclusivamente con JSON conforme allo schema.'
  ]
    .filter(Boolean)
    .join('\n');

/** The categories the model proposes for one document (not yet reduced to the list). */
async function proposeCategories(document, categories, modelId) {
  const model = getModel({
    model: modelId,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { categories: categoriesProperty(categories) },
        required: ['categories']
      }
    }
  });
  const result = await withRetry(() => model.generateContent(classificationPrompt(document, categories)));
  if (result.response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Risposta troncata dal limite di token.');
  }
  return JSON.parse(result.response.text()).categories;
}

/** Documents that "Classifica" would work on, from a list. */
export const documentsToClassify = (documents, categories) =>
  documents.filter(document => needsClassifying(document, categories));

/**
 * Classifies the documents that need it, a few at a time. `onProgress({ done, total, failed, classified })`
 * follows it; `shouldStop()` is asked before each document, so a stop leaves the finished ones as they are.
 * Resolves to the same counts. A document that fails is counted and the rest go on.
 */
export async function classifyDocuments(documents, { onProgress = () => {}, shouldStop = () => false } = {}) {
  const { indexingModel, chatModel, documentCategories } = await getSettings({ refresh: true });
  if (!documentCategories.length) throw new Error('Aggiungi almeno una categoria all’elenco.');
  const modelId = indexingModel || chatModel;

  const queue = documentsToClassify(documents, documentCategories);
  const progress = { done: 0, total: queue.length, failed: 0, classified: 0 };
  onProgress({ ...progress });

  const work = async () => {
    while (queue.length && !shouldStop()) {
      const document = queue.shift();
      try {
        // what is stored now counts: an admin may have set the categories since the list was drawn
        const current = await getDoc(documentRef(document.id));
        const stored = current.exists() ? { id: document.id, ...current.data() } : null;
        if (
          stored &&
          stored.indexingStatus === INDEXING_STATUS.done &&
          stored.categoriesManual !== true &&
          lacksCategories(stored, documentCategories)
        ) {
          const proposed = await proposeCategories(stored, documentCategories, modelId);
          await setDocumentCategoriesFromAi(stored.id, proposed, documentCategories);
          progress.classified++;
        }
      } catch (error) {
        console.warn('[categories] classifying failed:', document.id, error?.message || error);
        progress.failed++;
      }
      progress.done++;
      onProgress({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  return progress;
}
