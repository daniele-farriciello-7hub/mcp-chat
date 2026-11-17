/**
 * Tests what the history keeps of a turn's tool activity (`recordTurn` in src/history/historyStore.js),
 * with Firestore faked: the raw reason and the SQL of a failed database call are kept for every user
 * (the admin reads them in the Storico), but only as bounded text — never rows or the plain-language
 * message. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/${file}`, import.meta.url).href;
const real = await import('firebase-admin/firestore');

// ── a minimal Firestore: one stored conversation, and the batch a turn is written in ──────────────────

const world = {};
function reset() {
  Object.assign(world, { writes: [], conversation: { uid: 'u1', expiresAt: null } });
}
reset();

const refOf = path => ({
  path,
  get: async () => ({
    exists: path.includes('/chatConversations/c1'),
    data: () => ({ ...world.conversation })
  }),
  collection: name => collectionOf(`${path}/${name}`)
});
const collectionOf = path => ({ doc: id => refOf(`${path}/${id}`) });
mock.module('firebase-admin/firestore', {
  namedExports: {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
    getFirestore: () => ({
      collection: collectionOf,
      doc: refOf,
      batch: () => ({
        set: (ref, data) => world.writes.push({ id: ref.path.split('/').pop(), data }),
        update: () => {},
        commit: async () => {}
      })
    })
  }
});
mock.module(src('auth/firebaseUser.js'), { namedExports: { canUseApp: () => true } });

const { recordTurn } = await import(src('history/historyStore.js'));

const USER = { uid: 'u1' };
const turn = activities =>
  recordTurn(USER, {
    conversationId: 'c1',
    activities,
    reply: { id: 'r1', text: 'Ecco.', clientAt: 1000 }
  });
const storedActivity = id => world.writes.find(w => w.id === id).data.activity;

beforeEach(reset);

test('a failed database call keeps its raw reason and its SQL', async () => {
  await turn([
    {
      id: 'q1',
      kind: 'data',
      label: 'Non riuscita',
      outcome: 'failed',
      databaseLabel: 'Pratiche',
      errorDetail: "Unknown column 'stato' in 'where clause'",
      sql: 'SELECT stato FROM pratiche',
      // the sentence for the operator is not a record of anything
      message: 'Non sono riuscito a leggere questi dati dal database.'
    }
  ]);

  assert.deepEqual(storedActivity('q1'), {
    kind: 'data',
    label: 'Non riuscita',
    outcome: 'failed',
    databaseLabel: 'Pratiche',
    errorDetail: "Unknown column 'stato' in 'where clause'",
    sql: 'SELECT stato FROM pratiche'
  });
});

test('the reason is cut at 500 characters and the SQL at 10000', async () => {
  await turn([
    { id: 'q1', kind: 'data', outcome: 'failed', errorDetail: 'e'.repeat(900), sql: 's'.repeat(12_000) }
  ]);

  const stored = storedActivity('q1');
  assert.equal(stored.errorDetail, 'e'.repeat(500));
  assert.equal(stored.sql, 's'.repeat(10_000));
});

test('a reason that is not text is dropped, and rows never come along', async () => {
  await turn([
    {
      id: 'q1',
      kind: 'data',
      outcome: 'failed',
      errorDetail: { message: 'nope' },
      columns: ['id'],
      rows: [{ id: 1 }]
    }
  ]);

  assert.deepEqual(storedActivity('q1'), { kind: 'data', outcome: 'failed' });
});
