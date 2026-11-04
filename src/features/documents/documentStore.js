/**
 * Reads and writes the document archive: files uploaded by an admin from their computer.
 */
'use client';

import {
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@/shared/firebase/app';
import { INDEXING_STATUS, documentRef, documentsCollection, storageFolder } from './schema';
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
 */
export async function uploadDocument(file, { replace = false } = {}) {
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

/** Removes a document from the catalog: its Firestore entry and its Storage copy. */
export async function deleteDocument(document) {
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
