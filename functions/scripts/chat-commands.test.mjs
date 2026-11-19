/**
 * Tests the browser-side half of the commands without AI (src/features/chat/commands): which messages run
 * which command, how the list in the settings is read (and the old single `erogatoCommand` converted), the
 * trigger rules the panel applies, the format registry and the answers the composers write from the rows of
 * a query. All of it is pure and dependency-free, so it loads here as it is. Run: npm test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const commands = file => import(new URL(`../../src/features/chat/commands/${file}`, import.meta.url).href);
const {
  COMMAND_MODEL,
  commandFor,
  commandReplyLabel,
  commandText,
  isCommandOn,
  isRunnable,
  matchesTrigger,
  normalizeTrigger,
  triggerCollisions
} = await commands('matchCommand.js');
const {
  claimTriggers,
  cleanTriggers,
  createCommand,
  defaultErrorMessage,
  newCommandId,
  normalizeCommand,
  normalizeCommands
} = await commands('commandSettings.js');
const { COMMAND_FORMATS, FORMAT_LIST, isKnownFormat } = await commands('formats.js');
const { componiErogato } = await commands('erogato.js');
const { TABLE_DISPLAY_ROWS, componiTabella } = await commands('tabella.js');
const serverFormats = await import(new URL('../src/db/commandFormats.js', import.meta.url).href);

/** A command as the panel keeps it, switched on, on a connection. */
const cmd = (overrides = {}) => ({
  id: 'erogato',
  name: 'Erogato',
  enabled: true,
  triggers: ['erogato'],
  connectionId: 'c1',
  sql: '',
  format: 'erogato',
  title: '',
  intro: '',
  maxRows: 10000,
  timeoutSeconds: 60,
  errorMessage: '',
  ...overrides
});
const pratiche = (overrides = {}) =>
  cmd({
    id: 'cmd-prat',
    name: 'Pratiche aperte',
    triggers: ['pratiche aperte', 'aperte'],
    format: 'table',
    sql: 'SELECT 1',
    ...overrides
  });

// ── which messages run which command ─────────────────────────────────────────

test('only the whole message, as a trigger word, runs the command', () => {
  const list = [cmd()];
  for (const text of [
    'erogato',
    'Erogato',
    '  EROGATO  ',
    'erogato?',
    'erogato.',
    'Erogato ?!',
    'erogato…'
  ]) {
    assert.equal(commandFor(text, list)?.id, 'erogato', text);
  }
  for (const text of [
    'erogato agos',
    'erogato luglio 2026',
    'erogato mutui?',
    'dammi l’erogato',
    'erogatoo',
    '',
    '   ',
    '?'
  ]) {
    assert.equal(commandFor(text, list), null, text);
  }
});

test('the trigger words are the admin’s, compared the same way', () => {
  const list = [cmd({ triggers: ['Erogato', 'quanto abbiamo erogato oggi?'] })];
  assert.equal(commandFor('quanto abbiamo   erogato oggi', list)?.id, 'erogato');
  assert.equal(commandFor('erogato', list)?.id, 'erogato');
  assert.equal(commandFor('erogato ieri', list), null);

  // a list the admin emptied: no word runs it, and a blank entry never matches an empty message
  assert.equal(commandFor('erogato', [cmd({ triggers: [] })]), null);
  assert.equal(commandFor('', [cmd({ triggers: ['', '  '] })]), null);
  assert.equal(matchesTrigger('erogato', undefined), false);
  assert.equal(normalizeTrigger(undefined), '');
});

test('a message is matched against every command that is on, and runs the right one', () => {
  const list = [cmd(), pratiche(), pratiche({ id: 'cmd-off', triggers: ['spenta'], enabled: false })];
  assert.equal(commandFor('Erogato?', list)?.id, 'erogato');
  assert.equal(commandFor('pratiche  aperte', list)?.id, 'cmd-prat');
  assert.equal(commandFor('aperte.', list)?.id, 'cmd-prat');
  assert.equal(commandFor('spenta', list), null);
  assert.equal(commandFor('pratiche chiuse', list), null);
  assert.equal(commandFor('erogato', []), null);
  assert.equal(commandFor('erogato', undefined), null);
  assert.equal(commandFor('erogato', null), null);
});

test('a word two commands share runs the first one of the list, every time', () => {
  const list = [
    pratiche({ id: 'primo', triggers: ['elenco'] }),
    pratiche({ id: 'secondo', triggers: ['Elenco!'] })
  ];
  assert.equal(commandFor('elenco', list)?.id, 'primo');
  assert.equal(commandFor('elenco', [...list].reverse())?.id, 'secondo');
  // a switched-off command does not take the word
  assert.equal(commandFor('elenco', [{ ...list[0], enabled: false }, list[1]])?.id, 'secondo');
});

test('a command is off unless it is switched on and can run', () => {
  assert.equal(commandFor('erogato', [cmd({ enabled: false })]), null);
  assert.equal(commandFor('erogato', [cmd({ connectionId: '' })]), null);
  // a format with no default query needs its own SQL; the erogato format does not
  assert.equal(isRunnable(cmd({ sql: '' })), true);
  assert.equal(isRunnable(pratiche({ sql: '  ' })), false);
  assert.equal(commandFor('aperte', [pratiche({ sql: '' })]), null);
  // a format this app does not know cannot be run (and "constructor" is not a format)
  assert.equal(isRunnable(pratiche({ format: 'pie' })), false);
  assert.equal(isRunnable(pratiche({ format: 'constructor' })), false);
  assert.equal(isCommandOn(pratiche({ enabled: false })), false);
  assert.equal(isCommandOn(pratiche()), true);
  assert.equal(isCommandOn(undefined), false);
});

test('a shortcut that names a command runs it whatever the text says, when it is on', () => {
  const list = [cmd(), pratiche()];
  assert.equal(commandFor('qualsiasi testo', list, 'erogato')?.id, 'erogato');
  assert.equal(commandFor('erogato', list, 'cmd-prat')?.id, 'cmd-prat');
  // off, deleted or incomplete: the text goes to the model, even when it is another command's word
  assert.equal(commandFor('erogato', [cmd({ enabled: false }), pratiche()], 'erogato'), null);
  assert.equal(commandFor('erogato', [cmd({ connectionId: '' })], 'erogato'), null);
  assert.equal(commandFor('erogato', [pratiche()], 'erogato'), null);
  assert.equal(commandFor('erogato', list, 'cmd-gone'), null);
  assert.equal(commandFor('erogato agos', list, ''), null);
  assert.equal(commandFor('erogato', list, '')?.id, 'erogato');
});

test('a shortcut shows the first word of its command, or the command’s name', () => {
  assert.equal(commandText(cmd({ triggers: ['  ', 'Erogato', 'altro'] })), 'Erogato');
  assert.equal(commandText(cmd({ triggers: [] })), 'Erogato');
  assert.equal(commandText(cmd({ triggers: [], name: '' })), '');
  assert.equal(commandText(undefined), '');
});

// ── trigger collisions ───────────────────────────────────────────────────────

test('a word used by two commands is a collision, however it is written', () => {
  const list = [
    cmd({ triggers: ['Erogato', 'oggi'] }),
    pratiche({ triggers: ['erogato?', 'aperte'] }),
    pratiche({ id: 'terzo', triggers: ['ErogaTO', 'aperte', 'solo mio'], enabled: false })
  ];
  assert.deepEqual(triggerCollisions(list), [
    { trigger: 'Erogato', commandIds: ['erogato', 'cmd-prat', 'terzo'] },
    { trigger: 'aperte', commandIds: ['cmd-prat', 'terzo'] }
  ]);
  // a command repeating its own word is not a collision, and blank words are not words
  assert.deepEqual(triggerCollisions([cmd({ triggers: ['erogato', 'Erogato?', '', ' '] }), pratiche()]), []);
  assert.deepEqual(triggerCollisions(undefined), []);
});

test('the panel leaves out a word another command already has, and says whose it is', () => {
  const others = [pratiche({ triggers: ['Pratiche aperte', 'aperte'] })];
  assert.deepEqual(
    claimTriggers(['erogato', 'aperte?', 'pratiche  APERTE', 'nuova', '  ', 'erogato'], others),
    {
      triggers: ['erogato', 'nuova'],
      rejected: [
        { trigger: 'aperte?', owner: 'Pratiche aperte' },
        { trigger: 'pratiche  APERTE', owner: 'Pratiche aperte' }
      ]
    }
  );
  assert.deepEqual(claimTriggers(['erogato'], []), { triggers: ['erogato'], rejected: [] });
  assert.deepEqual(cleanTriggers([' Erogato ', 'erogato.', '', 'altro']), ['Erogato', 'altro']);
});

test('a new command starts off, with no connection, from a preset or empty', () => {
  const preset = {
    format: 'erogato',
    name: 'Erogato',
    triggers: ['erogato'],
    sql: 'SELECT 1',
    errorMessage: 'Ops'
  };
  const fromPreset = createCommand([], preset);
  assert.deepEqual(fromPreset.rejected, []);
  assert.deepEqual(
    { ...fromPreset.command, id: 'x' },
    {
      id: 'x',
      name: 'Erogato',
      enabled: false,
      triggers: ['erogato'],
      connectionId: '',
      sql: 'SELECT 1',
      format: 'erogato',
      title: '',
      intro: '',
      maxRows: 10000,
      timeoutSeconds: 60,
      errorMessage: 'Ops'
    }
  );
  assert.match(fromPreset.command.id, /^cmd-[a-z0-9]{8}$/);

  const empty = createCommand([fromPreset.command]);
  assert.equal(empty.command.format, 'table');
  assert.equal(empty.command.enabled, false);
  assert.deepEqual(empty.command.triggers, []);
  assert.equal(empty.command.sql, '');
  assert.equal(empty.command.maxRows, 1000);
  assert.notEqual(empty.command.id, fromPreset.command.id);

  // the preset's word is taken: the new command comes without it
  const clash = createCommand([fromPreset.command], preset);
  assert.deepEqual(clash.command.triggers, []);
  assert.deepEqual(clash.rejected, [{ trigger: 'erogato', owner: 'Erogato' }]);
});

test('ids are generated, safe and never repeated', () => {
  const taken = [];
  for (let i = 0; i < 200; i++) {
    const id = newCommandId(taken.map(item => ({ id: item })));
    assert.match(id, /^cmd-[a-z0-9]{8}$/);
    assert.equal(taken.includes(id), false);
    taken.push(id);
  }
});

// ── the settings, and the old single command ─────────────────────────────────

test('the list is read as it is stored, with defaults for what is missing', () => {
  const [command] = normalizeCommands({ noAiCommands: [{ id: 'cmd-a', name: ' Pratiche ' }] });
  assert.deepEqual(command, {
    id: 'cmd-a',
    name: 'Pratiche',
    enabled: false,
    triggers: [],
    connectionId: '',
    sql: '',
    format: 'table',
    title: '',
    intro: '',
    maxRows: 10000,
    timeoutSeconds: 60,
    errorMessage: ''
  });
  assert.equal(normalizeCommand({ id: 'cmd-a', enabled: 'yes' }).enabled, false); // only exactly true
  assert.equal(normalizeCommand({ id: 'cmd-a', maxRows: 1e9 }).maxRows, 50000);
  assert.equal(normalizeCommand({ id: 'cmd-a' }).name, 'cmd-a');
  assert.equal(normalizeCommand({ id: 'a b' }), null);
  assert.equal(normalizeCommand({ name: 'senza id' }), null);
  assert.deepEqual(
    normalizeCommands({ noAiCommands: [null, 'x', { id: 'cmd-a' }, { id: 'cmd-a', name: 'bis' }] }).map(
      c => c.name
    ),
    ['cmd-a']
  );
});

test('the old erogatoCommand becomes the command "erogato", the same one every time', () => {
  const stored = {
    erogatoCommand: {
      enabled: true,
      connectionId: 'gewbWDMcPqVp6RV86BIR',
      sql: '',
      triggers: ['erogato', 'Erogato oggi'],
      maxRows: 12000,
      timeoutSeconds: 90,
      errorMessage: 'Riprova.'
    }
  };
  const first = normalizeCommands(stored);
  assert.deepEqual(first, [
    {
      id: 'erogato',
      name: 'Erogato',
      enabled: true,
      triggers: ['erogato', 'Erogato oggi'],
      connectionId: 'gewbWDMcPqVp6RV86BIR',
      sql: '', // the server runs the format's default query for an empty one
      format: 'erogato',
      title: '',
      intro: '',
      maxRows: 12000,
      timeoutSeconds: 90,
      errorMessage: 'Riprova.'
    }
  ]);
  assert.deepEqual(normalizeCommands(structuredClone(stored)), first);

  // and it works in the chat without saving anything
  assert.equal(commandFor('erogato', first)?.id, 'erogato');
  assert.equal(commandFor('whatever', first, 'erogato')?.id, 'erogato');
});

test('an old command with its own SQL keeps it, and a partial one gets the old defaults', () => {
  const [own] = normalizeCommands({
    erogatoCommand: { enabled: false, connectionId: 'c1', sql: 'SELECT 1' }
  });
  assert.equal(own.sql, 'SELECT 1');
  assert.equal(own.enabled, false);

  const [partial] = normalizeCommands({ erogatoCommand: { enabled: true } });
  assert.deepEqual(partial.triggers, ['erogato']);
  assert.match(partial.errorMessage, /^Non sono riuscito a leggere l'erogato/);
  assert.equal(partial.maxRows, 10000);
  assert.equal(partial.timeoutSeconds, 60);

  // an emptied list of words is the admin's choice
  assert.deepEqual(normalizeCommands({ erogatoCommand: { triggers: [] } })[0].triggers, []);
});

test('once the list exists, the old command is not read again', () => {
  const old = { enabled: true, connectionId: 'c1' };
  assert.deepEqual(normalizeCommands({ noAiCommands: [], erogatoCommand: old }), []);
  assert.deepEqual(
    normalizeCommands({ noAiCommands: [{ id: 'cmd-a' }], erogatoCommand: old }).map(c => c.id),
    ['cmd-a']
  );
  assert.deepEqual(normalizeCommands(null), []);
  assert.deepEqual(normalizeCommands({}), []);
});

test('a command that fails says so with the admin’s message, or a default that names it', () => {
  assert.equal(
    defaultErrorMessage({ name: 'Pratiche aperte' }),
    'Non sono riuscito a eseguire «Pratiche aperte» in questo momento, riprova tra poco.'
  );
  assert.match(defaultErrorMessage(undefined), /«il comando»/);
});

// ── the format registry ──────────────────────────────────────────────────────

test('the formats are the same in the browser and on the server', () => {
  assert.deepEqual(Object.keys(COMMAND_FORMATS).sort(), Object.keys(serverFormats.COMMAND_FORMATS).sort());
  for (const [id, format] of Object.entries(COMMAND_FORMATS)) {
    assert.equal(typeof format.compose, 'function', id);
    assert.ok(format.label && format.summary, id);
    // a format the browser lets stay empty is one the server has a default query for
    assert.equal(format.hasDefaultSql, Boolean(serverFormats.COMMAND_FORMATS[id].defaultSql), id);
  }
  assert.deepEqual(
    FORMAT_LIST.map(entry => entry.id),
    Object.keys(COMMAND_FORMATS)
  );
  assert.equal(isKnownFormat('table'), true);
  for (const unknown of ['pie', '', undefined, null, 'constructor', 'toString', '__proto__']) {
    assert.equal(isKnownFormat(unknown), false, String(unknown));
  }
});

test('each format writes its answer from the rows and the command', () => {
  const rows = [{ nome: 'Rossi', totale: 3 }];
  const table = COMMAND_FORMATS.table.compose({
    rows,
    columns: ['nome', 'totale'],
    command: { title: 'Clienti', intro: 'Ecco.' }
  });
  assert.match(table, /^\*\*Clienti\*\*\n\nEcco\.\n\n\| Nome \| Totale \|/);
  assert.match(
    COMMAND_FORMATS.erogato.compose({ rows: [], columns: [], command: cmd() }),
    /^Nessuna pratica liquidata/
  );
});

test('a stored reply says that a command answered, by name', () => {
  assert.equal(COMMAND_MODEL, 'comando');
  assert.equal(commandReplyLabel({ model: 'comando', command: 'Erogato' }), 'comando «Erogato», senza AI');
  assert.equal(commandReplyLabel({ model: 'comando' }), 'comando, senza AI');
  // the first version stored the id in the model
  assert.equal(commandReplyLabel({ model: 'comando-erogato' }), 'comando «erogato», senza AI');
  assert.equal(commandReplyLabel({ model: 'gemini-2.5-flash' }), null);
  assert.equal(commandReplyLabel({ model: null }), null);
  assert.equal(commandReplyLabel(undefined), null);
});

// ── the answer of the erogato format ─────────────────────────────────────────

const row = (overrides = {}) => ({
  oggi: '2026-11-19',
  prodotto: 'Mutuo',
  cur: 1,
  anno: 2026,
  mese: 11,
  banca: 'Banca di prova',
  dt: 'Rossi',
  fuori_sistema: 'NO',
  pratiche: '10',
  erogato: '2500000.00',
  mediazione: '10000.00',
  con_data_da_cambio_stato: '0',
  ...overrides
});

test('the erogato answer is written from the rows, with the date of the database', () => {
  const markdown = componiErogato([
    row(),
    row({ cur: 0, anno: 2025, pratiche: '8', erogato: '2000000.00' }),
    row({ prodotto: 'Prestito', pratiche: '2', erogato: '40000.00', mediazione: '0' }),
    row({ mese: 10, pratiche: '5', erogato: '900000.00' }),
    row({ fuori_sistema: 'SI', dt: 'Gheri', pratiche: '1', erogato: '100000.00' })
  ]);

  assert.match(markdown, /^\*\*Erogato · aggiornato al 19\/11\/2026\*\*/);
  assert.match(markdown, /### Novembre 2026 \(dal 1 al 19\) · tutti i prodotti/);
  assert.match(markdown, /\| 🏠 Mutui \| 11 \| EUR 2,6 Mln \| ▲ 30,0% \|/);
  assert.match(markdown, /\| ↳ di cui fuori sistema \| 1 \| EUR 100 mila \| \|/);
  assert.match(markdown, /### Direttori territoriali/);
  assert.match(markdown, /### Prime 5 banche/);
  assert.match(markdown, /_Criterio: /);
});

test('with no rows the erogato answer says there is nothing to show', () => {
  assert.match(componiErogato([]), /^Nessuna pratica liquidata visibile da inizio anno\./);
});

// ── the answer of the table format ───────────────────────────────────────────

test('the table has a header, an alignment row and one line per row, with Italian numbers', () => {
  const markdown = componiTabella(
    [
      { numero_pratiche: 1234, importo: '450000.50', quota: 12.5, banca: 'Agos', note: null },
      { numero_pratiche: 7, importo: '0.00', quota: 0.333, banca: 'Findomestic', note: 'a | b\nc' }
    ],
    { columns: ['numero_pratiche', 'importo', 'quota', 'banca', 'note'] }
  );
  assert.equal(
    markdown,
    [
      '| Numero pratiche | Importo | Quota | Banca | Note |',
      '|---:|---:|---:|---|---|',
      '| 1.234 | 450.000,50 | 12,5 | Agos |  |',
      '| 7 | 0,00 | 0,33 | Findomestic | a / b c |'
    ].join('\n')
  );
});

test('years, ids and codes are not written as quantities, and dates as dd/mm/yyyy', () => {
  const markdown = componiTabella([
    {
      anno: 2026,
      id: 120000,
      telefono: '3331234567',
      iban_cod: '00123',
      aperta: '2026-11-19T00:00:00.000Z',
      aggiornata: '2026-11-19T14:30:05.000Z',
      giorno: '2026-03-02',
      attiva: true,
      chiusa: false
    }
  ]);
  const [, , line] = markdown.split('\n');
  assert.equal(
    line,
    '| 2026 | 120000 | 3331234567 | 00123 | 19/11/2026 | 19/11/2026 14:30 | 02/03/2026 | Sì | No |'
  );
});

test('a column of numbers is right-aligned even with an empty cell; a mixed one is not', () => {
  const [, align] = componiTabella(
    [
      { a: 1, b: 'x', c: 2 },
      { a: null, b: 'y', c: 'n.d.' }
    ],
    { columns: ['a', 'b', 'c'] }
  ).split('\n');
  assert.equal(align, '|---:|---|---|');
});

test('only the first rows are shown, and the note says how many there were', () => {
  const rows = Array.from({ length: TABLE_DISPLAY_ROWS + 25 }, (_, i) => ({ n: i + 1 }));
  const lines = componiTabella(rows).split('\n');
  // header, alignment row, the rows shown, a blank line and the note
  assert.equal(lines.length, 2 + TABLE_DISPLAY_ROWS + 2);
  assert.equal(lines.at(-3), `| ${TABLE_DISPLAY_ROWS} |`);
  assert.equal(lines.at(-1), `_Mostro le prime ${TABLE_DISPLAY_ROWS} righe su ${rows.length}._`);

  // exactly the cap: no note
  assert.equal(componiTabella(rows.slice(0, TABLE_DISPLAY_ROWS)).includes('_Mostro'), false);
});

test('the title and the intro come first, and an empty result says so', () => {
  assert.equal(
    componiTabella([{ a: 1 }], { title: ' Pratiche | aperte ', intro: 'Aggiornato in tempo reale.' }),
    '**Pratiche / aperte**\n\nAggiornato in tempo reale.\n\n| A |\n|---:|\n| 1 |'
  );
  assert.equal(componiTabella([]), 'Nessun risultato.');
  assert.equal(componiTabella([], { title: 'Titolo' }), '**Titolo**\n\nNessun risultato.');
  // no columns given: read from the first row
  assert.match(componiTabella([{ x: 'y' }]), /^\| X \|/);
});
