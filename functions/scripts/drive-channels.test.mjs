/**
 * Tests how a source's Drive notification channels are registered, renewed and dropped
 * (src/drive/channels.js), with Drive and the store faked: what is watched, when a channel is renewed,
 * and what the panel is told when Google refuses. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { PRODUCTION_APP, forApp } from '../src/appContext.js';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-06-10T10:00:00Z');
const real = await import('firebase-admin/firestore');
const { Timestamp } = real;

// ── fakes ────────────────────────────────────────────────────────────────────

const world = {};
function reset() {
  Object.assign(world, {
    records: new Map(), // channel id -> stored fields
    summary: null, // what was written on the source
    watched: [], // files.watch calls
    stopped: [], // channels.stop calls
    watchError: null,
    nextId: 1
  });
}
reset();

const storedRecord = (fileId, { id, expiresInMs, createdAgoMs = HOUR }) =>
  world.records.set(id, {
    fileId,
    resourceId: `res-${id}`,
    expiration: Timestamp.fromMillis(NOW + expiresInMs),
    createdAt: Timestamp.fromMillis(NOW - createdAgoMs)
  });

const src = file => new URL(`../src/drive/${file}`, import.meta.url).href;
mock.module(src('sourceStore.js'), {
  namedExports: {
    channelsOf: () => ({
      get: async () => ({ docs: [...world.records].map(([id, fields]) => ({ id, data: () => fields })) }),
      doc: id => ({
        set: async fields => void world.records.set(id, fields),
        delete: async () => void world.records.delete(id)
      })
    }),
    updateSource: async (_id, fields) => void (world.summary = fields.webhook)
  }
});
mock.module(src('driveClient.js'), {
  namedExports: {
    describeDriveError: error => `Errore: ${error.message}`,
    watchFile: async ({ fileId, channelId, address, token, expirationMs }) => {
      if (world.watchError) throw new Error(world.watchError);
      world.watched.push({ fileId, channelId, address, token, expirationMs });
      return { id: channelId, resourceId: `res-${channelId}`, expirationMs };
    },
    stopChannel: async channel => void world.stopped.push(channel.id)
  }
});

const { syncChannels, verifyChannelToken } = await import(src('channels.js'));
const sync = (source, options) =>
  forApp(PRODUCTION_APP, () => syncChannels(source, { now: NOW, ...options }))();
const source = (overrides = {}) => ({
  id: 's1',
  driveId: 'root',
  frequency: 'hourly',
  webhook: {},
  ...overrides
});

beforeEach(() => {
  reset();
  process.env.DB_CRED_KEY = Buffer.alloc(32, 3).toString('base64');
  delete process.env.FUNCTIONS_EMULATOR;
});

// ── tests ────────────────────────────────────────────────────────────────────

test('a folder and its sub-folders each get a channel, pointing at the webhook with a verifiable token', async () => {
  const summary = await sync(source(), { watch: ['root', 'a', 'b'] });

  assert.deepEqual(world.watched.map(w => w.fileId).sort(), ['a', 'b', 'root']);
  const first = world.watched[0];
  assert.equal(first.address, 'https://europe-west1-mappa-contatti-217007.cloudfunctions.net/driveWebhook');
  assert.equal(first.expirationMs, NOW + 24 * HOUR);
  assert.equal(forApp(PRODUCTION_APP, () => verifyChannelToken(first.token))(), 's1');
  assert.equal(world.records.size, 3);
  assert.equal(summary.active, true);
  assert.equal(summary.channels, 3);
  assert.equal(summary.error, null);
  assert.equal(summary.expiresAt.toMillis(), NOW + 24 * HOUR);
});

test('a healthy channel is left alone; one near expiry is renewed, the old one stopped afterwards', async () => {
  storedRecord('root', { id: 'healthy', expiresInMs: 20 * HOUR });
  storedRecord('a', { id: 'old', expiresInMs: 2 * HOUR, createdAgoMs: 22 * HOUR });
  await sync(source(), { watch: ['root', 'a'] });

  assert.deepEqual(
    world.watched.map(w => w.fileId),
    ['a']
  );
  assert.deepEqual(world.stopped, ['old']);
  assert.equal(world.records.has('old'), false);
  assert.equal(world.records.has('healthy'), true);
  assert.equal(world.records.size, 2);
});

test('an expired channel is registered again', async () => {
  storedRecord('root', { id: 'dead', expiresInMs: -HOUR, createdAgoMs: 25 * HOUR });
  const summary = await sync(source(), { watch: ['root'] });
  assert.equal(world.watched.length, 1);
  assert.equal(summary.active, true);
});

test('on a scheduler tick only what is registered is renewed, plus the source itself', async () => {
  storedRecord('a', { id: 'near', expiresInMs: HOUR, createdAgoMs: 23 * HOUR });
  await sync(source());
  assert.deepEqual(world.watched.map(w => w.fileId).sort(), ['a', 'root']);
});

test('channels of a folder that is gone are stopped', async () => {
  storedRecord('root', { id: 'r', expiresInMs: 20 * HOUR });
  storedRecord('deleted-folder', { id: 'x', expiresInMs: 20 * HOUR });
  const summary = await sync(source(), { watch: ['root'] });
  assert.deepEqual(world.stopped, ['x']);
  assert.equal(summary.channels, 1);
});

test('two channels for one folder: only the longest-lived stays', async () => {
  storedRecord('root', { id: 'short', expiresInMs: 10 * HOUR });
  storedRecord('root', { id: 'long', expiresInMs: 20 * HOUR });
  await sync(source(), { watch: ['root'] });
  assert.deepEqual(world.stopped, ['short']);
  assert.deepEqual([...world.records.keys()], ['long']);
});

test('when Google refuses, the reason is kept, the source falls back to polling and is not retried at once', async () => {
  world.watchError = 'WebHook callback channel is unauthorized: webhookUrlUnauthorized';
  const refused = await sync(source(), { watch: ['root', 'a', 'b'] });
  assert.equal(refused.active, false);
  assert.equal(refused.channels, 0);
  assert.match(refused.error, /dominio non verificato/);
  assert.equal(refused.retryAt.toMillis(), NOW + 6 * HOUR);
  assert.equal(world.records.size, 0);

  // the next tick, within the back-off, does not call Drive again
  world.watchError = null;
  const again = await sync(source({ webhook: { retryAt: refused.retryAt } }), { now: NOW + HOUR });
  assert.deepEqual(world.watched, []);
  assert.equal(again.error, null);
  assert.equal(again.retryAt.toMillis(), NOW + 6 * HOUR);

  // after the back-off it tries, and succeeds
  const later = await sync(source({ webhook: { retryAt: refused.retryAt } }), { now: NOW + 7 * HOUR });
  assert.equal(world.watched.length, 1);
  assert.equal(later.active, true);
  assert.equal(later.retryAt, null);
});

test('a failed renewal keeps the channel that still works', async () => {
  storedRecord('root', { id: 'old', expiresInMs: 2 * HOUR, createdAgoMs: 22 * HOUR });
  world.watchError = 'Drive nega';
  const summary = await sync(source(), { watch: ['root'] });
  assert.equal(world.records.has('old'), true);
  assert.equal(summary.active, true);
  assert.match(summary.error, /Drive nega/);
  assert.deepEqual(world.stopped, []);
});

test('a manual-only source is not watched, and its channels end', async () => {
  storedRecord('root', { id: 'r', expiresInMs: 20 * HOUR });
  const summary = await sync(source({ frequency: 'manual' }), { watch: ['root'] });
  assert.deepEqual(world.stopped, ['r']);
  assert.equal(world.records.size, 0);
  assert.equal(summary.active, false);
  assert.equal(summary.error, null);
  assert.deepEqual(world.watched, []);
});

test('where notifications cannot arrive, nothing is registered and the panel is told why', async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const emulator = await sync(source(), { watch: ['root'] });
  assert.match(emulator.error, /emulatore/);
  delete process.env.FUNCTIONS_EMULATOR;
  delete process.env.DB_CRED_KEY;
  const noKey = await sync(source(), { watch: ['root'] });
  assert.match(noKey.error, /Chiave/);
  assert.deepEqual(world.watched, []);
});

test('no more channels than the limit: the rest of the folders rely on polling', async () => {
  const folders = Array.from({ length: 130 }, (_, i) => `f${i}`);
  const summary = await sync(source(), { watch: ['root', ...folders] });
  assert.equal(world.watched.length, 100);
  assert.equal(
    world.watched.some(w => w.fileId === 'root'),
    true
  );
  assert.equal(summary.channels, 100);
});

test('the development twin registers its own webhook', async () => {
  const { DEVELOPMENT_APP } = await import('../src/appContext.js');
  await forApp(DEVELOPMENT_APP, () => syncChannels(source(), { now: NOW, watch: ['root'] }))();
  assert.match(world.watched[0].address, /\/driveWebhookDev$/);
});
