/**
 * Indexes a Drive document on the server: Gemini on Vertex AI reads the PDF from Storage through its
 * gs:// URI and answers with the index card — the same call src/features/documents/indexing.js makes
 * from the browser through Firebase AI Logic (same model setting, instructions, attachments, schema
 * and prompt: see indexCard.js), and the same fields written on the document.
 *
 * What is written depends on the document's `mode` and categories, as in the browser: an archive document gets a
 * short card (indexCard.js), and 1–3 categories of the admins' list are asked for unless an admin set them by
 * hand (`categoriesManual`). Both are read from the document right before the call, so a change made while
 * the sync was running counts.
 *
 * Location is "global", as in the browser (src/shared/firebase/ai.js): Gemini 3.x on Vertex is only
 * served from there. The calls are made as the functions' runtime service account, which needs
 * "Vertex AI User" (DEPLOY.md).
 */
import { GoogleGenAI } from '@google/genai';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { appRoot } from '../appContext.js';
import { INDEXING_STATUS, documentRef } from './archive.js';
import { cardFromAnswer, categoryUpdate, indexingPrompt, indexingSettings, schemaFor } from './indexCard.js';
import { PDF_MIME_TYPE } from './driveClient.js';
import { withRetry } from './retry.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'mappa-contatti-217007';
const LOCATION = 'global';

let client = null;
const gemini = () =>
  (client ??= new GoogleGenAI({ vertexai: true, project: PROJECT_ID, location: LOCATION }));

/** The indexing settings the admin saved (read once per run, so a change applies from the next one). */
export async function loadIndexingSettings() {
  const snapshot = await getFirestore().doc(`${appRoot()}/config/settings`).get();
  return indexingSettings(snapshot.exists ? snapshot.data() : {});
}

async function generateIndexCard(document, settings, signal) {
  const bucket = getStorage().bucket();
  const fileUri = `gs://${bucket.name}/${document.storagePath}`;
  const mode = document.mode === 'archive' ? 'archive' : 'studied';
  // a document whose categories an admin set by hand is not asked for them: they would be thrown away
  const categories = document.categoriesManual === true ? [] : settings.categories;
  const response = await withRetry(
    () =>
      gemini().models.generateContent({
        model: settings.modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: indexingPrompt(settings.instructions, settings.attachments, document, categories) },
              { fileData: { mimeType: PDF_MIME_TYPE, fileUri } }
            ]
          }
        ],
        // no maxOutputTokens, as in the browser: the model's own ceiling applies, a long card is not cut
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: schemaFor(mode, categories),
          abortSignal: signal
        }
      }),
    { signal }
  );
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Risposta troncata dal limite di token.');
  }
  let card;
  try {
    card = JSON.parse(response.text);
  } catch {
    throw new Error('La risposta del modello non era JSON valido.');
  }
  return {
    indexCard: cardFromAnswer(card, mode),
    // what the model proposed and the list it chose from: `categoryUpdate` reduces one to the other
    proposedCategories: card.categories,
    allowedCategories: categories
  };
}

/**
 * Writes the card on the document and marks it done. A failure is written on the document too (it then
 * shows in "Con errore", where the browser can retry it) and thrown, so the sync can count it.
 * `document` needs `{ id, name, description?, storagePath }`; its `mode`, `categoriesManual` and
 * `description` are read again from the stored document, which is where an admin changes them.
 */
export async function indexDocument(document, settings, signal) {
  const ref = documentRef(document.id);
  try {
    const current = await ref.get();
    const stored = current.exists ? current.data() : {};
    const fresh = {
      ...document,
      description: stored.description ?? document.description,
      mode: stored.mode ?? document.mode,
      categoriesManual: stored.categoriesManual ?? document.categoriesManual
    };
    const { indexCard, proposedCategories, allowedCategories } = await generateIndexCard(
      fresh,
      settings,
      signal
    );
    await ref.update({
      indexCard,
      ...categoryUpdate({
        proposed: proposedCategories,
        allowed: allowedCategories,
        manual: fresh.categoriesManual
      }),
      indexedWithModel: settings.modelId,
      indexingStatus: INDEXING_STATUS.done,
      error: null,
      indexedAt: FieldValue.serverTimestamp(),
      driveIndexFailedAt: null
    });
  } catch (error) {
    // out of time is not a failure of the document: it stays as it is and the next run picks it up
    if (!signal?.aborted) {
      const message = String(error?.message || error).slice(0, 300);
      await ref
        .update({
          indexingStatus: INDEXING_STATUS.failed,
          error: message,
          driveIndexFailedAt: FieldValue.serverTimestamp()
        })
        .catch(() => {});
    }
    throw error;
  }
}
