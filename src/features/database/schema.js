/**
 * Firestore layout of the database-connections feature. The single place where paths and status
 * values are spelled out — mirrors `features/documents/schema.js`.
 *
 *   apps/assistente-7hub/dbConnections/{id}            label, host, port, database, user, ssl,
 *   apps/assistente-7hub/dbConnections/{id}/tables/{t} enabled, allowSampling, status, timestamps
 *                                                       per table: name, kind (table|view), columns,
 *                                                       primaryKey, foreignKeys, approxRows, comment,
 *                                                       enabled, card { summary, columns }, removed
 *   apps/assistente-7hub/dbSecrets/{id}                encrypted password — never read by the client;
 *                                                       written only through the `database` function.
 */
import { collection, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import { FIRESTORE_ROOT } from '@/shared/firebase/paths';

export const CONNECTION_STATUS = { untested: 'untested', ok: 'ok', failed: 'failed' };
export const CARD_STATUS = { pending: 'pending', writing: 'writing', done: 'done', failed: 'failed' };

export const connectionsCollection = () => collection(db, ...FIRESTORE_ROOT, 'dbConnections');
export const connectionRef = id => doc(db, ...FIRESTORE_ROOT, 'dbConnections', id);
export const tablesCollection = connectionId =>
  collection(db, ...FIRESTORE_ROOT, 'dbConnections', connectionId, 'tables');
export const tableRef = (connectionId, tableId) =>
  doc(db, ...FIRESTORE_ROOT, 'dbConnections', connectionId, 'tables', tableId);
