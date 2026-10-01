/**
 * Background indexing queue. It lives outside React on purpose: closing the settings panel unmounts
 * the Documents tab but the queue keeps running. Firestore shows finished documents on its own;
 * this module only tracks progress for whoever is watching and what is already queued.
 */
'use client';

import { indexDocument } from './indexing';
import { invalidateChatCatalog } from './chatCatalog';
import { nameKey } from './indexability';

const FINISHED_VISIBLE_MS = 3000;

const listeners = new Set();
let queueState = null; // { done, total, failed, inProgress: Map(id -> { document, phase }) } | null

function notify() {
  for (const listener of listeners) listener(queueState);
}

/** Follows queue progress: called immediately with the current state, then on every change. */
export function subscribeToIndexingQueue(onChange) {
  listeners.add(onChange);
  onChange(queueState);
  return () => listeners.delete(onChange);
}

export const isQueued = id => Boolean(queueState?.inProgress?.has(id));

/** Queues documents and starts the worker if idle. Returns immediately. */
export function enqueueForIndexing(documents) {
  // names are unique: never index two documents with the same name, in this call or already queued
  const queuedNames = new Set(
    [...(queueState?.inProgress?.values() || [])].map(entry => nameKey(entry.document))
  );
  const toQueue = documents.filter(d => {
    if (isQueued(d.id) || queuedNames.has(nameKey(d))) return false;
    queuedNames.add(nameKey(d));
    return true;
  });
  if (toQueue.length === 0) return;

  const alreadyRunning = Boolean(queueState);
  if (!queueState) queueState = { done: 0, total: 0, failed: 0, inProgress: new Map() };
  queueState.total += toQueue.length;
  for (const document of toQueue) queueState.inProgress.set(document.id, { document, phase: null });
  notify();

  // The loop below always reads the shared Map, never a copy captured by the call that started it,
  // so documents queued by later calls are picked up too.
  if (alreadyRunning) return;

  (async () => {
    while (queueState.inProgress.size > 0) {
      const [[id, entry]] = queueState.inProgress;
      try {
        await indexDocument(entry.document, phase => {
          entry.phase = phase;
          notify();
        });
      } catch (error) {
        console.warn('[indexing] failed:', id, error?.message);
        queueState.failed++;
      } finally {
        queueState.inProgress.delete(id);
        queueState.done++;
        invalidateChatCatalog();
        notify();
      }
    }
    const finished = queueState;
    setTimeout(() => {
      if (queueState === finished) {
        queueState = null;
        notify();
      }
    }, FINISHED_VISIBLE_MS);
  })();
}
