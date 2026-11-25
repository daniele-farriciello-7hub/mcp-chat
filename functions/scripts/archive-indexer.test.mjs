/**
 * Tests the server's indexing of a Drive document (src/drive/indexer.js) as far as the two kinds of document
 * and the categories go, with Firestore, Storage and Gemini replaced: which card and prompt an archive
 * document gets, that the categories written are only names of the admins' list, and that categories an
 * admin set by hand are not touched. The mode and the manual flag are read from the stored document, where an
 * admin changes them. Run: npm test.
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/${file}`, import.meta.url).href;

const world = { stored: new Map(), writes: [], requests: [], answer: {}, rawText: null };
const reset = () => {
  world.stored = new Map();
  world.writes = [];
  world.requests = [];
  world.answer = {};
  world.rawText = null;
};

const SERVER_TS = { serverTimestamp: true };
mock.module('firebase-admin/firestore', {
  namedExports: {
    FieldValue: { serverTimestamp: () => SERVER_TS },
    getFirestore: () => ({
      collection: () => ({
        doc: id => ({
          get: async () => ({ exists: world.stored.has(id), data: () => world.stored.get(id) }),
          update: async fields => {
            world.writes.push({ id, fields });
            world.stored.set(id, { ...world.stored.get(id), ...fields });
          }
        })
      }),
      doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) })
    })
  }
});
mock.module('firebase-admin/storage', {
  namedExports: { getStorage: () => ({ bucket: () => ({ name: 'bucket' }) }) }
});
mock.module(src('drive/driveClient.js'), { namedExports: { PDF_MIME_TYPE: 'application/pdf' } });
mock.module('@google/genai', {
  namedExports: {
    GoogleGenAI: class {
      models = {
        generateContent: async request => {
          world.requests.push(request);
          return {
            candidates: [{ finishReason: 'STOP' }],
            text: world.rawText ?? JSON.stringify(world.answer)
          };
        }
      };
    }
  }
});

const { indexDocument } = await import(src('drive/indexer.js'));

const LIST = ['Mutuo', 'Cessione del quinto', 'Modulistica'];
const SETTINGS = {
  modelId: 'gemini-test',
  instructions: 'ISTRUZIONI DELL’ADMIN',
  attachments: [],
  categories: LIST
};
const DOCUMENT = {
  id: 'drive-1',
  name: 'Modulo privacy.pdf',
  storagePath: 'app/documents/drive-1/Modulo privacy.pdf'
};

const promptOf = request => request.contents[0].parts[0].text;
const lastWrite = () => world.writes.at(-1).fields;

beforeEach(reset);

test('a studied document gets the full card, the admin’s instructions and categories from the list', async () => {
  world.stored.set('drive-1', { name: DOCUMENT.name });
  world.answer = {
    summary: 'Policy',
    banks: ['Banca Rossa'],
    products: ['mutuo'],
    topics: ['LTV'],
    keywords: ['ltv'],
    categories: ['Mutuo', 'Assicurazioni']
  };
  await indexDocument(DOCUMENT, SETTINGS);

  const [request] = world.requests;
  assert.ok(promptOf(request).startsWith('ISTRUZIONI DELL’ADMIN'));
  assert.ok(request.config.responseSchema.required.includes('topics'));
  assert.deepEqual(request.config.responseSchema.properties.categories.items.enum, LIST);
  assert.ok(promptOf(request).includes('SOLO fra queste: Mutuo; Cessione del quinto; Modulistica'));
  assert.equal(request.contents[0].parts[1].fileData.fileUri, `gs://bucket/${DOCUMENT.storagePath}`);

  const written = lastWrite();
  assert.deepEqual(written.indexCard, {
    summary: 'Policy',
    banks: ['Banca Rossa'],
    products: ['mutuo'],
    topics: ['LTV'],
    keywords: ['ltv']
  });
  // the category the model made up is not written
  assert.deepEqual(written.categories, ['Mutuo']);
  assert.equal(written.indexingStatus, 'done');
});

test('an archive document gets the short card and the dedicated prompt', async () => {
  world.stored.set('drive-1', { name: DOCUMENT.name, mode: 'archive' });
  world.answer = {
    summary: 'Modulo privacy per richiesta mutuo, da far firmare al cliente.',
    keywords: ['privacy', 'mutuo'],
    categories: ['modulistica', 'MUTUO', 'Altro']
  };
  await indexDocument(DOCUMENT, SETTINGS);

  const [request] = world.requests;
  assert.ok(!promptOf(request).includes('ISTRUZIONI DELL’ADMIN'));
  assert.ok(promptOf(request).includes('BREVE'));
  assert.deepEqual(request.config.responseSchema.required, ['summary', 'keywords', 'categories']);
  assert.ok(!('topics' in request.config.responseSchema.properties));

  const written = lastWrite();
  assert.deepEqual(written.indexCard, {
    summary: 'Modulo privacy per richiesta mutuo, da far firmare al cliente.',
    banks: [],
    products: [],
    topics: [],
    keywords: ['privacy', 'mutuo'],
    light: true
  });
  assert.deepEqual(written.categories, ['Modulistica', 'Mutuo']);
  assert.equal(written.indexingStatus, 'done');
  assert.equal(written.indexedWithModel, 'gemini-test');
});

test('the mode is the stored one, not the one the caller held', async () => {
  // the sync read the document before an admin switched it to archive
  world.stored.set('drive-1', { name: DOCUMENT.name, mode: 'archive' });
  world.answer = { summary: 's', keywords: [], categories: [] };
  await indexDocument({ ...DOCUMENT, mode: 'studied' }, SETTINGS);
  assert.equal(lastWrite().indexCard.light, true);
});

test('categories set by hand are neither asked for nor overwritten', async () => {
  world.stored.set('drive-1', {
    name: DOCUMENT.name,
    categories: ['Cessione del quinto'],
    categoriesManual: true
  });
  // even if the model volunteers some
  world.answer = { summary: 's', banks: [], products: [], topics: [], keywords: [], categories: ['Mutuo'] };
  await indexDocument(DOCUMENT, SETTINGS);

  const [request] = world.requests;
  assert.ok(!('categories' in request.config.responseSchema.properties));
  assert.ok(!promptOf(request).includes('Categorie:'));
  assert.ok(!('categories' in lastWrite()), 'categories are not in the update at all');
  assert.ok(!('categoriesManual' in lastWrite()));
  assert.deepEqual(world.stored.get('drive-1').categories, ['Cessione del quinto']);
  assert.equal(world.stored.get('drive-1').categoriesManual, true);
});

test('with no list nothing is asked and nothing is written about categories', async () => {
  world.stored.set('drive-1', { name: DOCUMENT.name, categories: ['Mutuo'] });
  world.answer = { summary: 's', banks: [], products: [], topics: [], keywords: [] };
  await indexDocument(DOCUMENT, { ...SETTINGS, categories: [] });
  assert.ok(!('categories' in world.requests[0].config.responseSchema.properties));
  assert.ok(!('categories' in lastWrite()));
});

test('what an admin wrote about a document is what the card is written from', async () => {
  world.stored.set('drive-1', { name: DOCUMENT.name, description: 'Modulo firmato dal cliente' });
  world.answer = { summary: 's', banks: [], products: [], topics: [], keywords: [], categories: [] };
  await indexDocument({ ...DOCUMENT, description: '' }, SETTINGS);
  assert.ok(promptOf(world.requests[0]).includes('«Modulo firmato dal cliente»'));
});

test('a failure is written on the document and thrown, categories untouched', async () => {
  world.stored.set('drive-1', { name: DOCUMENT.name, mode: 'archive', categories: ['Mutuo'] });
  world.rawText = 'not json at all';
  await assert.rejects(indexDocument(DOCUMENT, SETTINGS), /JSON/);
  const written = lastWrite();
  assert.equal(written.indexingStatus, 'failed');
  assert.ok(written.error.includes('JSON'));
  assert.equal(written.driveIndexFailedAt, SERVER_TS);
  assert.ok(!('indexCard' in written) && !('categories' in written));
  assert.deepEqual(world.stored.get('drive-1').categories, ['Mutuo']);
});
