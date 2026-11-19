/**
 * Tests the `command` and `commandPresets` actions of the database endpoint: the commands without AI that
 * the chat runs without the model. The server finds the command by id in the stored settings
 * (`settings.noAiCommands`) and reads the SQL, the connection and the limits from there: nothing in the
 * request can change them; a truncated result or a query without the columns of the command's format is an
 * error, not a partial answer; settings saved with the old single `erogatoCommand` still run as the command
 * 'erogato'. Firestore, the driver and the token check are faked; the SQL validator and `serializeRows` are
 * the real ones. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/${file}`, import.meta.url).href;
const real = await import('firebase-admin/firestore');

// ── fakes ────────────────────────────────────────────────────────────────────

const world = {};
function reset() {
  Object.assign(world, {
    user: { uid: 'u1', email: 'operatore@example.com', emailVerified: true, canUse: true, isAdmin: false },
    // per connection id; a missing one does not exist
    connections: { c1: { enabled: true, userScoped: false }, c2: { enabled: true, userScoped: false } },
    tables: ['ai_pratiche', 'ai_erogato_extra', 'clienti'],
    settings: { noAiCommands: [erogato()] },
    rows: [],
    driverError: null,
    ran: [] // what reached the database: { how, connectionId, email, statement }
  });
}

/** An erogato command, switched on, on connection c1, with no SQL of its own (the format's default one). */
function erogato(overrides = {}) {
  return {
    id: 'erogato',
    name: 'Erogato',
    format: 'erogato',
    enabled: true,
    connectionId: 'c1',
    ...overrides
  };
}
/** A plain table command. */
function table(overrides = {}) {
  return {
    id: 'cmd-tab1',
    name: 'Clienti',
    format: 'table',
    enabled: true,
    connectionId: 'c1',
    sql: 'SELECT id, nome FROM clienti',
    ...overrides
  };
}

const docRef = path => ({
  get: async () => {
    let data = null;
    const connection = /\/dbConnections\/([^/]+)$/.exec(path);
    if (connection) data = world.connections[connection[1]] ?? null;
    if (path.endsWith('/config/settings')) data = world.settings;
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
const runOnDatabase = async entry => {
  world.ran.push(entry);
  if (world.driverError) throw world.driverError;
  return world.rows;
};
mock.module(src('db/mysqlClient.js'), {
  namedExports: {
    DatabaseConnectionError,
    describeConnectionError: error => error.message,
    forgetPool: async () => {},
    queryAsUser: async (connectionId, email, statement) =>
      runOnDatabase({ how: 'queryAsUser', connectionId, email, statement }),
    testConnectionConfig: async () => {},
    withConnection: async (connectionId, fn) =>
      fn({
        query: async statement => [await runOnDatabase({ how: 'pool', connectionId, statement })]
      })
  }
});
mock.module(src('db/introspect.js'), { namedExports: { scanSchema: async () => [] } });
mock.module(src('db/sampleRows.js'), { namedExports: { sampleTableRows: async () => ({}) } });

const { handleDatabaseRequest } = await import(src('http/databaseEndpoint.js'));
const { EROGATO_COLUMNS, EROGATO_SQL, COMMAND_PRESETS } = await import(src('db/commandFormats.js'));
const { commandsFromSettings } = await import(src('db/commandSettings.js'));
const client = await import(
  new URL('../../src/features/chat/commands/commandSettings.js', import.meta.url).href
);

const warn = mock.method(console, 'warn', () => {});
const logged = () => warn.mock.calls.map(call => call.arguments);

const call = async (action, body = {}) => {
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
/** Runs the command with this id, as the chat does. */
const run = (commandId = 'erogato', extra = {}) => call('command', { commandId, ...extra });

/** A row of the erogato query, with every column its composer reads. */
const row = (overrides = {}) => ({
  oggi: '2026-11-19',
  prodotto: 'Mutuo',
  cur: 1,
  anno: 2026,
  mese: 11,
  banca: 'Banca di prova',
  dt: 'Rossi',
  fuori_sistema: 'NO',
  pratiche: 3,
  erogato: '450000.00',
  mediazione: '1200.00',
  con_data_da_cambio_stato: '0',
  ...overrides
});
const withCommands = (...commands) => {
  world.settings = { noAiCommands: commands };
};

beforeEach(() => {
  reset();
  warn.mock.resetCalls();
});

// ── what runs ────────────────────────────────────────────────────────────────

test('an erogato command with no SQL runs its format’s default query, bounded and time-boxed', async () => {
  world.rows = [row()];
  const res = await run();

  assert.equal(res.code, 200);
  assert.equal(world.ran.length, 1);
  // one row past the cap (10000 by default) is asked for, to tell "exactly the cap" from "more"
  assert.equal(world.ran[0].statement, `SET STATEMENT max_statement_time=60 FOR ${EROGATO_SQL} LIMIT 10001`);
  assert.equal(world.ran[0].connectionId, 'c1');
});

test('the SQL of the command runs instead of the default', async () => {
  const custom = `SELECT 'x' AS oggi, 'y' AS prodotto FROM ai_pratiche`;
  withCommands(erogato({ sql: `  ${custom}  ` }));
  world.rows = [];
  const res = await run();

  assert.equal(res.code, 200);
  assert.ok(world.ran[0].statement.includes(custom));
  assert.equal(world.ran[0].statement.includes('ai_erogato_extra'), false);
});

test('the command is found by id among several, each with its own connection and SQL', async () => {
  withCommands(
    erogato(),
    table({ connectionId: 'c2' }),
    table({ id: 'cmd-tab2', sql: 'SELECT 2 AS due FROM clienti' })
  );
  world.rows = [{ id: 1, nome: 'Rossi' }];

  assert.equal((await run('cmd-tab1')).code, 200);
  assert.equal(world.ran.at(-1).connectionId, 'c2');
  assert.ok(world.ran.at(-1).statement.includes('SELECT id, nome FROM clienti'));

  assert.equal((await run('cmd-tab2')).code, 200);
  assert.equal(world.ran.at(-1).connectionId, 'c1');
  assert.ok(world.ran.at(-1).statement.includes('SELECT 2 AS due FROM clienti'));
});

test('nothing in the request can choose the SQL, the connection or the limits', async () => {
  world.rows = [row()];
  const res = await run('erogato', {
    sql: 'SELECT secret FROM ai_pratiche',
    connectionId: 'c2',
    maxRows: 1,
    timeoutSeconds: 1,
    format: 'table',
    command: { sql: 'SELECT 1' },
    noAiCommands: [{ id: 'erogato', sql: 'SELECT 1' }]
  });

  assert.equal(res.code, 200);
  assert.equal(world.ran.length, 1);
  assert.equal(world.ran[0].connectionId, 'c1');
  assert.equal(world.ran[0].statement, `SET STATEMENT max_statement_time=60 FOR ${EROGATO_SQL} LIMIT 10001`);
  assert.equal(res.body.format, 'erogato');
});

test('the rows, the columns, their count, the format and the time come back', async () => {
  world.rows = [row(), row({ prodotto: 'Prestito', pratiche: 1 })];
  const res = await run();

  assert.equal(res.body.format, 'erogato');
  assert.deepEqual(res.body.columns, EROGATO_COLUMNS);
  assert.equal(res.body.rowCount, 2);
  assert.equal(res.body.rows.length, 2);
  assert.equal(res.body.rows[1].prodotto, 'Prestito');
  assert.equal(typeof res.body.tookMs, 'number');
  assert.equal('truncated' in res.body, false);
});

test('a normal administrator result is not cut by the 60k characters meant for the model', async () => {
  world.rows = Array.from({ length: 2600 }, (_, i) =>
    row({ banca: `Banca numero ${i}`, mese: 1 + (i % 11) })
  );
  assert.ok(JSON.stringify(world.rows).length > 60_000);
  const res = await run();

  assert.equal(res.code, 200);
  assert.equal(res.body.rowCount, 2600);
  assert.equal(res.body.rows.at(-1).banca, 'Banca numero 2599');
});

test('the timeout of the command applies, capped at the endpoint ceiling', async () => {
  world.rows = [row()];
  withCommands(erogato({ timeoutSeconds: 25 }));
  await run();
  assert.match(world.ran.at(-1).statement, /^SET STATEMENT max_statement_time=25 FOR /);

  withCommands(erogato({ timeoutSeconds: 99_999 }));
  await run();
  assert.match(world.ran.at(-1).statement, /^SET STATEMENT max_statement_time=600 FOR /);
});

// ── who it runs as ───────────────────────────────────────────────────────────

test('a user-scoped connection runs it as the verified email of the token', async () => {
  world.connections.c1 = { enabled: true, userScoped: true };
  world.rows = [row()];
  const res = await run('erogato', { email: 'someone.else@example.com' });

  assert.equal(res.code, 200);
  assert.equal(world.ran.length, 1);
  assert.equal(world.ran[0].how, 'queryAsUser');
  assert.equal(world.ran[0].email, 'operatore@example.com');
});

test('a connection that is not user-scoped runs it on the pool', async () => {
  world.rows = [row()];
  await run();
  assert.equal(world.ran[0].how, 'pool');
});

test('a user-scoped connection refuses an account without a verified email', async () => {
  world.connections.c1 = { enabled: true, userScoped: true };
  world.user = { ...world.user, emailVerified: false };
  const res = await run();

  assert.equal(res.code, 403);
  assert.equal(world.ran.length, 0);
});

// ── an answer that would be wrong is an error ────────────────────────────────

test('a result that hits the row cap fails instead of returning a partial answer', async () => {
  withCommands(erogato({ maxRows: 100 }));
  world.rows = Array.from({ length: 101 }, () => row());
  const res = await run();

  assert.equal(res.code, 400);
  assert.match(res.body.error, /più di 100 righe/);
  assert.match(res.body.error, /«Erogato»/);
  assert.equal('rows' in res.body, false);
  // logged like any query the server refused, with the action and the command
  assert.deepEqual(
    logged().map(([message, entry]) => [message, entry.action, entry.commandId, entry.connectionId]),
    [['database query failed', 'command', 'erogato', 'c1']]
  );
});

test('a result of exactly the row cap is not truncated', async () => {
  withCommands(erogato({ maxRows: 100 }));
  world.rows = Array.from({ length: 100 }, () => row());
  const res = await run();

  assert.equal(res.code, 200);
  assert.equal(res.body.rowCount, 100);
  assert.match(world.ran[0].statement, / LIMIT 101$/);
});

test('a table command fails on truncation too, and the row cap is its own', async () => {
  withCommands(table({ maxRows: 3 }));
  world.rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const res = await run('cmd-tab1');

  assert.equal(res.code, 400);
  assert.match(res.body.error, /più di 3 righe/);
  assert.match(res.body.error, /«Clienti»/);
  assert.equal(logged()[0][1].commandId, 'cmd-tab1');
});

test('a query that lacks the columns of an erogato command fails and names them', async () => {
  const { erogato: amount, mediazione, ...incomplete } = row();
  void amount;
  void mediazione;
  world.rows = [incomplete];
  const res = await run();

  assert.equal(res.code, 400);
  assert.match(res.body.error, /le colonne erogato, mediazione\./);
  assert.equal(logged().length, 1);

  const { dt, ...oneMissing } = row();
  void dt;
  world.rows = [oneMissing];
  const single = await run();
  assert.equal(single.code, 400);
  assert.match(single.body.error, /la colonna dt\./);
});

test('each format has its own column contract: a table command accepts any columns', async () => {
  withCommands(erogato(), table());
  world.rows = [{ id: 7, nome: 'Bianchi', altro: null }];

  const asTable = await run('cmd-tab1');
  assert.equal(asTable.code, 200);
  assert.equal(asTable.body.format, 'table');
  assert.deepEqual(asTable.body.columns, ['id', 'nome', 'altro']);
  assert.deepEqual(asTable.body.rows, [{ id: 7, nome: 'Bianchi', altro: null }]);

  // the same rows are not an answer for the erogato format
  const asErogato = await run('erogato');
  assert.equal(asErogato.code, 400);
  assert.match(asErogato.body.error, /Servono tutte: oggi, prodotto/);
});

test('a result with no rows is a valid, empty answer, whatever the format', async () => {
  withCommands(erogato(), table());
  world.rows = [];
  for (const id of ['erogato', 'cmd-tab1']) {
    const res = await run(id);
    assert.equal(res.code, 200);
    assert.equal(res.body.rowCount, 0);
    assert.deepEqual(res.body.rows, []);
  }
});

// ── unknown, off or not configured ───────────────────────────────────────────

test('an unknown command, or no id, is refused and runs nothing', async () => {
  withCommands(erogato(), table());
  assert.equal((await run('cmd-gone')).code, 404);
  assert.equal((await run('constructor')).code, 404);
  assert.equal((await run('__proto__')).code, 404);
  assert.equal((await call('command', {})).code, 400);
  assert.equal((await call('command', { commandId: '  ' })).code, 400);
  assert.equal((await call('command', { commandId: 5 })).code, 400);

  world.settings = null; // no settings document at all
  assert.equal((await run()).code, 404);

  assert.equal(world.ran.length, 0);
  assert.deepEqual(logged(), []);
});

test('a command that is off or not complete fails with a clear message and runs nothing', async () => {
  withCommands(erogato({ enabled: false }));
  let res = await run();
  assert.equal(res.code, 400);
  assert.match(res.body.error, /non è attivo/);
  assert.match(res.body.error, /Comandi senza AI/);

  withCommands(erogato({ enabled: 'true' })); // only exactly true switches it on
  assert.equal((await run()).code, 400);

  withCommands(erogato({ connectionId: '' }));
  res = await run();
  assert.equal(res.code, 400);
  assert.match(res.body.error, /connessione/);

  withCommands(erogato({ connectionId: '../dbSecrets/c1' })); // never turned into a path
  assert.equal((await run()).code, 400);

  // a format with no default query needs its own SQL
  withCommands(table({ sql: '  ' }));
  res = await run('cmd-tab1');
  assert.equal(res.code, 400);
  assert.match(res.body.error, /query SQL/);

  withCommands(table({ format: 'pie' }));
  res = await run('cmd-tab1');
  assert.equal(res.code, 400);
  assert.match(res.body.error, /formato/);
  withCommands(table({ format: 'constructor' }));
  assert.equal((await run('cmd-tab1')).code, 400);

  assert.equal(world.ran.length, 0);
  assert.deepEqual(logged(), []);
});

test('a missing or disabled connection is the same refusal as for a query', async () => {
  world.connections.c1 = { enabled: false };
  assert.equal((await run()).code, 404);

  world.connections.c1 = { enabled: true };
  withCommands(erogato({ connectionId: 'gone' }));
  assert.equal((await run()).code, 404);
  assert.equal(world.ran.length, 0);
});

test('the tables the query reads must be enabled for the connection', async () => {
  world.tables = ['ai_pratiche']; // ai_erogato_extra is not
  const res = await run();

  assert.equal(res.code, 400);
  assert.match(res.body.error, /table "ai_erogato_extra" is not enabled/);
  assert.equal(world.ran.length, 0);
});

// ── the checks of `query` still apply, and are logged ────────────────────────

test('a stored SQL that is not a plain SELECT is refused and logged', async () => {
  withCommands(erogato({ sql: 'DELETE FROM ai_pratiche' }));
  const res = await run();

  assert.equal(res.code, 400);
  assert.match(res.body.error, /only SELECT/);
  assert.equal(world.ran.length, 0);
  const [[message, entry]] = logged();
  assert.equal(message, 'database query failed');
  assert.equal(entry.action, 'command');
  assert.equal(entry.commandId, 'erogato');
  assert.equal(entry.sql, 'DELETE FROM ai_pratiche');
});

test('a database error is logged with its action and command, and the response says why', async () => {
  world.driverError = Object.assign(new Error('ER_QUERY_TIMEOUT'), {
    sqlMessage: 'Query execution was interrupted (max_statement_time exceeded)',
    code: 'ER_STATEMENT_TIMEOUT'
  });
  const res = await run();

  assert.equal(res.code, 400);
  assert.match(res.body.error, /max_statement_time exceeded/);
  const [[, entry]] = logged();
  assert.equal(entry.action, 'command');
  assert.equal(entry.commandId, 'erogato');
  assert.equal(entry.code, 'ER_STATEMENT_TIMEOUT');
  assert.equal(entry.uid, 'u1');
  assert.equal(JSON.stringify(entry).includes('operatore@example.com'), false);
});

test('the other query actions log without a command, and still need their connection and SQL', async () => {
  world.rows = [{ id: 1 }];
  assert.equal((await call('query', { sql: 'SELECT id FROM ai_pratiche' })).code, 400);
  assert.equal((await call('query', { connectionId: 'c1' })).code, 400);
  const res = await call('query', { connectionId: 'c1', sql: 'SELECT id FROM ai_pratiche' });
  assert.equal(res.code, 200);
  assert.equal(res.body.rowCount, 1);

  const refused = await call('query', { connectionId: 'c1', sql: 'DELETE FROM ai_pratiche' });
  assert.equal(refused.code, 400);
  const [[, entry]] = logged();
  assert.equal(entry.action, 'query');
  assert.equal('commandId' in entry, false);
});

// ── settings saved before there was a list ───────────────────────────────────

const legacy = (overrides = {}) => ({
  enabled: true,
  connectionId: 'c1',
  sql: '',
  triggers: ['erogato'],
  maxRows: 10000,
  timeoutSeconds: 60,
  errorMessage: '',
  ...overrides
});

test('the old erogatoCommand runs as the command "erogato", with the default query when its SQL is empty', async () => {
  world.settings = { erogatoCommand: legacy() }; // no noAiCommands at all, as before the change
  world.rows = [row()];
  const res = await run('erogato');

  assert.equal(res.code, 200);
  assert.equal(res.body.format, 'erogato');
  assert.equal(world.ran[0].connectionId, 'c1');
  assert.equal(world.ran[0].statement, `SET STATEMENT max_statement_time=60 FOR ${EROGATO_SQL} LIMIT 10001`);
});

test('the old command keeps its own SQL, row cap and timeout, and stays off when it was off', async () => {
  const custom = `SELECT 'x' AS oggi FROM ai_pratiche`;
  world.settings = { erogatoCommand: legacy({ sql: custom, maxRows: 5, timeoutSeconds: 12 }) };
  world.rows = [];
  assert.equal((await run()).code, 200);
  assert.match(world.ran[0].statement, /^SET STATEMENT max_statement_time=12 FOR SELECT 'x' AS oggi/);
  assert.match(world.ran[0].statement, / LIMIT 6$/);

  world.settings = { erogatoCommand: legacy({ enabled: false }) };
  assert.equal((await run()).code, 400);
  world.settings = { erogatoCommand: legacy({ connectionId: '' }) };
  assert.equal((await run()).code, 400);
});

test('once the list exists it is the only source: an old erogatoCommand next to it is ignored', async () => {
  world.settings = { noAiCommands: [], erogatoCommand: legacy() }; // the admin deleted every command
  assert.equal((await run()).code, 404);

  world.settings = { noAiCommands: [table()], erogatoCommand: legacy() };
  assert.equal((await run('erogato')).code, 404);
  world.rows = [{ id: 1 }];
  assert.equal((await run('cmd-tab1')).code, 200);
});

test('settings with neither the list nor the old command have no commands', () => {
  assert.deepEqual(commandsFromSettings(null), []);
  assert.deepEqual(commandsFromSettings({}), []);
  assert.deepEqual(commandsFromSettings({ erogatoCommand: 'x' }), []);
  // an entry without a safe id is not a command
  assert.deepEqual(
    commandsFromSettings({ noAiCommands: [{ id: '../x' }, null, 'a', { name: 'senza id' }] }),
    []
  );
});

test('the server and the browser read the settings the same way', () => {
  const cases = [
    { erogatoCommand: legacy() },
    { erogatoCommand: legacy({ sql: 'SELECT 1', maxRows: 25, timeoutSeconds: 9, enabled: false }) },
    { erogatoCommand: { enabled: true } }, // a partial old object: defaults for the rest
    { erogatoCommand: { enabled: true, triggers: [] } },
    {
      noAiCommands: [
        erogato({ maxRows: 99_999, timeoutSeconds: -3 }),
        table({ maxRows: 'many', connectionId: '../x' }),
        { id: 'cmd-nuovo' },
        { id: 'cmd-tab1', name: 'duplicato' }
      ]
    },
    { noAiCommands: [] },
    {}
  ];
  const sqlOf = command => command.sql || '';
  for (const stored of cases) {
    const fromServer = commandsFromSettings(stored);
    const fromClient = client.normalizeCommands(stored);
    const pick = ({ id, name, enabled, format, connectionId, maxRows, timeoutSeconds }) => ({
      id,
      name,
      enabled,
      format,
      connectionId,
      maxRows,
      timeoutSeconds
    });
    assert.deepEqual(fromServer.map(pick), fromClient.map(pick), JSON.stringify(stored));
    // the server fills in the default query of a format that has one; the browser leaves the field empty
    fromServer.forEach((command, i) => {
      const own = sqlOf(fromClient[i]).trim() ? fromClient[i].sql : '';
      assert.equal(command.sql, own || (command.format === 'erogato' ? EROGATO_SQL : ''));
    });
  }
});

// ── the presets, for the admin's panel ───────────────────────────────────────

test('only an admin can read the presets, which carry the SQL', async () => {
  assert.equal((await call('commandPresets')).code, 403);

  world.user = { ...world.user, isAdmin: true };
  const res = await call('commandPresets');
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.presets, COMMAND_PRESETS);
  const [erogatoPreset] = res.body.presets;
  assert.equal(erogatoPreset.format, 'erogato');
  assert.equal(erogatoPreset.name, 'Erogato');
  assert.deepEqual(erogatoPreset.triggers, ['erogato']);
  assert.equal(erogatoPreset.sql, EROGATO_SQL);
});

test('a preset is a valid command once the admin chooses a connection', async () => {
  const [preset] = COMMAND_PRESETS;
  const { command } = client.createCommand([], preset);
  assert.equal(command.format, 'erogato');
  assert.equal(command.enabled, false);
  assert.equal(command.sql, EROGATO_SQL);
  withCommands({ ...command, enabled: true, connectionId: 'c1' });
  world.rows = [row()];
  const res = await run(command.id);
  assert.equal(res.code, 200);
  assert.ok(world.ran[0].statement.includes(EROGATO_SQL));
});

test('the single-command actions of the first version are gone', async () => {
  world.user = { ...world.user, isAdmin: true };
  assert.equal((await call('erogato')).code, 404);
  assert.equal((await call('erogatoDefaultSql')).code, 404);
});
