/**
 * The browser side of the Google Drive sources: every read and write goes through the `drive` Cloud
 * Function (`functions/src/http/driveEndpoint.js`), admin only. The sources and their state are not in
 * Firestore rules' reach on purpose; the documents they create are, and the Documents tab reads those live.
 *
 * Timestamps come back as epoch milliseconds; `withTimestamps` wraps them so the components can use
 * `formatTimestamp` like everywhere else.
 */
'use client';

import { callFunction } from '@/shared/firebase/functions';

const timestamp = ms => (ms == null ? null : { toMillis: () => ms, toDate: () => new Date(ms) });

// the scheduler wakes up every 15 minutes: a source whose time has come waits for the next tick
const DUE_SLACK_MS = 2 * 60_000;

const withTimestamps = source => ({
  ...source,
  // worked out here, when the answer arrives, not while a component renders
  due: source.nextRunAt != null && source.nextRunAt <= Date.now() + DUE_SLACK_MS,
  createdAt: timestamp(source.createdAt),
  lastRunAt: timestamp(source.lastRunAt),
  nextRunAt: timestamp(source.nextRunAt),
  webhook: { ...source.webhook, expiresAt: timestamp(source.webhook?.expiresAt) }
});

/** `{ serviceAccountEmail, sources }`: the address to share with, and every source with its status. */
export async function listDriveSources() {
  const { serviceAccountEmail, sources } = await callFunction('drive', 'list');
  return { serviceAccountEmail, sources: sources.map(withTimestamps) };
}

/** Links a folder or a PDF from the pasted link; the server checks it can read it. */
export async function addDriveSource({ link, frequency, dailyHour }) {
  const { source } = await callFunction('drive', 'add', { link, frequency, dailyHour });
  return withTimestamps(source);
}

export async function updateDriveSource(id, { frequency, dailyHour }) {
  const { source } = await callFunction('drive', 'update', { id, frequency, dailyHour });
  return withTimestamps(source);
}

/** Unlinks the source; its documents leave the archive. */
export const removeDriveSource = id => callFunction('drive', 'remove', { id });

/**
 * Runs the source now. Resolves when the run is over, which can take minutes: the panel shows progress
 * from `listDriveSources` meanwhile. With `force`, every file's card is written again.
 */
export async function syncDriveSource(id, { force = false } = {}) {
  const { source } = await callFunction('drive', 'syncNow', { id, force });
  return withTimestamps(source);
}
