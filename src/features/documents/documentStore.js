/**
 * Reads and writes the document archive: files uploaded by an admin from their computer.
 */
'use client';

import { deleteDoc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@/shared/firebase/app';
import { INDEXING_STATUS, documentRef, documentsCollection, storageFolder } from './schema';
import { INDEXABLE_MIME_TYPES, MAX_FILE_SIZE_BYTES, safeFileName } from './fileTypes';
import { canIndexNow, nameKey } from './indexability';
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
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.md') ? 'text/markdown' : '');
  if (!INDEXABLE_MIME_TYPES.has(mimeType) || mimeType.startsWith('application/vnd.google-apps')) {
    throw new Error('Formato non supportato: carica PDF, TXT, CSV o Markdown.');
  }

  // Names are unique. A same-name copy that cannot be indexed anyway does not count: uploading the
  // file is exactly how it gets indexed.
  const catalog = await getDocs(documentsCollection());
  const existing = catalog.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(d => nameKey(d) === nameKey(file) && (d.indexingStatus === INDEXING_STATUS.done || canIndexNow(d)));
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
    indexMimeType: mimeType === 'application/pdf' ? mimeType : 'text/plain',
    sizeBytes: file.size,
    storagePath,
    indexingStatus: INDEXING_STATUS.pending,
    indexCard: null,
    indexedAt: null,
    indexedWithModel: null,
    error: null,
    createdAt: serverTimestamp(),
    uploadedBy: currentUserEmail()
  });
  if (existing) invalidateChatCatalog();
  return id;
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
