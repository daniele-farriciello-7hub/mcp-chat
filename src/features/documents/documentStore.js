/**
 * Reads and writes the document archive: files uploaded by an admin from their computer. Documents
 * with `source: 'drive'` are kept by the Drive sync on the server: the browser neither replaces nor
 * deletes them, since the next sync would undo it.
 */
'use client';

import {
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '@/shared/firebase/app';
import { INDEXING_STATUS, documentRef, documentsCollection, storageFolder } from './schema';
import { DOCUMENT_MODE } from './archiveMode';
import { pickCategories } from './categories';
import { foldText } from './textMatch';
import {
  INDEXABLE_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  indexMimeTypeFor,
  mimeTypeOf,
  safeFileName
} from './fileTypes';
import { getFileBlocker, nameKey } from './indexability';
import { invalidateChatCatalog } from './chatCatalog';

const currentUserEmail = () => auth.currentUser?.email || null;

// ── live reads ───────────────────────────────────────────────────────────────

export function listenToDocuments(onData, onError) {
  return onSnapshot(
    documentsCollection(),
    snapshot => onData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  );
}

// ── uploads ──────────────────────────────────────────────────────────────────

/** Thrown when a document with the same name is already there; `replace: true` overwrites it. */
export class DuplicateNameError extends Error {
  constructor(existingId) {
    super('Esiste già un documento con questo nome.');
    this.name = 'DuplicateNameError';
    this.code = 'duplicate-name';
    this.existingId = existingId;
  }
}

/**
 * Uploads a file. With `replace`, an existing document with the same name is overwritten: same
 * entry, new bytes, and its index card is dropped so it gets indexed again — otherwise the chat
 * would keep answering from the old version's summary.
 *
 * `mode` is how the assistant will use it (archiveMode.js): studied unless said otherwise. A replaced
 * document keeps the mode it had, unless one is given, and its categories (an admin's own too).
 */
export async function uploadDocument(file, { replace = false, mode } = {}) {
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('Supera i 20 MB.');
  const mimeType = mimeTypeOf(file);
  if (!INDEXABLE_MIME_TYPES.has(mimeType) || mimeType.startsWith('application/vnd.google-apps')) {
    throw new Error(
      'Formato non supportato: carica PDF, TXT, CSV, Markdown o un’immagine (PNG, JPG, WebP, GIF, SVG).'
    );
  }

  // Names are unique. A same-name copy whose file cannot be indexed anyway does not count: uploading
  // the file is exactly how it gets indexed. (A missing description does not make it a different copy.)
  const catalog = await getDocs(documentsCollection());
  const existing = catalog.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(
      d => nameKey(d) === nameKey(file) && (d.indexingStatus === INDEXING_STATUS.done || !getFileBlocker(d))
    );
  if (existing?.source === 'drive') {
    throw new Error(
      'Esiste già un documento con questo nome che arriva da Google Drive: non si sostituisce da qui.'
    );
  }
  if (existing && !replace) throw new DuplicateNameError(existing.id);

  const id = existing?.id ?? `upload-${crypto.randomUUID()}`;
  const storagePath = `${storageFolder(id)}/${safeFileName(file.name)}`;
  // the old bytes may sit under a different file name inside the same folder
  if (existing?.storagePath && existing.storagePath !== storagePath) {
    await deleteObject(ref(storage, existing.storagePath)).catch(error => {
      if (error?.code !== 'storage/object-not-found') throw error;
    });
  }
  await uploadBytes(ref(storage, storagePath), file, { contentType: mimeType });
  await setDoc(documentRef(id), {
    source: 'upload',
    name: file.name,
    mimeType,
    indexMimeType: indexMimeTypeFor(mimeType),
    sizeBytes: file.size,
    storagePath,
    indexingStatus: INDEXING_STATUS.pending,
    indexCard: null,
    indexedAt: null,
    indexedWithModel: null,
    error: null,
    // a replaced image is still the same logo: its description stays
    description: existing?.description ?? '',
    mode: mode ?? existing?.mode ?? DOCUMENT_MODE.studied,
    // a replaced file is the same document: its categories stay until indexing picks again (never over an admin's)
    categories: existing?.categories ?? [],
    categoriesManual: existing?.categoriesManual === true,
    createdAt: serverTimestamp(),
    uploadedBy: currentUserEmail()
  });
  if (existing) invalidateChatCatalog();
  return id;
}

/**
 * Saves what the admin wrote about a document (see `description` in schema.js). The chat reads it
 * straight from the document, so it only has to forget its cached catalog: no re-indexing needed.
 */
export async function updateDocumentDescription(id, description) {
  await updateDoc(documentRef(id), { description: description.trim() });
  invalidateChatCatalog();
}

/**
 * Sets the categories of a document by hand, from the admins' list: indexing leaves them alone from then on
 * (`categoriesManual`, categories.js). Works on Drive documents too: the sync never writes these fields.
 */
export async function setDocumentCategories(id, categories, allowed) {
  await updateDoc(documentRef(id), {
    categories: pickCategories(categories, allowed),
    categoriesManual: true
  });
  invalidateChatCatalog();
}

/** Gives the choice of categories back to indexing: the next one picks them again (`categoriesManual` off). */
export async function releaseDocumentCategories(id) {
  await updateDoc(documentRef(id), { categoriesManual: false });
}

/** Writes only `categories` of a document, as the model chose them: what "Classifica tutti" does. Never touches `categoriesManual`. */
export async function setDocumentCategoriesFromAi(id, categories, allowed) {
  await updateDoc(documentRef(id), { categories: pickCategories(categories, allowed) });
  invalidateChatCatalog();
}

const BATCH_SIZE = 400; // Firestore allows 500 writes per batch
// the bulk category action reports after every batch: small ones keep the progress moving
const CATEGORY_BATCH_SIZE = 100;

/**
 * Sets the categories of several documents by hand, in batches: what the "Categorie" bulk action of the indexed
 * list writes. `updates` is `[{ id, categories }]` (bulkCategories.js `planCategoryChange`, which keeps the names the
 * list no longer has); each document gets `categories` and `categoriesManual: true`, exactly as
 * `setDocumentCategories` writes one, so it works the same for uploaded and Drive documents.
 *
 * `onProgress({ done, total })` follows it. A batch is all or nothing: one that fails is logged and its documents are
 * counted as failed, and the next batches still go on. Resolves to `{ written, failed }`.
 */
export async function setCategoriesOnDocuments(updates, { onProgress = () => {} } = {}) {
  let written = 0;
  let failed = 0;
  for (let start = 0; start < updates.length; start += CATEGORY_BATCH_SIZE) {
    const chunk = updates.slice(start, start + CATEGORY_BATCH_SIZE);
    try {
      const batch = writeBatch(db);
      for (const { id, categories } of chunk) {
        batch.update(documentRef(id), { categories, categoriesManual: true });
      }
      await batch.commit();
      written += chunk.length;
    } catch (error) {
      console.error('[documents] saving the categories of a batch of documents failed:', error);
      failed += chunk.length;
    }
    onProgress({ done: written + failed, total: updates.length });
  }
  if (written) invalidateChatCatalog();
  return { written, failed };
}

/**
 * A category was renamed in the list: the documents that carry the old name get the new one (written as the
 * list spells it), so renaming does not make them lose it. `categoriesManual` is not touched. Resolves to how
 * many documents were updated.
 */
export async function renameCategoryOnDocuments(documents, from, to) {
  const key = foldText(from);
  const changes = [];
  for (const document of documents) {
    const own = Array.isArray(document.categories) ? document.categories : [];
    if (!own.some(name => foldText(name) === key)) continue;
    const renamed = [...new Set(own.map(name => (foldText(name) === key ? to : name)))];
    changes.push({ id: document.id, categories: renamed });
  }
  for (let start = 0; start < changes.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { id, categories } of changes.slice(start, start + BATCH_SIZE)) {
      batch.update(documentRef(id), { categories });
    }
    await batch.commit();
  }
  if (changes.length) invalidateChatCatalog();
  return changes.length;
}

/** Removes a document from the catalog: its Firestore entry and its Storage copy. Not one from Drive. */
export async function deleteDocument(document) {
  if (document.source === 'drive') {
    throw new Error('Il documento arriva da Google Drive: si toglie da Drive o scollegando la cartella.');
  }
  if (document.storagePath) {
    await deleteObject(ref(storage, document.storagePath)).catch(error => {
      if (error?.code !== 'storage/object-not-found') throw error;
    });
  }
  await deleteDoc(documentRef(document.id));
  invalidateChatCatalog();
}

/** Same, for a caller that only has the id (the chat activity rows). null if it no longer exists. */
export async function getDocumentUrlById(id) {
  const snapshot = await getDoc(documentRef(id));
  return snapshot.exists() ? getDocumentUrl({ id, ...snapshot.data() }) : null;
}

/** Where to download a document to check its content. */
export async function getDocumentUrl(document) {
  return document.storagePath ? getDownloadURL(ref(storage, document.storagePath)) : null;
}

/**
 * A document with its download URL, for showing it in the chat: the card is rebuilt from the id alone
 * when a conversation is restored. null if the document or its file no longer exists.
 */
export async function getDocumentFile(id) {
  const snapshot = await getDoc(documentRef(id));
  if (!snapshot.exists()) return null;
  const document = { id, ...snapshot.data() };
  const url = await getDocumentUrl(document).catch(error => {
    if (error?.code === 'storage/object-not-found') return null;
    throw error;
  });
  return url ? { ...document, url } : null;
}
