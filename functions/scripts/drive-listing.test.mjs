/**
 * Tests how a source is listed (src/drive/listing.js) against a fake Drive: sub-folders are followed,
 * only PDFs count, a folder that cannot be read makes the listing incomplete, and a source that cannot be
 * opened is reported to the admin. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const FOLDER = 'application/vnd.google-apps.folder';
const PDF = 'application/pdf';
const DOC = 'application/vnd.google-apps.document';

const world = {};
function reset() {
  Object.assign(world, { meta: {}, children: {}, childErrors: {}, listCalls: [] });
}
reset();

const file = (id, mimeType, name = id) => ({ id, name, mimeType, trashed: false });
mock.module(new URL('../src/drive/driveClient.js', import.meta.url).href, {
  namedExports: {
    FOLDER_MIME_TYPE: FOLDER,
    PDF_MIME_TYPE: PDF,
    describeDriveError: error => `Errore ${error.status}`,
    getFileMeta: async id => {
      if (world.meta[id] instanceof Error) throw world.meta[id];
      return world.meta[id];
    },
    listChildren: async id => {
      world.listCalls.push(id);
      if (world.childErrors[id]) throw world.childErrors[id];
      return world.children[id] || [];
    }
  }
});
const { ListingError, listSource } = await import(new URL('../src/drive/listing.js', import.meta.url).href);

const folderSource = { driveId: 'root', kind: 'folder' };
const list = (source = folderSource) => listSource(source, { deadline: Date.now() + 60_000 });
const statusError = status => Object.assign(new Error('x'), { status });

beforeEach(reset);

test('PDFs are found in the folder and its sub-folders, with the folder they sit in', async () => {
  world.meta.root = file('root', FOLDER, 'Moduli');
  world.children = {
    root: [
      file('a', PDF, 'a.pdf'),
      file('sub1', FOLDER, '2026'),
      file('doc', DOC),
      file('shortcut', 'application/vnd.google-apps.shortcut')
    ],
    sub1: [file('b', PDF, 'b.pdf'), file('sub2', FOLDER, 'Q1'), file('img', 'image/png')],
    sub2: [file('c', PDF, 'c.pdf')]
  };
  const listing = await list();

  assert.equal(listing.name, 'Moduli');
  assert.deepEqual(listing.files.map(f => [f.id, f.path]).sort(), [
    ['a', ''],
    ['b', '2026'],
    ['c', '2026/Q1']
  ]);
  assert.deepEqual(listing.folders, [
    { id: 'root', path: '' },
    { id: 'sub1', path: '2026' },
    { id: 'sub2', path: '2026/Q1' }
  ]);
  assert.equal(listing.ignored, 3); // a Google Doc, a shortcut, an image
  assert.equal(listing.complete, true);
  assert.deepEqual(listing.problems, []);
});

test('a file that sits in two folders, or a folder reached twice, is listed once', async () => {
  world.meta.root = file('root', FOLDER);
  world.children = {
    root: [file('x', PDF), file('sub', FOLDER)],
    sub: [file('x', PDF), file('root', FOLDER)]
  };
  const listing = await list();
  assert.deepEqual(
    listing.files.map(f => f.id),
    ['x']
  );
  assert.deepEqual(world.listCalls.sort(), ['root', 'sub']);
});

test('a sub-folder that cannot be read makes the listing incomplete but keeps the rest', async () => {
  world.meta.root = file('root', FOLDER, 'Moduli');
  world.children = { root: [file('a', PDF), file('private', FOLDER, 'Riservata')] };
  world.childErrors.private = statusError(403);
  const listing = await list();
  assert.equal(listing.complete, false);
  assert.deepEqual(
    listing.files.map(f => f.id),
    ['a']
  );
  assert.deepEqual(listing.problems, [{ name: 'Riservata', reason: 'Errore 403' }]);
});

test('a source that cannot be opened is an error for the admin, not an empty listing', async () => {
  world.meta.root = statusError(404);
  await assert.rejects(list(), error => error instanceof ListingError && error.message === 'Errore 404');
  world.meta.root = file('root', 'application/pdf');
  await assert.rejects(list(), /non è più una cartella/);
});

test('a folder in the bin lists nothing, so its documents leave the archive', async () => {
  world.meta.root = { ...file('root', FOLDER, 'Moduli'), trashed: true };
  const listing = await list();
  assert.deepEqual(listing.files, []);
  assert.equal(listing.complete, true);
  assert.match(listing.problems[0].reason, /cestino/);
});

test('a single PDF is its own listing; if it is trashed or no longer a PDF it lists nothing', async () => {
  const source = { driveId: 'one', kind: 'file' };
  world.meta.one = file('one', PDF, 'Listino.pdf');
  const listing = await list(source);
  assert.deepEqual(
    listing.files.map(f => [f.id, f.path]),
    [['one', '']]
  );
  assert.deepEqual(world.listCalls, []); // nothing to list inside it

  world.meta.one = { ...file('one', PDF), trashed: true };
  assert.deepEqual((await list(source)).files, []);
  world.meta.one = file('one', DOC);
  const converted = await list(source);
  assert.deepEqual(converted.files, []);
  assert.match(converted.problems[0].reason, /Non è più un PDF/);
});

test('out of time while reading folders is an error, so nothing is removed on a half listing', async () => {
  world.meta.root = file('root', FOLDER);
  world.children = { root: [file('sub', FOLDER)] };
  await assert.rejects(listSource(folderSource, { deadline: Date.now() - 1 }), /Tempo esaurito/);
});
