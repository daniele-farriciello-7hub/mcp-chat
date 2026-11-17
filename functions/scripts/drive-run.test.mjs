/**
 * Tests the sync run (src/drive/syncSource.js) against an in-memory world: a fake Drive listing, archive,
 * Storage, Gemini and source store, wired in with module mocks. It checks what the run decides and
 * counts — adds, updates, removals, skips, failures, deadlines — not Google's services, which these tests
 * cannot reach. Run: npm test (needs Node 22's --experimental-test-module-mocks, set in the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const drive = file => new URL(`../src/drive/${file}`, import.meta.url).href;
const MAX = 20 * 1024 * 1024;

// ── the fake world ───────────────────────────────────────────────────────────

const world = {};
function reset() {
  Object.assign(world, {
    source: { id: 's1', driveId: 'root', kind: 'folder', frequency: 'hourly', forceSince: null },
    listing: {
      name: 'Moduli',
      files: [],
      folders: [{ id: 'root', path: '' }],
      ignored: 0,
      complete: true,
      problems: []
    },
    docs: new Map(), // the archive: id -> fields
    storage: new Set(), // paths
    bytes: {}, // drive file id -> Buffer (missing = the download fails)
    downloads: [],
    indexed: [],
    failIndex: new Set(), // document ids Gemini fails on
    detached: [],
    finished: null,
    channelCalls: [],
    listingError: null,
    busy: false
  });
}
reset();

const SERVER_TS = { serverTimestamp: true };
const applyWrite = (id, fields, source) => {
  const current = world.docs.get(id) || {};
  const next = { ...current };
  for (const [key, value] of Object.entries(fields)) {
    if (value?.arrayUnion) next[key] = [...new Set([...(current[key] || []), ...value.arrayUnion])];
    else next[key] = value;
  }
  world.docs.set(id, next);
};

mock.module('firebase-admin/firestore', {
  namedExports: {
    FieldValue: { serverTimestamp: () => SERVER_TS, arrayUnion: (...items) => ({ arrayUnion: items }) },
    Timestamp: {},
    getFirestore: () => {
      throw new Error('Firestore must not be reached in this test');
    }
  }
});
mock.module(drive('archive.js'), {
  namedExports: {
    INDEXING_STATUS: { pending: 'pending', done: 'done', failed: 'failed' },
    MAX_FILE_SIZE_BYTES: MAX,
    nameKey: name =>
      String(name || '')
        .trim()
        .toLowerCase(),
    driveDocumentId: fileId => `drive-${fileId}`,
    storagePathFor: (id, name) => `app/documents/${id}/${name}`,
    documentRef: id => ({
      set: async fields => world.docs.set(id, { ...fields }),
      update: async fields => applyWrite(id, fields)
    }),
    documentsCollection: () => {
      throw new Error('not used by a run');
    },
    loadArchive: async () => new Map([...world.docs].map(([id, data]) => [id, { ...data }])),
    saveFile: async path => void world.storage.add(path),
    deleteFile: async path => void world.storage.delete(path),
    fileExists: async path => world.storage.has(path),
    detachFromSource: async (id, sourceId) => {
      world.detached.push(id);
      const doc = world.docs.get(id);
      const remaining = (doc.driveSourceIds || []).filter(s => s !== sourceId);
      if (remaining.length) {
        doc.driveSourceIds = remaining;
        return false;
      }
      world.docs.delete(id);
      return true;
    }
  }
});
mock.module(drive('driveClient.js'), {
  namedExports: {
    PDF_MIME_TYPE: 'application/pdf',
    downloadFile: async id => {
      world.downloads.push(id);
      if (!world.bytes[id]) throw Object.assign(new Error('not found'), { status: 404 });
      return world.bytes[id];
    }
  }
});
mock.module(drive('indexer.js'), {
  namedExports: {
    loadIndexingSettings: async () => ({ modelId: 'test-model' }),
    indexDocument: async document => {
      world.indexed.push(document.id);
      if (world.failIndex.has(document.id)) throw new Error('503 UNAVAILABLE');
      applyWrite(document.id, { indexingStatus: 'done', indexCard: { summary: 'x' }, indexedAt: SERVER_TS });
    }
  }
});
class FakeListingError extends Error {}
mock.module(drive('listing.js'), {
  namedExports: {
    ListingError: FakeListingError,
    listSource: async () => {
      if (world.listingError) throw new FakeListingError(world.listingError);
      return world.listing;
    }
  }
});
mock.module(drive('channels.js'), {
  namedExports: {
    syncChannels: async (source, options) => void world.channelCalls.push(options),
    stopAllChannels: async () => {}
  }
});
mock.module(drive('sourceStore.js'), {
  namedExports: {
    acquireLease: async () => (world.busy ? null : world.source),
    finishRun: async (_id, _owner, args) => void (world.finished = args),
    reportProgress: async () => {},
    deleteSource: async () => {},
    updateSource: async () => {}
  }
});

const { makeBudget, runSource } = await import(drive('syncSource.js'));

// ── helpers ──────────────────────────────────────────────────────────────────

const pdf = (id, overrides = {}) => ({
  id,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 100,
  version: '1',
  md5: `md5-${id}`,
  modifiedTime: '2026-06-01T00:00:00.000Z',
  webViewLink: `https://drive.google.com/file/d/${id}/view`,
  path: '',
  ...overrides
});
const run = (options = {}) => runSource('s1', { trigger: 'manual', budget: makeBudget(), ...options });

beforeEach(reset);

// ── tests ────────────────────────────────────────────────────────────────────

test('a new PDF is downloaded, stored, written as a document and indexed', async () => {
  world.listing.files = [pdf('a', { path: 'Moduli/2026' })];
  world.bytes.a = Buffer.from('%PDF-a');
  const result = await run();

  assert.equal(result.added, 1);
  assert.equal(result.complete, true);
  assert.deepEqual(world.downloads, ['a']);
  assert.deepEqual(world.indexed, ['drive-a']);
  assert.ok(world.storage.has('app/documents/drive-a/a.pdf'));
  const doc = world.docs.get('drive-a');
  assert.equal(doc.source, 'drive');
  assert.equal(doc.mimeType, 'application/pdf');
  assert.equal(doc.sizeBytes, 6);
  assert.equal(doc.indexingStatus, 'done');
  assert.deepEqual(doc.driveSourceIds, ['s1']);
  assert.equal(doc.driveFileId, 'a');
  assert.equal(doc.driveMd5, 'md5-a');
  assert.equal(doc.drivePath, 'Moduli/2026');
  assert.equal(doc.driveWebViewLink, 'https://drive.google.com/file/d/a/view');
  assert.equal(world.finished.name, 'Moduli');
  assert.equal(world.finished.runError, null);
});

test('a second run with nothing changed downloads and indexes nothing', async () => {
  world.listing.files = [pdf('a')];
  world.bytes.a = Buffer.from('%PDF-a');
  await run();
  world.downloads.length = 0;
  world.indexed.length = 0;
  const result = await run();
  assert.equal(result.unchanged, 1);
  assert.equal(result.added + result.updated + result.removed, 0);
  assert.deepEqual(world.downloads, []);
  assert.deepEqual(world.indexed, []);
});

test('a changed file is downloaded again and gets a new card', async () => {
  world.listing.files = [pdf('a')];
  world.bytes.a = Buffer.from('%PDF-a');
  await run();
  world.listing.files = [pdf('a', { md5: 'new', version: '2', size: 200 })];
  world.bytes.a = Buffer.from('%PDF-a-v2');
  world.indexed.length = 0;
  const result = await run();
  assert.equal(result.updated, 1);
  assert.deepEqual(world.indexed, ['drive-a']);
  assert.equal(world.docs.get('drive-a').driveMd5, 'new');
  assert.equal(world.docs.get('drive-a').sizeBytes, 9);
  assert.equal(world.docs.get('drive-a').indexingStatus, 'done');
});

test('a rename alone changes the name without a download or a new card', async () => {
  world.listing.files = [pdf('a')];
  world.bytes.a = Buffer.from('%PDF-a');
  await run();
  world.listing.files = [pdf('a', { name: 'Nuovo nome.pdf', version: '2' })];
  world.downloads.length = 0;
  world.indexed.length = 0;
  const result = await run();
  assert.equal(result.updated, 1);
  assert.deepEqual(world.downloads, []);
  assert.deepEqual(world.indexed, []);
  assert.equal(world.docs.get('drive-a').name, 'Nuovo nome.pdf');
});

test('a PDF over 20 MB and a name taken by an upload are skipped, with their reasons', async () => {
  world.docs.set('upload-1', { source: 'upload', name: 'Guida.PDF', indexingStatus: 'done' });
  world.listing.files = [
    pdf('big', { size: MAX + 1, path: 'Grandi' }),
    pdf('dup', { name: 'guida.pdf' }),
    pdf('ok')
  ];
  world.bytes.ok = Buffer.from('%PDF-ok');
  const result = await run();

  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(
    result.errors.map(({ name, reason, kind }) => ({ name, reason, kind })),
    [
      { name: 'Grandi/big.pdf', reason: 'supera i 20 MB', kind: 'skipped' },
      { name: 'guida.pdf', reason: 'esiste già un documento caricato con questo nome', kind: 'skipped' }
    ]
  );
  assert.equal(world.docs.has('drive-big'), false);
  assert.equal(world.docs.has('drive-dup'), false);
  assert.equal(world.docs.get('upload-1').name, 'Guida.PDF'); // untouched
});

test('two Drive files with the same name: one is imported, the other is skipped', async () => {
  world.listing.files = [pdf('a', { name: 'Modulo.pdf' }), pdf('b', { name: 'modulo.pdf', path: 'Altra' })];
  world.bytes.a = Buffer.from('%PDF-a');
  world.bytes.b = Buffer.from('%PDF-b');
  const result = await run();
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.errors[0].reason, 'esiste già un documento con questo nome');
});

test('a file that left Drive is removed from the archive, and its name is free again', async () => {
  world.listing.files = [pdf('a', { name: 'Guida.pdf' })];
  world.bytes.a = Buffer.from('%PDF-a');
  await run();
  // gone from Drive, and another file takes its name in the same run
  world.listing.files = [pdf('b', { name: 'Guida.pdf' })];
  world.bytes.b = Buffer.from('%PDF-b');
  const result = await run();
  assert.equal(result.removed, 1);
  assert.equal(result.added, 1);
  assert.equal(world.docs.has('drive-a'), false);
  assert.equal(world.docs.has('drive-b'), true);
});

test('a file in two sources stays when only one lets go of it', async () => {
  world.docs.set('drive-a', {
    source: 'drive',
    name: 'a.pdf',
    driveSourceIds: ['s1', 's2'],
    indexingStatus: 'done'
  });
  world.listing.files = [];
  const result = await run();
  assert.equal(result.removed, 0); // detached, not deleted
  assert.deepEqual(world.docs.get('drive-a').driveSourceIds, ['s2']);
});

test('uploads and files of other sources are never touched by a removal', async () => {
  world.docs.set('upload-1', { source: 'upload', name: 'x.pdf', indexingStatus: 'done' });
  world.docs.set('drive-z', {
    source: 'drive',
    name: 'z.pdf',
    driveSourceIds: ['s9'],
    indexingStatus: 'done'
  });
  world.listing.files = [];
  await run();
  assert.deepEqual(world.detached, []);
  assert.equal(world.docs.size, 2);
});

test('a listing with holes removes nothing and says the run is not complete', async () => {
  world.docs.set('drive-a', {
    source: 'drive',
    name: 'a.pdf',
    driveSourceIds: ['s1'],
    indexingStatus: 'done'
  });
  world.listing = {
    ...world.listing,
    complete: false,
    problems: [{ name: 'Privata', reason: 'Drive nega l’accesso' }]
  };
  const result = await run();
  assert.equal(result.removed, 0);
  assert.equal(result.complete, false);
  assert.equal(world.docs.has('drive-a'), true);
  assert.equal(result.errors[0].kind, 'source');
  // the channels are only renewed, not reshaped from a partial list
  assert.deepEqual(world.channelCalls, [{ watch: null }]);
});

test('a complete run hands the folders to the notification channels', async () => {
  world.listing.folders = [
    { id: 'root', path: '' },
    { id: 'sub', path: 'Sub' }
  ];
  await run();
  assert.deepEqual(world.channelCalls, [{ watch: ['root', 'sub'] }]);
});

test('a failing card is counted, kept on the document, and does not stop the others', async () => {
  world.listing.files = [pdf('a'), pdf('b')];
  world.bytes.a = Buffer.from('%PDF-a');
  world.bytes.b = Buffer.from('%PDF-b');
  world.failIndex.add('drive-a');
  const result = await run();
  assert.equal(result.added, 2);
  assert.equal(result.failed, 1);
  assert.match(result.errors[0].reason, /Indicizzazione non riuscita: Gemini era sovraccarico/);
  assert.equal(world.docs.get('drive-b').indexingStatus, 'done');
  assert.ok(world.docs.has('drive-a')); // stays, to be retried
});

test('a download that fails is counted and creates no document', async () => {
  world.listing.files = [pdf('a')]; // no bytes: the download answers 404
  const result = await run();
  assert.equal(result.failed, 1);
  assert.equal(result.added, 0);
  assert.equal(world.docs.size, 0);
});

test('a name taken by a file whose download failed is free for the next one', async () => {
  world.listing.files = [pdf('a', { name: 'Modulo.pdf' }), pdf('b', { name: 'Modulo.pdf', path: 'Altra' })];
  world.bytes.b = Buffer.from('%PDF-b'); // a cannot be downloaded
  const result = await run();
  assert.equal(result.failed, 1);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 0);
  assert.ok(world.docs.has('drive-b'));
  assert.equal(world.docs.has('drive-a'), false);
});

test('of three files with one name, the first that can be downloaded gets it', async () => {
  world.listing.files = ['a', 'b', 'c'].map(id => pdf(id, { name: 'Modulo.pdf', path: id }));
  world.bytes.b = Buffer.from('%PDF-b');
  world.bytes.c = Buffer.from('%PDF-c');
  const result = await run();
  assert.equal(result.failed, 1); // a
  assert.equal(result.added, 1); // b
  assert.equal(result.skipped, 1); // c
  assert.deepEqual([...world.docs.keys()], ['drive-b']);
});

test('"Reindicizza tutto" redoes the card of an up-to-date file, once', async () => {
  world.listing.files = [pdf('a')];
  world.bytes.a = Buffer.from('%PDF-a');
  await run();
  world.indexed.length = 0;
  world.downloads.length = 0;
  world.source = { ...world.source, forceSince: { toMillis: () => Date.now() + 1000 } };
  const result = await run();
  assert.equal(result.updated, 1);
  assert.deepEqual(world.indexed, ['drive-a']);
  assert.deepEqual(world.downloads, []); // the bytes are already in Storage
});

test('out of time: the rest is deferred, the source stays due', async () => {
  world.listing.files = [pdf('a'), pdf('b'), pdf('c')];
  const now = Date.now();
  const result = await run({
    budget: { newWorkUntil: now - 1, hardDeadline: now + 10_000, signal: new AbortController().signal }
  });
  assert.equal(result.deferred, 3);
  assert.equal(result.complete, false);
  assert.deepEqual(world.downloads, []);
});

test('a run that cannot take the lease does nothing', async () => {
  world.busy = true;
  assert.equal(await run(), null);
  assert.equal(world.finished, null);
});

test('a source-level failure is recorded as the run error and removes nothing', async () => {
  world.docs.set('drive-a', {
    source: 'drive',
    name: 'a.pdf',
    driveSourceIds: ['s1'],
    indexingStatus: 'done'
  });
  world.listingError = 'Non trovo l’elemento su Drive.';
  const result = await run();
  assert.equal(result.complete, false);
  assert.equal(world.finished.runError, 'Non trovo l’elemento su Drive.');
  assert.equal(world.docs.has('drive-a'), true);
});
