/**
 * The archive as the chat assistant sees it: a compact list of indexed documents (id, name, type,
 * the admin's description of an image, index card, mode, categories) and the file of a single document
 * when the model asks to read it.
 *
 * The list holds EVERY indexed document, whatever its mode: the chat splits it (archiveMode.js
 * `splitByMode`). Studied documents go in the system prompt of every turn (chat/systemPrompt.js); archive
 * ones never do, they are found with `search_archive` over this same list, and `share_file` / `offer_files`
 * accept the ids of both. `categories` here are only those still in the admins' list.
 */
'use client';

import { getDoc, getDocs } from 'firebase/firestore';
import { ref } from 'firebase/storage';
import { storage } from '@/shared/firebase/app';
import { getSettings } from '@/features/settings/settingsStore';
import { INDEXING_STATUS, documentRef, documentsCollection } from './schema';
import { geminiMimeTypeOf } from './fileTypes';
import { isArchive, modeOf } from './archiveMode';
import { visibleCategories } from './categories';

const CACHE_TTL_MS = 60_000;

let cache = null; // { loadedAt, entries }

/** Called whenever an index card or a description is added, changed or removed, so the chat sees it immediately. */
export function invalidateChatCatalog() {
  cache = null;
}

export const gcsUri = storagePath => {
  const fileRef = ref(storage, storagePath);
  return `gs://${fileRef.bucket}/${fileRef.fullPath}`;
};

export async function getChatCatalog() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;
  const [snapshot, { documentCategories }] = await Promise.all([
    getDocs(documentsCollection()),
    getSettings()
  ]);
  const entries = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.indexingStatus === INDEXING_STATUS.done && d.indexCard)
    .map(d => ({
      id: d.id,
      name: d.name,
      mimeType: d.mimeType,
      description: d.description || '',
      ...d.indexCard,
      mode: modeOf(d),
      categories: visibleCategories(d.categories, documentCategories)
    }));
  cache = { loadedAt: Date.now(), entries };
  return entries;
}

/**
 * A document ready to hand to Gemini as fileData, or null if missing, not indexed or without bytes.
 * `fileUri` is null for a file Gemini cannot look at (a GIF): the model has only the card for it.
 * An archive document is never handed over: `{ id, name, archiveOnly: true }`, whatever the cached catalog
 * said, since this is read from the document itself.
 */
export async function getDocumentForReading(id) {
  const snapshot = await getDoc(documentRef(id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (isArchive(data)) return { id, name: data.name, archiveOnly: true };
  if (data.indexingStatus !== INDEXING_STATUS.done || !data.storagePath) return null;
  return {
    id,
    name: data.name,
    mimeType: geminiMimeTypeOf(data),
    fileUri: geminiMimeTypeOf(data) ? gcsUri(data.storagePath) : null
  };
}
