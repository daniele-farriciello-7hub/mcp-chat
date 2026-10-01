/**
 * The database schema as the chat assistant sees it: enabled connections, and within each only the
 * tables an admin turned on, with their card. Mirrors `features/documents/chatCatalog.js` — same
 * cache, same "best effort" contract (an unreachable Firestore read must not break the chat).
 */
'use client';

import { getDocs, query, where } from 'firebase/firestore';
import { connectionsCollection, tablesCollection } from './schema';

const CACHE_TTL_MS = 60_000;

let cache = null; // { loadedAt, entries }

/** Called whenever a connection or a table's enabled flag/card changes, so the chat sees it at once. */
export function invalidateChatSchema() {
  cache = null;
}

/** @returns {Promise<Array<{connectionId, label, database, tables: object[]}>>} */
export async function getChatSchema() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;

  const connectionsSnap = await getDocs(connectionsCollection());
  const enabledConnections = connectionsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.enabled);

  const entries = [];
  for (const connection of enabledConnections) {
    const tablesSnap = await getDocs(query(tablesCollection(connection.id), where('enabled', '==', true)));
    const tables = tablesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.removed);
    if (!tables.length) continue;
    entries.push({
      connectionId: connection.id,
      label: connection.label,
      database: connection.database,
      tables
    });
  }

  cache = { loadedAt: Date.now(), entries };
  return entries;
}
