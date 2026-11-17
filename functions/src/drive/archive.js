/**
 * The document archive as the Drive sync writes it: Firestore `apps/<app>/documents/{id}` and Storage
 * `<app>/documents/{id}/{name}`, the same layout the browser uses (src/features/documents/schema.js,
 * which documents every field). A Drive file is the document `drive-<driveFileId>`, so one file reached
 * from two sources is one document; `driveSourceIds` lists the sources it belongs to and it leaves the
 * archive only when the last one lets it go.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { appId, appRoot } from '../appContext.js';
import { PDF_MIME_TYPE } from './driveClient.js';

// same values as INDEXING_STATUS in src/features/documents/schema.js
export const INDEXING_STATUS = { pending: 'pending', done: 'done', failed: 'failed' };
// same as MAX_FILE_SIZE_BYTES in src/features/documents/fileTypes.js
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const documentsCollection = () => getFirestore().collection(`${appRoot()}/documents`);
export const documentRef = id => documentsCollection().doc(id);
export const driveDocumentId = fileId => `drive-${fileId}`;

/** Documents are unique by name, ignoring case and surrounding spaces (nameKey in indexability.js). */
export const nameKey = name =>
  String(name || '')
    .trim()
    .toLowerCase();

// same as safeFileName in src/features/documents/fileTypes.js
const safeFileName = name =>
  String(name || 'documento')
    .replace(/[\\/#?[\]*]/g, '_')
    .slice(0, 180);

export const storagePathFor = (documentId, name) =>
  `${appId()}/documents/${documentId}/${safeFileName(name)}`;

const bucket = () => getStorage().bucket();

export const saveFile = (path, bytes) =>
  bucket().file(path).save(bytes, { contentType: PDF_MIME_TYPE, resumable: false });

export const fileExists = async path => Boolean(path) && (await bucket().file(path).exists())[0];

export const deleteFile = path => bucket().file(path).delete({ ignoreNotFound: true });

// what a run needs to know about every document: enough to compare, nothing heavy (no index cards)
const COMPARED_FIELDS = [
  'source',
  'name',
  'description',
  'storagePath',
  'sizeBytes',
  'indexingStatus',
  'indexedAt',
  'driveFileId',
  'driveSourceIds',
  'driveVersion',
  'driveMd5',
  'driveModifiedTime',
  'driveWebViewLink',
  'drivePath',
  'driveIndexFailedAt'
];

/** Every document of the archive, as `id → fields` (uploads too: their names are taken). */
export async function loadArchive() {
  const snapshot = await documentsCollection()
    .select(...COMPARED_FIELDS)
    .get();
  return new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
}

/**
 * Lets a source go of a document. The document is deleted (Firestore entry and Storage file) when no other
 * source holds it; otherwise only the link is dropped. Resolves to true when the document was deleted.
 */
export async function detachFromSource(documentId, sourceId) {
  const ref = documentRef(documentId);
  // in a transaction: another source may be adding or dropping the same file right now
  const outcome = await getFirestore().runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data().source !== 'drive') return { deleted: false };
    const data = snapshot.data();
    const remaining = (data.driveSourceIds || []).filter(id => id !== sourceId);
    if (remaining.length > 0) {
      tx.update(ref, { driveSourceIds: remaining });
      return { deleted: false };
    }
    tx.delete(ref);
    return { deleted: true, storagePath: data.storagePath };
  });
  if (outcome.deleted && outcome.storagePath) await deleteFile(outcome.storagePath);
  return outcome.deleted;
}
