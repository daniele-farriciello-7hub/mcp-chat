/**
 * Tests what the database endpoint (`database`) writes to the log when a query fails: which query, for
 * whom, why — while the response to the browser stays exactly what it was. The connection, the user
 * and the driver are faked; the SQL validator is the real one. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/${file}`, import.meta.url).href;
const real = await import('firebase-admin/firestore');

// ── fakes ────────────────────────────────────────────────────────────────────

const world = {};
function reset() {
  Object.assign(world, {
    user: { uid: 'u1', email: 'operatore@example.com', canUse: true, isAdmin: false },
    connection: { enabled: true, userScoped: false },
    tables: ['pratiche'],
    driverError: null // what the fake database throws, when set
  });
}
reset();

// documents by path: only the connection and the settings (absent) are read
const docRef = path => ({
  get: async () => {
    const data = path.endsWith('/dbConnections/c1') ? world.connection : null;
    return { exists: Boolean(data), data: () => ({ ...data }) };
  },
  collection: () => ({
    where: () => ({ get: async () => ({ docs: world.tables.map(name => ({ data: () => ({ name }) })) }) })
  })
});
mock.module('firebase-admin/firestore', {
  namedExports: {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
    getFirestore: () => ({ doc: docRef, collection: () => ({}) })
  }
});

class InvalidTokenError extends Error {}
mock.module(src('auth/firebaseUser.js'), {
  namedExports: { InvalidTokenError, verifyAppUser: async () => world.user }
});

class DatabaseConnectionError extends Error {}
const runOnDatabase = async () => {
  if (world.driverError) throw world.driverError;
  return [{ id: 1 }];
};
mock.module(src('db/mysqlClient.js'), {
  namedExports: {
    DatabaseConnectionError,
    describeConnectionError: error => error.message,
    forgetPool: async () => {},
    queryAsUser: async () => runOnDatabase(),
    testConnectionConfig: async () => {},
    withConnection: async (_id, fn) => fn({ query: async () => [await runOnDatabase()] })
  }
});
mock.module(src('db/introspect.js'), { namedExports: { scanSchema: async () => [] } });
mock.module(src('db/sampleRows.js'), { namedExports: { sampleTableRows: async () => ({}) } });

const { handleDatabaseRequest } = await import(src('http/databaseEndpoint.js'));

const warn = mock.method(console, 'warn', () => {});
const logged = () => warn.mock.calls.map(call => call.arguments);

const call = async (action, body) => {
  const req = {
    method: 'POST',
    path: `/${action}`,
    body,
    get: name => ({ Authorization: 'Bearer ok' })[name]
  };
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
  await handleDatabaseRequest(req, res);
  return res;
};

const SQL = 'SELECT id FROM pratiche WHERE stato = 1';
const mysqlError = (sqlMessage, code) =>
  Object.assign(new Error(`${code}: ${sqlMessage}`), { sqlMessage, code });

beforeEach(() => {
  reset();
  warn.mock.resetCalls();
});

// ── a query the database refuses ────────────────────────────────────────────

test('a database error is logged with the query, and the response is unchanged', async () => {
  world.driverError = mysqlError("Unknown column 'stato' in 'where clause'", 'ER_BAD_FIELD_ERROR');
  const res = await call('query', { connectionId: 'c1', sql: SQL });

  assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: "Unknown column 'stato' in 'where clause'" });
  assert.deepEqual(logged(), [
    [
      'database query failed',
      {
        action: 'query',
        connectionId: 'c1',
        uid: 'u1',
        error: "Unknown column 'stato' in 'where clause'",
        code: 'ER_BAD_FIELD_ERROR',
        sql: SQL
      }
    ]
  ]);
});

test('a query the validator refuses is logged too, with no driver code', async () => {
  const res = await call('query', { connectionId: 'c1', sql: 'DELETE FROM pratiche' });

  assert.equal(res.code, 400);
  assert.match(res.body.error, /only SELECT/);
  const [[message, entry], ...rest] = logged();
  assert.equal(rest.length, 0);
  assert.equal(message, 'database query failed');
  assert.equal(entry.action, 'query');
  assert.equal(entry.sql, 'DELETE FROM pratiche');
  assert.equal(entry.error, res.body.error);
  assert.equal('code' in entry, false);
});

test('the log carries neither the email nor row data, and cuts a long query', async () => {
  world.driverError = mysqlError('syntax error', 'ER_PARSE_ERROR');
  const long = `${SQL} AND note = '${'x'.repeat(5000)}'`;
  await call('query', { connectionId: 'c1', sql: long });

  const [[, entry]] = logged();
  assert.equal(entry.sql.length, 2000);
  assert.equal(entry.sql, long.slice(0, 2000));
  assert.deepEqual(Object.keys(entry).sort(), ['action', 'code', 'connectionId', 'error', 'sql', 'uid']);
  assert.equal(JSON.stringify(entry).includes('operatore@example.com'), false);
});

test('an error that is not about the query is not logged as one', async () => {
  assert.equal((await call('query', { connectionId: 'c1' })).code, 400); // missing sql
  world.connection = { enabled: false };
  assert.equal((await call('query', { connectionId: 'c1', sql: SQL })).code, 404);
  world.connection = { enabled: true, userScoped: true };
  world.user = { ...world.user, emailVerified: false };
  assert.equal((await call('query', { connectionId: 'c1', sql: SQL })).code, 403);
  assert.deepEqual(logged(), []);
});

test('a query that works logs nothing', async () => {
  const res = await call('query', { connectionId: 'c1', sql: SQL });
  assert.equal(res.code, 200);
  assert.deepEqual(logged(), []);
});

// ── the other actions that run the model's query ────────────────────────────

test('an export that fails is logged once, not once per attempt', async () => {
  world.driverError = mysqlError("Table 'db.pratiche' doesn't exist", 'ER_NO_SUCH_TABLE');

  // the preview tries the wrapped query first and the plain one after it: only the last failure ends the call
  const preview = await call('exportPreview', { connectionId: 'c1', sql: SQL });
  assert.equal(preview.code, 400);
  assert.deepEqual(
    logged().map(([message, entry]) => [message, entry.action, entry.sql]),
    [['database query failed', 'exportPreview', SQL]]
  );

  warn.mock.resetCalls();
  const file = await call('exportFile', { connectionId: 'c1', sql: SQL, title: 'Pratiche' });
  assert.equal(file.code, 400);
  assert.deepEqual(
    logged().map(([, entry]) => entry.action),
    ['exportFile']
  );
});

test('a chart query that fails is logged with its action', async () => {
  world.driverError = mysqlError('syntax error', 'ER_PARSE_ERROR');
  assert.equal((await call('chartData', { connectionId: 'c1', sql: SQL })).code, 400);
  assert.deepEqual(
    logged().map(([, entry]) => entry.action),
    ['chartData']
  );
});
