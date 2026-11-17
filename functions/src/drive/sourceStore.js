/**
 * The Drive sources and their run state, server side (Admin SDK). The browser never reads or writes
 * these: it goes through `http/driveEndpoint.js`, like the conversation history, so no security rule
 * has to know about them.
 *
 *   apps/<app>/driveSources/{sourceId}            a folder or a PDF being synchronised
 *   apps/<app>/driveSources/{sourceId}/channels/{channelId}   its Drive notification channels
 *
 * A source: { driveId, kind: 'folder'|'file', name, url, frequency, dailyHour, createdAt, createdBy,
 *   nextRunAt, lastRunAt, lastResult { trigger, durationMs, added, updated, removed, skipped, failed,
 *   unchanged, ignored, deferred, complete, errors[] }, status: 'idle'|'running'|'error', runError,
 *   progress { phase, done, total }, lease { owner, expiresAt }, runStartedAt, forceSince, webhookAt,
 *   webhook { active, channels, expiresAt, error, retryAt, checkedAt } }.
 * The source id is the Drive id, so the same folder cannot be linked twice.
 *
 * `lease` is what keeps two runs (an overlapping scheduler tick, a manual "Sincronizza ora") from working
 * on the same source: it is taken and released in transactions, and expires on its own if a run dies.
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { appRoot } from '../appContext.js';
import { isDue, nextRunAfterRun } from './schedule.js';

// longer than the functions' 540 s timeout: a run that dies keeps the lease only until this passes
const LEASE_MS = 10 * 60_000;
// a failed run is tried again within the hour, whatever the frequency
const RETRY_AFTER_ERROR_MS = 60 * 60_000;
// Drive sends one notification per change; they ask for one run, not one each
const NOTIFICATION_DEBOUNCE_MS = 30_000;

const sources = () => getFirestore().collection(`${appRoot()}/driveSources`);
export const sourceRef = id => sources().doc(id);
export const channelsOf = id => sourceRef(id).collection('channels');

const millis = value => value?.toMillis?.() ?? null;
const timestamp = ms => (ms == null ? null : Timestamp.fromMillis(ms));

export async function listSources() {
  const snapshot = await sources().get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getSource(id) {
  const snapshot = await sourceRef(id).get();
  return snapshot.exists ? { id, ...snapshot.data() } : null;
}

/** Creates the source; rejects if it already exists (code 6, ALREADY_EXISTS). */
export async function createSource(id, { driveId, kind, name, url, frequency, dailyHour, createdBy }) {
  await sourceRef(id).create({
    driveId,
    kind,
    name,
    url,
    frequency,
    dailyHour,
    createdAt: FieldValue.serverTimestamp(),
    createdBy,
    // due at once; a manual-only source waits for the button
    nextRunAt: frequency === 'manual' ? null : Timestamp.now(),
    lastRunAt: null,
    lastResult: null,
    status: 'idle',
    runError: null,
    progress: null,
    lease: null,
    forceSince: null,
    webhookAt: null,
    webhook: { active: false, channels: 0, expiresAt: null, error: null, retryAt: null, checkedAt: null }
  });
}

export const updateSource = (id, fields) => sourceRef(id).update(fields);

/** Deletes the source and its channels' records. Documents and Drive channels are the caller's to clean first. */
export const deleteSource = id => getFirestore().recursiveDelete(sourceRef(id));

/**
 * Takes the source for one run. Resolves to the source as it was, or null when someone else holds it,
 * it no longer exists or — with `onlyIfDue`, for the scheduler — it is not due after all.
 */
export function acquireLease(id, owner, { onlyIfDue = false, now = Date.now() } = {}) {
  return getFirestore().runTransaction(async tx => {
    const snapshot = await tx.get(sourceRef(id));
    if (!snapshot.exists) return null;
    const source = { id, ...snapshot.data() };
    if (millis(source.lease?.expiresAt) > now) return null;
    if (onlyIfDue && !isDue({ frequency: source.frequency, nextRunAt: millis(source.nextRunAt) }, now)) {
      return null;
    }
    tx.update(sourceRef(id), {
      lease: { owner, expiresAt: timestamp(now + LEASE_MS) },
      status: 'running',
      runError: null,
      progress: { phase: 'listing', done: 0, total: 0 },
      runStartedAt: timestamp(now)
    });
    return source;
  });
}

/** Progress for whoever is watching the panel. Best effort: a failure here never stops the run. */
export const reportProgress = (id, progress) =>
  sourceRef(id)
    .update({ progress })
    .catch(() => {});

/**
 * Ends a run: writes its result, frees the lease and schedules the next one. Does nothing if the lease is no
 * longer ours (the run outlived it and another took over) or the source was removed meanwhile.
 * `forceUsed` is the `forceSince` the run worked under: it is cleared only if the run finished everything
 * and nobody asked again in the meantime.
 */
export function finishRun(id, owner, { name, result, runError = null, forceUsed = null, now = Date.now() }) {
  return getFirestore().runTransaction(async tx => {
    const snapshot = await tx.get(sourceRef(id));
    if (!snapshot.exists) return;
    const source = snapshot.data();
    if (source.lease?.owner !== owner) return;

    const startedMs = millis(source.runStartedAt) ?? now;
    // a Drive notification that arrived while this run was working may be about something it did not see
    const notifiedDuringRun = (millis(source.webhookAt) ?? 0) > startedMs;
    let nextMs = null;
    if (source.frequency !== 'manual') {
      if (!result.complete || notifiedDuringRun) {
        nextMs = now;
      } else {
        nextMs = nextRunAfterRun(source, startedMs, millis(source.nextRunAt));
        if (runError) nextMs = Math.min(nextMs, now + RETRY_AFTER_ERROR_MS);
      }
    }

    const update = {
      lease: null,
      status: runError ? 'error' : 'idle',
      runError,
      progress: null,
      lastRunAt: timestamp(now),
      lastResult: result,
      nextRunAt: timestamp(nextMs)
    };
    if (name) update.name = name;
    if (result.complete && millis(source.forceSince) === forceUsed) update.forceSince = null;
    tx.update(sourceRef(id), update);
  });
}

/**
 * A Drive notification arrived for this source: make it due now (the next scheduler tick takes it).
 * Resolves to what was done: 'queued', 'debounced', 'ignored' (manual-only) or 'missing'.
 */
export function noteDriveChange(id, now = Date.now()) {
  return getFirestore().runTransaction(async tx => {
    const snapshot = await tx.get(sourceRef(id));
    if (!snapshot.exists) return 'missing';
    const source = snapshot.data();
    if (source.frequency === 'manual') return 'ignored';

    const nextMs = millis(source.nextRunAt);
    const alreadyDue = nextMs != null && nextMs <= now;
    const lastNote = millis(source.webhookAt);
    if (alreadyDue && lastNote != null && now - lastNote < NOTIFICATION_DEBOUNCE_MS) return 'debounced';

    tx.update(sourceRef(id), {
      webhookAt: timestamp(now),
      nextRunAt: alreadyDue ? source.nextRunAt : timestamp(now)
    });
    return 'queued';
  });
}

/** A source as the browser gets it: timestamps as epoch milliseconds, no lease, no internals. */
export function serializeSource(source, now = Date.now()) {
  const leaseActive = (millis(source.lease?.expiresAt) ?? 0) > now;
  const interrupted = source.status === 'running' && !leaseActive;
  const webhook = source.webhook || {};
  return {
    id: source.id,
    driveId: source.driveId,
    kind: source.kind,
    name: source.name,
    url: source.url,
    frequency: source.frequency,
    dailyHour: source.dailyHour,
    status: leaseActive ? 'running' : interrupted ? 'error' : source.status || 'idle',
    runError: interrupted
      ? 'La sincronizzazione precedente si è interrotta: riparte al prossimo giro.'
      : source.runError || null,
    progress: leaseActive ? source.progress || null : null,
    createdAt: millis(source.createdAt),
    lastRunAt: millis(source.lastRunAt),
    nextRunAt: millis(source.nextRunAt),
    lastResult: source.lastResult || null,
    reindexPending: Boolean(source.forceSince),
    webhook: {
      active: Boolean(webhook.active),
      channels: webhook.channels || 0,
      expiresAt: millis(webhook.expiresAt),
      error: webhook.error || null
    }
  };
}
