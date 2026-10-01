/**
 * The archive as the chat assistant sees it: a compact list of indexed documents (id, name, index
 * card) sent with every message, and the file of a single document when the model asks to read it.
 */
'use client';

import { getDoc, getDocs } from 'firebase/firestore';
import { ref } from 'firebase/storage';
import { storage } from '@/shared/firebase/app';
import { INDEXING_STATUS, documentRef, documentsCollection } from './schema';

const CACHE_TTL_MS = 60_000;

let cache = null; // { loadedAt, entries }

/** Called whenever an index card is added, changed or removed, so the chat sees it immediately. */
export function invalidateChatCatalog() {
  cache = null;
}

export const gcsUri = storagePath => {
  const fileRef = ref(storage, storagePath);
  return `gs://${fileRef.bucket}/${fileRef.fullPath}`;
};

export async function getChatCatalog() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;
  const snapshot = await getDocs(documentsCollection());
  const entries = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.indexingStatus === INDEXING_STATUS.done && d.indexCard)
    .map(d => ({ id: d.id, name: d.name, ...d.indexCard }));
  cache = { loadedAt: Date.now(), entries };
  return entries;
}

/** A document ready to hand to Gemini as fileData, or null if missing, not indexed or without bytes. */
export async function getDocumentForReading(id) {
  const snapshot = await getDoc(documentRef(id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data.indexingStatus !== INDEXING_STATUS.done || !data.storagePath) return null;
  return {
    id,
    name: data.name,
    mimeType: data.indexMimeType || 'application/pdf',
    fileUri: gcsUri(data.storagePath)
  };
}
