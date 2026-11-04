/**
 * Firestore and Storage layout of the document archive. The single place where paths and status
 * values are spelled out.
 *
 *   apps/assistente-7hub/documents/{id}          a document: metadata, indexing status, index card
 *   Storage assistente-7hub/documents/{id}/{name} the bytes Gemini reads
 *
 * Document fields: source, name, mimeType, indexMimeType, sizeBytes, storagePath, indexingStatus,
 * error, indexCard { summary, banks, products, topics, keywords }, createdAt, uploadedBy, indexedAt,
 * indexedWithModel, description. Cards written before banks and products existed simply lack those two.
 *
 * `description` is free text the admin writes about an image ("Logo WeUnit, versione bianca su sfondo
 * trasparente"). It is mandatory for an image to be indexed (indexability.js) and, once the image is
 * indexed, it cannot be emptied; documents uploaded before it existed simply lack it. It is saved on
 * its own, at any time, without touching the index card: the chat catalog (chatCatalog.js) reads it
 * from here, and indexing passes it to Gemini as the authoritative word on what the image is.
 * `indexMimeType` is null for a GIF — Gemini cannot look at it, so it is indexed from name and
 * description alone.
 */
import { collection, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import { APP_ID, FIRESTORE_ROOT } from '@/shared/firebase/paths';

export const INDEXING_STATUS = { pending: 'pending', done: 'done', failed: 'failed' };

export const documentsCollection = () => collection(db, ...FIRESTORE_ROOT, 'documents');
export const documentRef = id => doc(db, ...FIRESTORE_ROOT, 'documents', id);

export const storageFolder = documentId => `${APP_ID}/documents/${documentId}`;
