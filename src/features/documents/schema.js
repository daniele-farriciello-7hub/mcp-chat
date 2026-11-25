/**
 * Firestore and Storage layout of the document archive. The single place where paths and status
 * values are spelled out.
 *
 *   apps/assistente-7hub/documents/{id}          a document: metadata, indexing status, index card
 *   Storage assistente-7hub/documents/{id}/{name} the bytes Gemini reads
 *
 * Document fields: source, name, mimeType, indexMimeType, sizeBytes, storagePath, indexingStatus,
 * error, indexCard { summary, banks, products, topics, keywords, light? }, createdAt, uploadedBy, indexedAt,
 * indexedWithModel, description, mode, categories, categoriesManual. Cards written before banks and products
 * existed simply lack those two.
 *
 * `source` is 'upload' (an admin's file, from the browser) or 'drive' (a PDF kept in step with Google
 * Drive by the server: functions/src/drive/). A Drive document has the id `drive-<driveFileId>`, is
 * indexed on the server with the same card (functions/src/drive/indexCard.js) and also carries:
 * driveFileId, driveSourceIds (the Drive sources it belongs to: it leaves the archive when the last one
 * lets it go), driveVersion, driveMd5, driveModifiedTime (what the sync compares to see a file changed),
 * driveWebViewLink, drivePath (the folder it sits in, from the source's root), driveSyncedAt and
 * driveIndexFailedAt. The browser never replaces or deletes one: the next sync would undo it. The
 * sources themselves (`apps/<app>/driveSources`) are server-only and reached through the `drive` function.
 *
 * `description` is free text the admin writes about an image ("Logo WeUnit, versione bianca su sfondo
 * trasparente"). It is mandatory for an image to be indexed (indexability.js) and, once the image is
 * indexed, it cannot be emptied; documents uploaded before it existed simply lack it. It is saved on
 * its own, at any time, without touching the index card: the chat catalog (chatCatalog.js) reads it
 * from here, and indexing passes it to Gemini as the authoritative word on what the image is.
 * `indexMimeType` is null for a GIF — Gemini cannot look at it, so it is indexed from name and
 * description alone.
 *
 * `mode` is how the assistant uses the document: 'studied' (it reads the file and answers from it: a full
 * index card in the system prompt of every turn, `read_document` opens it) or 'archive' (it only finds and
 * hands the file over: a short card, no place in the system prompt, found with `search_archive`,
 * `read_document` refuses it). A document without `mode` is a studied one. See archiveMode.js. The mode is
 * set at upload and changeable later on the row; a Drive document is 'studied' until an admin changes it.
 * The Drive sync never writes `mode`, `categories` or `categoriesManual` on an existing document (it
 * updates only the fields it names), so what an admin chose in the browser is not undone by the next sync.
 * Turning an archive document back into a studied one drops it to 'pending' until its full card is written:
 * the short card of an archive document is marked `indexCard.light: true`.
 *
 * `categories` are names from the admins' list (settings `documentCategories`, categories.js): 1–3 picked by
 * Gemini at indexing, or set by an admin on the document, which also sets `categoriesManual: true` so a
 * later indexing leaves them as they are. A name that has left the list stays here, unseen (categories.js).
 */
import { collection, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import { APP_ID, FIRESTORE_ROOT } from '@/shared/firebase/paths';

export const INDEXING_STATUS = { pending: 'pending', done: 'done', failed: 'failed' };

export const documentsCollection = () => collection(db, ...FIRESTORE_ROOT, 'documents');
export const documentRef = id => doc(db, ...FIRESTORE_ROOT, 'documents', id);

export const storageFolder = documentId => `${APP_ID}/documents/${documentId}`;
