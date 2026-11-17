/**
 * Tests the source store's transactions (src/drive/sourceStore.js) against a minimal in-memory Firestore:
 * the lease that keeps two runs off the same source, how a finished run schedules the next one, and how a
 * Drive notification makes a source due. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

// ── a minimal Firestore: documents by path, transactions without contention ─────────────────────────────

const data = new Map();
const refOf = path => ({
  path,
  get: async () => ({
    exists: data.has(path),
    data: () => ({ ...data.get(path) }),
    id: path.split('/').pop()
  }),
  update: async fields => {
    if (!data.has(path)) throw new Error(`NOT_FOUND ${path}`);
    data.set(path, { ...data.get(path), ...fields });
  },
  create: async fields => {
    if (data.has(path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    data.set(path, { ...fields });
  },
  collection: name => collectionOf(`${path}/${name}`)
});
const collectionOf = path => ({ doc: id => refOf(`${path}/${id}`) });
const fakeFirestore = {
  collection: collectionOf,
  runTransaction: async fn =>
    fn({
      get: ref => ref.get(),
      update: (ref, fields) => data.set(ref.path, { ...data.get(ref.path), ...fields })
    })
};

const real = await import('firebase-admin/firestore');
mock.module('firebase-admin/firestore', {
  namedExports: { FieldValue: real.FieldValue, Timestamp: real.Timestamp, getFirestore: () => fakeFirestore }
});
const { Timestamp } = real;
const { acquireLease, createSource, finishRun, getSource, noteDriveChange, serializeSource } = await import(
  new URL('../src/drive/sourceStore.js', import.meta.url).href
);

const PATH = 'apps/assistente-7hub/driveSources/s1';
const NOW = Date.parse('2026-06-10T10:00:00Z');
const MIN = 60_000;
const ts = ms => Timestamp.fromMillis(ms);
const stored = () => data.get(PATH);
const millis = field => stored()[field]?.toMillis();

const put = (fields = {}) =>
  data.set(PATH, {
    driveId: 's1',
    kind: 'folder',
    name: 'Moduli',
    frequency: 'hourly',
    dailyHour: 3,
    nextRunAt: ts(NOW - MIN),
    lastRunAt: null,
    lease: null,
    status: 'idle',
    forceSince: null,
    webhookAt: null,
    ...fields
  });
const emptyResult = overrides => ({ added: 0, complete: true, errors: [], ...overrides });

beforeEach(() => {
  data.clear();
  put();
});

// ── lease ────────────────────────────────────────────────────────────────────

test('a lease is taken by one run at a time, and frees itself when it expires', async () => {
  assert.ok(await acquireLease('s1', 'run-1', { now: NOW }));
  assert.equal(stored().status, 'running');
  assert.equal(await acquireLease('s1', 'run-2', { now: NOW + MIN }), null);
  // the first run died: after the lease's ten minutes another may take over
  assert.ok(await acquireLease('s1', 'run-3', { now: NOW + 11 * MIN }));
  assert.equal(stored().lease.owner, 'run-3');
});

test('the scheduler takes a source only when it is due and not manual-only', async () => {
  put({ nextRunAt: ts(NOW + 30 * MIN) });
  assert.equal(await acquireLease('s1', 'a', { onlyIfDue: true, now: NOW }), null);
  put({ nextRunAt: ts(NOW + MIN) }); // within the slack of an early tick
  assert.ok(await acquireLease('s1', 'b', { onlyIfDue: true, now: NOW }));
  put({ frequency: 'manual', nextRunAt: null, lease: null });
  assert.equal(await acquireLease('s1', 'c', { onlyIfDue: true, now: NOW }), null);
  // ...while "Sincronizza ora" does not ask whether it is due
  assert.ok(await acquireLease('s1', 'd', { now: NOW }));
  assert.equal(await acquireLease('gone', 'e', { now: NOW }), null);
});

// ── finishing a run ──────────────────────────────────────────────────────────

const startRun = (owner = 'run-1', now = NOW) => acquireLease('s1', owner, { now });

test('a finished run records its result, frees the lease and schedules the next one from its start', async () => {
  await startRun();
  await finishRun('s1', 'run-1', {
    name: 'Moduli 2026',
    result: emptyResult({ added: 2 }),
    now: NOW + 5 * MIN
  });
  assert.equal(stored().lease, null);
  assert.equal(stored().status, 'idle');
  assert.equal(stored().runError, null);
  assert.equal(stored().name, 'Moduli 2026');
  assert.equal(stored().lastResult.added, 2);
  assert.equal(millis('lastRunAt'), NOW + 5 * MIN);
  assert.equal(millis('nextRunAt'), NOW + 60 * MIN); // hourly, counted from the start, not the end
});

test('a run that lost its lease writes nothing', async () => {
  await startRun('run-1');
  await finishRun('s1', 'someone-else', { result: emptyResult({ added: 9 }), now: NOW + MIN });
  assert.equal(stored().lease.owner, 'run-1');
  assert.equal(stored().lastResult, undefined);
  // and a source removed meanwhile is simply gone
  data.delete(PATH);
  await finishRun('s1', 'run-1', { result: emptyResult(), now: NOW + MIN });
  assert.equal(data.has(PATH), false);
});

test('an unfinished run leaves the source due right away', async () => {
  await startRun();
  await finishRun('s1', 'run-1', {
    result: emptyResult({ complete: false, deferred: 4 }),
    now: NOW + 8 * MIN
  });
  assert.equal(millis('nextRunAt'), NOW + 8 * MIN);
});

test('a Drive notification that arrived during the run keeps the source due', async () => {
  await startRun();
  await noteDriveChange('s1', NOW + 2 * MIN);
  await finishRun('s1', 'run-1', { result: emptyResult(), now: NOW + 5 * MIN });
  assert.equal(millis('nextRunAt'), NOW + 5 * MIN);
});

test('a failed run is tried again within the hour, whatever the frequency', async () => {
  put({ frequency: 'weekly' });
  await startRun();
  await finishRun('s1', 'run-1', {
    result: emptyResult({ complete: true }),
    runError: 'Drive nega l’accesso.',
    now: NOW + MIN
  });
  assert.equal(stored().status, 'error');
  assert.equal(stored().runError, 'Drive nega l’accesso.');
  assert.equal(millis('nextRunAt'), NOW + 61 * MIN);
});

test('a manual-only source is never scheduled by a run', async () => {
  put({ frequency: 'manual', nextRunAt: null });
  await startRun();
  await finishRun('s1', 'run-1', { result: emptyResult(), now: NOW + MIN });
  assert.equal(stored().nextRunAt, null);
});

test('"Reindicizza tutto" is forgotten only when the run finished and nobody asked again', async () => {
  put({ forceSince: ts(NOW - 5 * MIN) });
  await startRun();
  await finishRun('s1', 'run-1', {
    result: emptyResult({ complete: false }),
    forceUsed: NOW - 5 * MIN,
    now: NOW + MIN
  });
  assert.ok(stored().forceSince); // unfinished: carries on next time

  await startRun('run-2', NOW + 2 * MIN);
  await finishRun('s1', 'run-2', { result: emptyResult(), forceUsed: NOW - 5 * MIN, now: NOW + 3 * MIN });
  assert.equal(stored().forceSince, null);

  // someone asked again while it ran: that request stays
  put({ forceSince: ts(NOW - 5 * MIN) });
  await startRun('run-3', NOW + 4 * MIN);
  data.set(PATH, { ...stored(), forceSince: ts(NOW + 5 * MIN) });
  await finishRun('s1', 'run-3', { result: emptyResult(), forceUsed: NOW - 5 * MIN, now: NOW + 6 * MIN });
  assert.equal(millis('forceSince'), NOW + 5 * MIN);
});

// ── notifications ────────────────────────────────────────────────────────────

test('a notification makes the source due now', async () => {
  put({ nextRunAt: ts(NOW + 50 * MIN) });
  assert.equal(await noteDriveChange('s1', NOW), 'queued');
  assert.equal(millis('nextRunAt'), NOW);
  assert.equal(millis('webhookAt'), NOW);
});

test('a burst of notifications is one request, and later ones are noted again', async () => {
  put({ nextRunAt: ts(NOW + 50 * MIN) });
  assert.equal(await noteDriveChange('s1', NOW), 'queued');
  assert.equal(await noteDriveChange('s1', NOW + 5_000), 'debounced');
  assert.equal(millis('webhookAt'), NOW);
  assert.equal(await noteDriveChange('s1', NOW + 31_000), 'queued');
});

test('a manual-only source ignores notifications, and an unknown one is reported', async () => {
  put({ frequency: 'manual', nextRunAt: null });
  assert.equal(await noteDriveChange('s1', NOW), 'ignored');
  assert.equal(stored().webhookAt, null);
  assert.equal(await noteDriveChange('nope', NOW), 'missing');
});

// ── what the browser sees ────────────────────────────────────────────────────

test('serializeSource shows a live run as running and a dead one as interrupted', async () => {
  await startRun();
  const live = serializeSource(await getSource('s1'), NOW + MIN);
  assert.equal(live.status, 'running');
  assert.deepEqual(live.progress, { phase: 'listing', done: 0, total: 0 });
  assert.equal('lease' in live, false);

  const dead = serializeSource(await getSource('s1'), NOW + 11 * MIN);
  assert.equal(dead.status, 'error');
  assert.match(dead.runError, /si è interrotta/);
  assert.equal(dead.progress, null);
});

test('serializeSource turns timestamps into milliseconds and keeps only what the panel needs', async () => {
  put({
    lastRunAt: ts(NOW),
    webhook: { active: true, channels: 3, expiresAt: ts(NOW + 20 * 60 * MIN), error: null, retryAt: null },
    forceSince: ts(NOW)
  });
  const view = serializeSource(await getSource('s1'), NOW);
  assert.equal(view.lastRunAt, NOW);
  assert.equal(view.nextRunAt, NOW - MIN);
  assert.deepEqual(view.webhook, { active: true, channels: 3, expiresAt: NOW + 20 * 60 * MIN, error: null });
  assert.equal(view.reindexPending, true);
  assert.equal(view.status, 'idle');
});

test('creating a source twice is refused, and a new one is due at once unless manual', async () => {
  data.clear();
  const fields = { driveId: 's1', kind: 'file', name: 'a.pdf', url: 'u', dailyHour: 3, createdBy: 'x@y.it' };
  await createSource('s1', { ...fields, frequency: 'hourly' });
  assert.ok(stored().nextRunAt);
  await assert.rejects(() => createSource('s1', { ...fields, frequency: 'hourly' }), { code: 6 });
  data.clear();
  await createSource('s1', { ...fields, frequency: 'manual' });
  assert.equal(stored().nextRunAt, null);
});
