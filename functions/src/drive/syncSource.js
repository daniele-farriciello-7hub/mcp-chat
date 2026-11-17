/**
 * One synchronisation run of a Drive source: list what is on Drive, compare it with the archive, and
 * bring the archive in line — new PDFs are downloaded to Storage, written as documents and indexed;
 * changed ones are refreshed; files that left Drive (or the source) leave the archive.
 *
 * The comparison is always the Drive metadata against what the document stored last time (syncPlan.js),
 * so a run costs one listing plus a download and an index card per file that really changed. Webhooks
 * only make a run happen sooner (channels.js).
 *
 * A run is bounded: it starts no new file after `budget.newWorkUntil` and aborts what is in flight at
 * `budget.hardDeadline`; whatever is left is reported as `deferred` and the source stays due, so the next
 * tick continues where this one stopped (every file already done compares equal and costs nothing).
 * Only one run works on a source at a time: see the lease in sourceStore.js.
 */
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  INDEXING_STATUS,
  MAX_FILE_SIZE_BYTES,
  deleteFile,
  detachFromSource,
  documentRef,
  documentsCollection,
  driveDocumentId,
  fileExists,
  loadArchive,
  nameKey,
  saveFile,
  storagePathFor
} from './archive.js';
import { stopAllChannels, syncChannels } from './channels.js';
import { PDF_MIME_TYPE, downloadFile } from './driveClient.js';
import { indexDocument, loadIndexingSettings } from './indexer.js';
import { ListingError, listSource } from './listing.js';
import { runPool } from './retry.js';
import { acquireLease, deleteSource, finishRun, reportProgress, updateSource } from './sourceStore.js';
import { SKIP_REASONS, planFile } from './syncPlan.js';

// files worked on at once: downloads and Gemini calls overlap, and Vertex quotas are not hit
const FILE_CONCURRENCY = 4;
const MAX_REPORTED_ERRORS = 30;
const PROGRESS_EVERY_MS = 1500;
// the functions' timeout is 540 s: no new file after 400 s, the rest aborted at 510 s
const NEW_WORK_MS = 400_000;
const HARD_LIMIT_MS = 510_000;
// channels are maintained only if this much time is left
const CHANNELS_NEED_MS = 20_000;

const millis = value => value?.toMillis?.() ?? null;

/** The time a function invocation may spend, counted from now. */
export function makeBudget(now = Date.now()) {
  return {
    newWorkUntil: now + NEW_WORK_MS,
    hardDeadline: now + HARD_LIMIT_MS,
    signal: AbortSignal.timeout(HARD_LIMIT_MS)
  };
}

const describeFailure = error => {
  const text = String(error?.message || error);
  if (/\b503\b|UNAVAILABLE|overloaded/i.test(text)) return 'Gemini era sovraccarico.';
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) return 'Troppe richieste a Gemini.';
  if (/MAX_TOKENS|troncata/i.test(text)) return 'Documento troppo lungo per la scheda.';
  return text.slice(0, 160);
};

function newStats() {
  return {
    added: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    failed: 0,
    unchanged: 0,
    ignored: 0,
    deferred: 0,
    errors: []
  };
}

const reportError = (stats, name, reason, kind) => {
  if (stats.errors.length < MAX_REPORTED_ERRORS) stats.errors.push({ name, reason, kind });
};

/** The folder a file sits in, for the lines of the panel's error list. */
const labelOf = entry => (entry.path ? `${entry.path}/${entry.name}` : entry.name);

/**
 * Works on one file. Never throws for a problem of the file itself: it counts it and goes on, so one
 * bad PDF does not stop the others.
 */
async function processFile(entry, run) {
  const { source, archive, names, stats, budget } = run;
  const id = driveDocumentId(entry.id);
  const existing = archive.get(id);

  // a file of this run that took the name a moment ago may still fail: wait to see whether it keeps it
  let holder = names.get(nameKey(entry.name));
  while (holder && holder !== id && run.inFlight.has(holder)) {
    await run.inFlight.get(holder);
    holder = names.get(nameKey(entry.name));
  }
  const conflict = holder && holder !== id ? archive.get(holder) || { source: 'unknown' } : null;
  const plan = planFile({
    entry,
    existing,
    conflict,
    sourceId: source.id,
    forceSince: run.forceSince,
    now: Date.now()
  });

  if (plan.type === 'skip') {
    stats.skipped++;
    reportError(stats, labelOf(entry), plan.reason, 'skipped');
    return;
  }
  if (plan.type === 'none') {
    stats.unchanged++;
    return;
  }

  // the name is taken before anything is awaited, so two files of this run cannot both claim it
  const key = nameKey(entry.name);
  if (existing && names.get(nameKey(existing.name)) === id) names.delete(nameKey(existing.name));
  names.set(key, id);
  // so a later file of this run with the same name sees who took it
  if (!existing) archive.set(id, { source: 'drive', name: entry.name });

  // until the document carries the new name, a failure gives the name back
  let nameWritten = false;
  const releaseName = () => {
    if (nameWritten) return;
    if (names.get(key) === id) names.delete(key);
    if (existing) names.set(nameKey(existing.name), id);
    else archive.delete(id);
  };

  const ref = documentRef(id);
  let storagePath = existing?.storagePath ?? null;
  let sizeBytes = existing?.sizeBytes ?? entry.size ?? null;

  try {
    if (plan.download || (plan.index && !(await fileExists(storagePath)))) {
      const bytes = await downloadFile(entry.id, budget.signal);
      if (bytes.length > MAX_FILE_SIZE_BYTES) {
        releaseName();
        stats.skipped++;
        reportError(stats, labelOf(entry), SKIP_REASONS.tooLarge, 'skipped');
        return;
      }
      const path = storagePathFor(id, entry.name);
      await saveFile(path, bytes);
      // the old bytes may sit under another file name inside the same folder
      if (storagePath && storagePath !== path) await deleteFile(storagePath).catch(() => {});
      storagePath = path;
      sizeBytes = bytes.length;
    }

    const driveFields = {
      name: entry.name,
      mimeType: PDF_MIME_TYPE,
      indexMimeType: PDF_MIME_TYPE,
      sizeBytes,
      storagePath,
      driveFileId: entry.id,
      driveVersion: entry.version,
      driveMd5: entry.md5,
      driveModifiedTime: entry.modifiedTime,
      driveWebViewLink: entry.webViewLink,
      drivePath: entry.path,
      driveSyncedAt: FieldValue.serverTimestamp()
    };
    // a new document, or one whose content changed, has no card until the new one is written
    const noCard = {
      indexingStatus: INDEXING_STATUS.pending,
      indexCard: null,
      indexedAt: null,
      indexedWithModel: null,
      error: null,
      driveIndexFailedAt: null
    };
    if (!existing) {
      await ref.set({
        source: 'drive',
        ...driveFields,
        ...noCard,
        driveSourceIds: [source.id],
        description: '',
        createdAt: FieldValue.serverTimestamp(),
        uploadedBy: null
      });
      nameWritten = true;
      stats.added++;
    } else {
      await ref.update({
        ...driveFields,
        ...(plan.download ? noCard : {}),
        driveSourceIds: FieldValue.arrayUnion(source.id)
      });
      nameWritten = true;
      if (plan.changed) stats.updated++;
      else stats.unchanged++;
    }

    if (plan.index) {
      try {
        const document = { id, name: entry.name, description: existing?.description, storagePath };
        await indexDocument(document, await run.indexingSettings(), budget.signal);
      } catch (error) {
        if (budget.signal.aborted) throw error;
        stats.failed++;
        reportError(
          stats,
          labelOf(entry),
          `Indicizzazione non riuscita: ${describeFailure(error)}`,
          'failed'
        );
      }
    }
  } catch (error) {
    releaseName();
    if (budget.signal.aborted) {
      // out of time, not a problem of this file: the next run picks it up
      stats.deferred++;
      return;
    }
    stats.failed++;
    reportError(stats, labelOf(entry), `Non riuscito: ${describeFailure(error)}`, 'failed');
    console.warn(`drive: ${labelOf(entry)} failed:`, error?.message || error);
  }
}

/** Lets the source go of the documents Drive no longer has. Runs before the new files, which may want the freed names. */
async function removeVanished(run, presentIds) {
  const { source, archive, names, stats } = run;
  const vanished = [...archive].filter(
    ([id, data]) => data.source === 'drive' && data.driveSourceIds?.includes(source.id) && !presentIds.has(id)
  );
  await runPool(vanished, FILE_CONCURRENCY, async ([id, data]) => {
    try {
      if (await detachFromSource(id, source.id)) {
        stats.removed++;
        if (names.get(nameKey(data.name)) === id) names.delete(nameKey(data.name));
      }
    } catch (error) {
      stats.failed++;
      reportError(stats, data.name || id, `Non rimosso dall’archivio: ${describeFailure(error)}`, 'failed');
    }
  });
}

async function synchronise(source, run) {
  const { stats, budget } = run;
  const listing = await listSource(source, { deadline: budget.newWorkUntil });
  stats.ignored = listing.ignored;
  for (const problem of listing.problems) reportError(stats, problem.name, problem.reason, 'source');

  run.archive = await loadArchive();
  run.names = new Map([...run.archive].map(([id, data]) => [nameKey(data.name), id]));

  // a file too big for the archive is listed (to say why it is skipped) but never counts as present
  const presentIds = new Set(
    listing.files
      .filter(file => file.size == null || file.size <= MAX_FILE_SIZE_BYTES)
      .map(file => driveDocumentId(file.id))
  );
  // an incomplete listing proves nothing about what is missing from it: nothing is removed then
  if (listing.complete) await removeVanished(run, presentIds);

  let indexingSettings = null;
  run.indexingSettings = () => (indexingSettings ??= loadIndexingSettings());

  const total = listing.files.length;
  let done = 0;
  let lastReport = 0;
  const report = () => {
    const now = Date.now();
    if (now - lastReport < PROGRESS_EVERY_MS) return;
    lastReport = now;
    reportProgress(source.id, { phase: 'files', done, total });
  };
  reportProgress(source.id, { phase: 'files', done, total });

  await runPool(listing.files, FILE_CONCURRENCY, async entry => {
    if (Date.now() > budget.newWorkUntil || budget.signal.aborted) {
      stats.deferred++;
      return;
    }
    const documentId = driveDocumentId(entry.id);
    const task = processFile(entry, run);
    run.inFlight.set(documentId, task);
    const forget = () => run.inFlight.delete(documentId);
    task.then(forget, forget);
    await task;
    done++;
    report();
  });

  // what Drive should tell us about next: the folders of a complete listing, or just what is registered
  if (Date.now() < budget.hardDeadline - CHANNELS_NEED_MS) {
    try {
      await syncChannels(source, {
        watch: listing.complete ? listing.folders.map(folder => folder.id) : null
      });
    } catch (error) {
      console.warn(`drive: notification channels of ${source.id} failed:`, error?.message || error);
    }
  }
  return { name: listing.name, complete: listing.complete && stats.deferred === 0 && !budget.signal.aborted };
}

/**
 * Runs the source once and records the outcome on it. Resolves to null when it could not start (someone
 * else is working on it, it is gone, or — with `onlyIfDue` — it is not due), otherwise to the run's result.
 *
 * @param {string} sourceId
 * @param {{ trigger: 'schedule'|'webhook'|'manual', budget: ReturnType<typeof makeBudget>, onlyIfDue?: boolean }} options
 */
export async function runSource(sourceId, { trigger, budget, onlyIfDue = false }) {
  const owner = randomUUID();
  const source = await acquireLease(sourceId, owner, { onlyIfDue });
  if (!source) return null;

  const startedAt = Date.now();
  const stats = newStats();
  const forceSince = millis(source.forceSince);
  const run = { source, stats, budget, forceSince, inFlight: new Map() };
  let outcome = { name: null, complete: false };
  let runError = null;
  try {
    outcome = await synchronise(source, run);
  } catch (error) {
    runError =
      error instanceof ListingError
        ? error.message
        : `Sincronizzazione non riuscita: ${describeFailure(error)}`;
    if (!(error instanceof ListingError)) console.error(`drive: sync of ${sourceId} failed`, error);
  }

  const result = { trigger, durationMs: Date.now() - startedAt, ...stats, complete: outcome.complete };
  await finishRun(sourceId, owner, { name: outcome.name, result, runError, forceUsed: forceSince });
  return result;
}

/**
 * Removes a source: its notification channels, then its documents (those no other source holds leave
 * the archive, Firestore entry and Storage file), then the source itself. Resolves to the number of
 * documents deleted, or null when a run is working on the source right now. If it fails midway the source
 * is still there and removing it again carries on.
 */
export async function removeSource(source) {
  const owner = randomUUID();
  if (!(await acquireLease(source.id, owner))) return null;
  try {
    await stopAllChannels(source.id).catch(error =>
      console.warn('drive: stopping channels failed:', error?.message || error)
    );
    const held = await documentsCollection()
      .where('driveSourceIds', 'array-contains', source.id)
      .select()
      .get();
    let removed = 0;
    await runPool(held.docs, FILE_CONCURRENCY, async doc => {
      if (await detachFromSource(doc.id, source.id)) removed++;
    });
    await deleteSource(source.id);
    return removed;
  } catch (error) {
    await updateSource(source.id, {
      lease: null,
      status: 'error',
      runError: `Rimozione non riuscita: ${describeFailure(error)}`
    }).catch(() => {});
    throw error;
  }
}
