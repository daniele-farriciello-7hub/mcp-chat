/**
 * Background queue that drafts table index cards with Gemini, one table at a time. Lives outside
 * React on purpose, same shape as `features/documents/indexingQueue.js`: closing the settings panel
 * unmounts the Database tab, but drafting keeps running and Firestore shows finished cards on its
 * own — this module only tracks progress for whoever is watching.
 */
'use client';

import { draftTableCard } from './tableCards';
import { saveTableCard, sampleTable } from './connectionStore';

const FINISHED_VISIBLE_MS = 3000;
const key = (connectionId, tableId) => `${connectionId}:${tableId}`;

const listeners = new Set();
let queueState = null; // { done, total, failed, inProgress: Map(key -> { connectionId, table }) }

function notify() {
  for (const listener of listeners) listener(queueState);
}

/** Follows queue progress: called immediately with the current state, then on every change. */
export function subscribeToCardQueue(onChange) {
  listeners.add(onChange);
  onChange(queueState);
  return () => listeners.delete(onChange);
}

export const isCardQueued = (connectionId, tableId) =>
  Boolean(queueState?.inProgress?.has(key(connectionId, tableId)));

/** Queues tables for card drafting and starts the worker if idle. Returns immediately. */
export function enqueueForCardDrafting(connectionId, allowSampling, tables) {
  const toQueue = tables.filter(t => !isCardQueued(connectionId, t.id));
  if (toQueue.length === 0) return;

  const alreadyRunning = Boolean(queueState);
  if (!queueState) queueState = { done: 0, total: 0, failed: 0, inProgress: new Map() };
  queueState.total += toQueue.length;
  for (const table of toQueue) {
    queueState.inProgress.set(key(connectionId, table.id), { connectionId, allowSampling, table });
  }
  notify();

  if (alreadyRunning) return;

  (async () => {
    while (queueState.inProgress.size > 0) {
      const [[entryKey, entry]] = queueState.inProgress;
      try {
        const sample = entry.allowSampling
          ? await sampleTable(entry.connectionId, entry.table.name).catch(() => null)
          : null;
        const card = await draftTableCard(entry.table, sample);
        await saveTableCard(entry.connectionId, entry.table.id, card);
      } catch (error) {
        console.warn('[database] card drafting failed:', entryKey, error?.message);
        queueState.failed++;
      } finally {
        queueState.inProgress.delete(entryKey);
        queueState.done++;
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
