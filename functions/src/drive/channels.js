/**
 * Drive push notifications ("webhook"), an accelerator on top of the scheduled comparison — never a
 * replacement for it. For a source we `files.watch` the folder, each of its sub-folders, or the single
 * file; Drive then calls `driveWebhook` when something changes and the source is marked due.
 *
 * What a watch on a folder reports is the folder itself changing: files added to it or removed from it.
 * An edit *inside* a file does not touch the folder, so it is never notified: the scheduled run, which
 * compares each file's version and checksum, is what catches those.
 *
 * Channels expire (Drive allows a day at most for `files.watch`), so the scheduler renews the ones near
 * expiry on each tick, and every sync re-registers what is missing. If Drive refuses a registration (the
 * most likely cause is its domain verification for the callback address) the reason is stored on the source,
 * shown in the panel, and the source falls back to polling alone, retrying the registration now and then.
 * The callback proves who it is with `token`: an HMAC only this project can compute.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { DEVELOPMENT_APP, appId } from '../appContext.js';
import { describeDriveError, stopChannel, watchFile } from './driveClient.js';
import { runPool } from './retry.js';
import { channelsOf, updateSource } from './sourceStore.js';

const REGION = 'europe-west1';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'mappa-contatti-217007';

// Drive's limit for a files.watch channel; whatever it grants is read back and used
const CHANNEL_TTL_MS = 24 * 60 * 60_000;
// renewed this long before expiry, or at half the granted life if that is shorter
const RENEW_BEFORE_MS = 4 * 60 * 60_000;
// a source with more folders than this watches the first ones: the rest is covered by polling
const MAX_CHANNELS = 100;
const RETRY_AFTER_FAILURE_MS = 6 * 60 * 60_000;
const CHANNEL_CONCURRENCY = 4;

const millis = value => value?.toMillis?.() ?? null;

// ── who is calling ───────────────────────────────────────────────────────────

/**
 * The key for the tokens, derived from DB_CRED_KEY (already a secret of these functions) so there is no
 * new one to deploy; the label keeps it from being the same key that encrypts database passwords.
 */
const tokenKey = () =>
  process.env.DB_CRED_KEY
    ? createHmac('sha256', process.env.DB_CRED_KEY).update('drive-webhook-v1').digest()
    : null;

const macOf = sourceId =>
  createHmac('sha256', tokenKey()).update(`${appId()}|${sourceId}`).digest('base64url');

/** The `token` of a channel: the source id and its MAC (Drive ids contain no dots). At most 256 characters. */
export const channelToken = sourceId => `${sourceId}.${macOf(sourceId)}`;

/** The source a notification's token belongs to, or null when the token is not one of ours. */
export function verifyChannelToken(token) {
  if (typeof token !== 'string' || !tokenKey()) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const sourceId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(macOf(sourceId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? sourceId : null;
}

/** Where Drive sends notifications: the public `driveWebhook` function of this app's environment. */
export const webhookAddress = () =>
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${appId() === DEVELOPMENT_APP ? 'driveWebhookDev' : 'driveWebhook'}`;

/** Why notifications cannot work here at all, or null. */
function unavailableReason() {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return 'Le notifiche di Drive non arrivano all’emulatore.';
  if (!tokenKey()) return 'Chiave del server non configurata.';
  return null;
}

// ── channels ─────────────────────────────────────────────────────────────────

const describeWatchError = error =>
  /webhookUrlUnauthorized|Unauthorized WebHook/i.test(String(error?.message || error))
    ? 'Google non accetta l’indirizzo delle notifiche (dominio non verificato).'
    : describeDriveError(error);

const expiring = (record, now) => {
  const life = record.expirationMs - (record.createdMs ?? record.expirationMs - CHANNEL_TTL_MS);
  return record.expirationMs - now < Math.min(RENEW_BEFORE_MS, life / 2);
};

async function readRecords(sourceId) {
  const snapshot = await channelsOf(sourceId).get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    fileId: doc.data().fileId,
    resourceId: doc.data().resourceId,
    expirationMs: millis(doc.data().expiration) ?? 0,
    createdMs: millis(doc.data().createdAt)
  }));
}

/** Stops the channels at Drive and forgets them. A channel Drive will not stop simply expires by itself. */
async function dropRecords(sourceId, records) {
  await runPool(records, CHANNEL_CONCURRENCY, async record => {
    try {
      await stopChannel({ id: record.id, resourceId: record.resourceId });
    } catch (error) {
      console.warn(`drive: could not stop channel ${record.id}:`, error?.message || error);
    }
    await channelsOf(sourceId).doc(record.id).delete();
  });
}

async function registerChannel(source, fileId, now) {
  const channel = await watchFile({
    fileId,
    channelId: randomUUID(),
    address: webhookAddress(),
    token: channelToken(source.id),
    expirationMs: now + CHANNEL_TTL_MS
  });
  await channelsOf(source.id)
    .doc(channel.id)
    .set({
      fileId,
      resourceId: channel.resourceId,
      expiration: Timestamp.fromMillis(channel.expirationMs),
      createdAt: Timestamp.fromMillis(now)
    });
  return {
    id: channel.id,
    fileId,
    resourceId: channel.resourceId,
    expirationMs: channel.expirationMs,
    createdMs: now
  };
}

/** Ends every channel of a source (the source is being removed, or set to manual-only). */
export async function stopAllChannels(sourceId) {
  await dropRecords(sourceId, await readRecords(sourceId));
}

/**
 * Brings the source's channels in line with what should be watched, and stores the outcome on the source
 * (`webhook`, which the panel shows). `watch` is the list of folder ids from a fresh listing; without it
 * (a scheduler tick) only what is already registered is renewed, plus the source itself.
 * A manual-only source is not watched: it syncs when the admin says so.
 */
export async function syncChannels(source, { watch = null, now = Date.now() } = {}) {
  const records = await readRecords(source.id);
  const unavailable = source.frequency === 'manual' ? null : unavailableReason();
  if (source.frequency === 'manual' || unavailable) {
    await dropRecords(source.id, records);
    return saveSummary(source.id, [], { error: unavailable, retryAt: null, now });
  }

  const targets = [...new Set([source.driveId, ...(watch ?? records.map(r => r.fileId))])].slice(
    0,
    MAX_CHANNELS
  );
  // one channel per target: the longest-lived is kept, strays and channels of vanished folders are stopped
  const kept = new Map();
  const strays = [];
  for (const record of records) {
    const best = kept.get(record.fileId);
    if (!targets.includes(record.fileId)) strays.push(record);
    else if (!best) kept.set(record.fileId, record);
    else if (record.expirationMs > best.expirationMs) {
      strays.push(best);
      kept.set(record.fileId, record);
    } else strays.push(record);
  }
  await dropRecords(source.id, strays);

  const retryAt = millis(source.webhook?.retryAt);
  const backingOff = retryAt != null && retryAt > now;
  let error = null;
  const current = [];
  await runPool(targets, CHANNEL_CONCURRENCY, async fileId => {
    const existing = kept.get(fileId);
    if (existing && !expiring(existing, now)) {
      current.push(existing);
      return;
    }
    // a registration just failed (or failed recently) for a reason that will be the same for the others
    if (error || (backingOff && !existing)) {
      if (existing) current.push(existing);
      return;
    }
    try {
      const created = await registerChannel(source, fileId, now);
      current.push(created);
      if (existing) await dropRecords(source.id, [existing]);
    } catch (registerError) {
      error = describeWatchError(registerError);
      if (existing) current.push(existing);
    }
  });

  return saveSummary(source.id, current, {
    error,
    retryAt: error ? now + RETRY_AFTER_FAILURE_MS : backingOff ? retryAt : null,
    rootId: source.driveId,
    now
  });
}

async function saveSummary(sourceId, channels, { error, retryAt, rootId = null, now }) {
  const live = channels.filter(channel => channel.expirationMs > now);
  const webhook = {
    active: live.some(channel => channel.fileId === rootId),
    channels: channels.length,
    expiresAt: live.length
      ? Timestamp.fromMillis(Math.min(...live.map(channel => channel.expirationMs)))
      : null,
    error,
    retryAt: retryAt == null ? null : Timestamp.fromMillis(retryAt),
    checkedAt: Timestamp.fromMillis(now)
  };
  await updateSource(sourceId, { webhook }).catch(() => {});
  return webhook;
}

/** Stops a channel whose source no longer exists (the webhook still received a notification for it). */
export const stopStrayChannel = (id, resourceId) =>
  resourceId ? stopChannel({ id, resourceId }) : Promise.resolve();
