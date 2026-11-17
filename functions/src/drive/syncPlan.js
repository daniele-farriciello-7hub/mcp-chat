/**
 * What to do with one PDF found on Drive, given the document the archive already has for it. Pure: no
 * Firestore, no Drive, so every rule of the sync is tested in scripts/drive-sync.test.mjs.
 *
 * Change detection compares what Drive reports with what was stored on the document at the last sync
 * (`driveMd5`, `driveVersion`, `driveModifiedTime`): the listing is metadata only, so the comparison is
 * cheap and the file is downloaded only when its content changed. The checksum decides when there is
 * one — Drive bumps `version` for any change, a rename included — so a rename alone costs no download
 * and no new index card.
 */
import { MAX_FILE_SIZE_BYTES } from './archive.js';

export const SKIP_REASONS = {
  tooLarge: 'supera i 20 MB',
  uploadedName: 'esiste già un documento caricato con questo nome',
  takenName: 'esiste già un documento con questo nome'
};

// a document whose card failed is retried by the scheduled runs, but not at every one of them
export const RETRY_FAILED_AFTER_MS = 6 * 60 * 60_000;

const ms = value => value?.toMillis?.() ?? (typeof value === 'number' ? value : null);

/**
 * @param {object} input
 * @param {object} input.entry       the file as listed (`id, name, size, version, md5, modifiedTime, webViewLink, path`)
 * @param {object} [input.existing]  the stored document `drive-<id>`
 * @param {object} [input.conflict]  another document that already has this file's name
 * @param {string} input.sourceId
 * @param {number|null} input.forceSince  epoch ms of a "Reindicizza tutto" request; a document indexed since then is done
 * @param {number} input.now
 * @returns {{ type: 'skip', reason: string }
 *   | { type: 'none' }
 *   | { type: 'create' | 'update', download: boolean, index: boolean, changed: boolean }}
 *   `changed` is false for an update that only refreshes metadata: it is not worth reporting.
 */
export function planFile({ entry, existing, conflict, sourceId, forceSince, now }) {
  if (entry.size != null && entry.size > MAX_FILE_SIZE_BYTES)
    return { type: 'skip', reason: SKIP_REASONS.tooLarge };
  if (conflict) {
    // names are unique: the document that is already there keeps the name, the newcomer waits outside
    return {
      type: 'skip',
      reason: conflict.source === 'drive' ? SKIP_REASONS.takenName : SKIP_REASONS.uploadedName
    };
  }
  if (!existing) return { type: 'create', download: true, index: true, changed: true };

  const contentChanged =
    existing.driveMd5 && entry.md5
      ? existing.driveMd5 !== entry.md5
      : existing.driveVersion !== entry.version;
  const download = contentChanged || !existing.storagePath;

  const failedAt = ms(existing.driveIndexFailedAt);
  const retryFailed =
    existing.indexingStatus === 'failed' && (failedAt == null || now - failedAt >= RETRY_FAILED_AFTER_MS);
  const indexedAt = ms(existing.indexedAt);
  const forced = forceSince != null && !(indexedAt != null && indexedAt >= forceSince);
  const index = download || existing.indexingStatus === 'pending' || retryFailed || forced;

  const renamed = existing.name !== entry.name;
  const metadataChanged =
    renamed ||
    existing.driveVersion !== entry.version ||
    existing.driveModifiedTime !== entry.modifiedTime ||
    (existing.drivePath ?? '') !== entry.path ||
    (existing.driveWebViewLink ?? null) !== entry.webViewLink ||
    !existing.driveSourceIds?.includes(sourceId);

  if (!download && !index && !metadataChanged) return { type: 'none' };
  return { type: 'update', download, index, changed: download || index || renamed };
}
