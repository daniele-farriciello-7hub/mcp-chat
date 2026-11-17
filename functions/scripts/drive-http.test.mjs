/**
 * Tests the two HTTP entry points of the Drive sync — the admin API (`drive`) and the public webhook
 * (`driveWebhook`) — with the store, Drive and the run faked: who may call, what is validated, what is
 * written, and how a notification is answered. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/${file}`, import.meta.url).href;
const real = await import('firebase-admin/firestore');
const { Timestamp } = real;
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const SA = '123-compute@developer.gserviceaccount.com';

// ── fakes ────────────────────────────────────────────────────────────────────

const world = {};
function reset() {
  Object.assign(world, {
    user: { uid: 'u1', email: 'admin@weunit.it', canUse: true, isAdmin: true },
    sources: new Map(), // id -> stored fields
    meta: {
      id: ID,
      name: 'Moduli',
      mimeType: 'application/vnd.google-apps.folder',
      trashed: false,
      webViewLink: 'https://drive.google.com/drive/folders/x'
    },
    metaError: null,
    updates: [],
    stoppedChannels: [],
    runs: [],
    runResult: { complete: true },
    removeResult: 2,
    noted: [],
    noteOutcome: 'queued',
    strayStops: [],
    validToken: 's1'
  });
}
reset();

class InvalidTokenError extends Error {}
mock.module('firebase-admin/firestore', {
  namedExports: { FieldValue: real.FieldValue, Timestamp, getFirestore: () => ({}) }
});
mock.module(src('auth/firebaseUser.js'), {
  namedExports: {
    InvalidTokenError,
    verifyAppUser: async token => {
      if (token === 'bad') throw new InvalidTokenError('invalid or expired Firebase token');
      return world.user;
    }
  }
});
mock.module(src('drive/driveClient.js'), {
  namedExports: {
    FOLDER_MIME_TYPE: 'application/vnd.google-apps.folder',
    PDF_MIME_TYPE: 'application/pdf',
    serviceAccountEmail: async () => SA,
    getFileMeta: async () => {
      if (world.metaError) throw Object.assign(new Error('nope'), { status: world.metaError });
      return world.meta;
    },
    // the channels module is mocked below; these are only here for modules that import them
    describeDriveError: error => error.message,
    stopChannel: async () => {},
    watchFile: async () => ({})
  }
});
mock.module(src('drive/channels.js'), {
  namedExports: {
    stopAllChannels: async id => void world.stoppedChannels.push(id),
    verifyChannelToken: token => (token === 'good' ? world.validToken : null),
    stopStrayChannel: async (id, resourceId) => void world.strayStops.push([id, resourceId])
  }
});
mock.module(src('drive/sourceStore.js'), {
  namedExports: {
    listSources: async () => [...world.sources].map(([id, fields]) => ({ id, ...fields })),
    getSource: async id => (world.sources.has(id) ? { id, ...world.sources.get(id) } : null),
    createSource: async (id, fields) => {
      if (world.sources.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      world.sources.set(id, fields);
    },
    updateSource: async (id, fields) => {
      world.updates.push(fields);
      world.sources.set(id, { ...world.sources.get(id), ...fields });
    },
    serializeSource: source => ({ id: source.id, name: source.name, frequency: source.frequency }),
    noteDriveChange: async id => {
      world.noted.push(id);
      return world.noteOutcome;
    }
  }
});
mock.module(src('drive/syncSource.js'), {
  namedExports: {
    makeBudget: () => ({}),
    removeSource: async () => world.removeResult,
    runSource: async (id, options) => {
      world.runs.push({ id, ...options });
      return world.runResult;
    }
  }
});

const { handleDriveRequest } = await import(src('http/driveEndpoint.js'));
const { handleDriveWebhook } = await import(src('http/driveWebhookEndpoint.js'));

const call = async (handler, { path = '/', body = {}, headers = {}, method = 'POST' } = {}) => {
  const req = { method, path, body, get: name => headers[name] };
  const res = {
    code: null,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    set() {}
  };
  await handler(req, res);
  return res;
};
const api = (action, body, headers = { Authorization: 'Bearer ok' }) =>
  call(handleDriveRequest, { path: `/${action}`, body, headers });

const seed = (fields = {}) =>
  world.sources.set('s1', {
    driveId: 's1',
    kind: 'folder',
    name: 'Moduli',
    frequency: 'hourly',
    dailyHour: 3,
    lastRunAt: null,
    ...fields
  });

beforeEach(reset);

// ── the admin API ────────────────────────────────────────────────────────────

test('only a signed-in admin may call it', async () => {
  assert.equal((await call(handleDriveRequest, { path: '/list' })).code, 401);
  assert.equal((await api('list', {}, { Authorization: 'Bearer bad' })).code, 401);
  world.user = { ...world.user, isAdmin: false };
  assert.equal((await api('list')).code, 403);
  world.user = { ...world.user, canUse: false, isAdmin: true };
  assert.equal((await api('list')).code, 403);
  world.user = { ...world.user, canUse: true, isAdmin: true };
  assert.equal((await api('nope')).code, 404);
  assert.equal((await call(handleDriveRequest, { path: '/list', method: 'GET' })).code, 405);
  assert.equal(
    (await call(handleDriveRequest, { path: '/list', headers: { Origin: 'https://evil.example' } })).code,
    403
  );
});

test('list answers with the address to share with and the sources by name', async () => {
  seed({ name: 'Zeta' });
  world.sources.set('s2', { driveId: 's2', name: 'Alfa', frequency: 'daily' });
  const response = await api('list');
  assert.equal(response.body.serviceAccountEmail, SA);
  assert.deepEqual(
    response.body.sources.map(s => s.name),
    ['Alfa', 'Zeta']
  );
});

test('add links a folder from a pasted link', async () => {
  const response = await api('add', {
    link: `https://drive.google.com/drive/folders/${ID}?usp=sharing`,
    frequency: 'daily',
    dailyHour: 5
  });
  assert.equal(response.code, 200);
  const stored = world.sources.get(ID);
  assert.equal(stored.kind, 'folder');
  assert.equal(stored.frequency, 'daily');
  assert.equal(stored.dailyHour, 5);
  assert.equal(stored.createdBy, 'admin@weunit.it');
  assert.equal(stored.url, 'https://drive.google.com/drive/folders/x');
});

test('add links a single PDF, and nothing else', async () => {
  world.meta = { ...world.meta, mimeType: 'application/pdf' };
  assert.equal((await api('add', { link: ID, frequency: 'hourly' })).code, 200);
  assert.equal(world.sources.get(ID).kind, 'file');

  world.sources.clear();
  world.meta = { ...world.meta, mimeType: 'application/vnd.google-apps.document' };
  const doc = await api('add', { link: ID, frequency: 'hourly' });
  assert.equal(doc.code, 400);
  assert.match(doc.body.error, /solo cartelle e file PDF/);
  assert.equal(world.sources.size, 0);
});

test('add explains what is wrong: a bad link, a bad frequency, nothing shared, the bin, a duplicate', async () => {
  assert.match((await api('add', { link: 'pippo', frequency: 'hourly' })).body.error, /Non riconosco/);
  assert.equal((await api('add', { link: ID, frequency: 'every-second' })).code, 400);

  world.metaError = 404;
  const hidden = await api('add', { link: ID, frequency: 'hourly' });
  assert.equal(hidden.code, 400);
  assert.ok(hidden.body.error.includes(SA)); // tells where to share it
  world.metaError = null;

  world.meta = { ...world.meta, trashed: true };
  assert.match((await api('add', { link: ID, frequency: 'hourly' })).body.error, /cestino/);
  world.meta = { ...world.meta, trashed: false };

  assert.equal((await api('add', { link: ID, frequency: 'hourly' })).code, 200);
  assert.equal((await api('add', { link: ID, frequency: 'hourly' })).code, 409);
});

test('update changes the frequency; an interval counts from the last run, a time of day from now', async () => {
  const lastRun = Date.now() - 10 * 60_000;
  seed({ lastRunAt: Timestamp.fromMillis(lastRun) });
  await api('update', { id: 's1', frequency: 'every15min' });
  assert.equal(world.updates.at(-1).frequency, 'every15min');
  assert.equal(world.updates.at(-1).nextRunAt.toMillis(), lastRun + 15 * 60_000);

  await api('update', { id: 's1', frequency: 'daily', dailyHour: 7 });
  const daily = world.updates.at(-1);
  assert.equal(daily.dailyHour, 7);
  assert.ok(daily.nextRunAt.toMillis() > Date.now());
  assert.ok(daily.nextRunAt.toMillis() <= Date.now() + 24 * 3_600_000);

  assert.equal((await api('update', { id: 's1', frequency: 'nonsense' })).code, 400);
  assert.equal((await api('update', { id: 'nope', frequency: 'daily' })).code, 404);
});

test('switching to manual-only clears the schedule and ends the notification channels', async () => {
  seed();
  await api('update', { id: 's1', frequency: 'manual' });
  assert.equal(world.updates.at(-1).nextRunAt, null);
  assert.deepEqual(world.stoppedChannels, ['s1']);
});

test('remove answers with how many documents left, and refuses while a run is working', async () => {
  seed();
  assert.deepEqual((await api('remove', { id: 's1' })).body, { removed: 2 });
  world.removeResult = null;
  const busy = await api('remove', { id: 's1' });
  assert.equal(busy.code, 409);
});

test('syncNow runs the source now and answers with it; force asks for every card to be redone', async () => {
  seed();
  const plain = await api('syncNow', { id: 's1' });
  assert.equal(plain.code, 200);
  assert.deepEqual(
    world.runs.map(({ id, trigger, onlyIfDue }) => ({ id, trigger, onlyIfDue })),
    [{ id: 's1', trigger: 'manual', onlyIfDue: undefined }]
  );
  assert.equal(world.updates.length, 0);

  await api('syncNow', { id: 's1', force: true });
  assert.ok(world.updates.at(-1).forceSince instanceof Timestamp);
});

test('syncNow on a source already being worked on says so, and keeps the reindex request', async () => {
  seed();
  world.runResult = null;
  const busy = await api('syncNow', { id: 's1', force: true });
  assert.equal(busy.code, 409);
  assert.match(busy.body.error, /reindicizzazione partirà al prossimo giro/);
  assert.ok(world.updates.at(-1).forceSince);
  assert.match((await api('syncNow', { id: 's1' })).body.error, /già in corso/);
});

// ── the webhook ──────────────────────────────────────────────────────────────

const notify = (headers, method = 'POST') => call(handleDriveWebhook, { method, headers });

test('a notification with a good token marks the source due and is answered quickly', async () => {
  const response = await notify({ 'X-Goog-Channel-Token': 'good', 'X-Goog-Resource-State': 'update' });
  assert.equal(response.code, 200);
  assert.deepEqual(world.noted, ['s1']);
});

test('a call without a valid token is refused and does nothing', async () => {
  assert.equal((await notify({})).code, 403);
  assert.equal((await notify({ 'X-Goog-Channel-Token': 'forged' })).code, 403);
  assert.equal((await notify({ 'X-Goog-Channel-Token': 'good' }, 'GET')).code, 405);
  assert.deepEqual(world.noted, []);
});

test('the handshake Drive sends after a channel is created changes nothing', async () => {
  const response = await notify({ 'X-Goog-Channel-Token': 'good', 'X-Goog-Resource-State': 'sync' });
  assert.equal(response.code, 200);
  assert.deepEqual(world.noted, []);
});

test('a channel of a source that no longer exists is stopped', async () => {
  world.noteOutcome = 'missing';
  const response = await notify({
    'X-Goog-Channel-Token': 'good',
    'X-Goog-Resource-State': 'update',
    'X-Goog-Channel-ID': 'chan-1',
    'X-Goog-Resource-ID': 'res-1'
  });
  assert.equal(response.code, 200);
  assert.deepEqual(world.strayStops, [['chan-1', 'res-1']]);
});
