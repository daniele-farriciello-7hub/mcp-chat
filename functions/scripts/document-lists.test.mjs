/**
 * Tests the lists of documents without AI (src/features/chat/documentLists/): how a list is kept in the settings,
 * which message shows it (the same words rules as the commands, and no word shared with a command or another list), which
 * documents it picks (a rule over the catalog or a hand-made list, studied and archive-only documents alike), the
 * reply the chat builds from it with no model call, and the pieces around it: the date of a document, the limits of a
 * listing, the shortcuts that point to a list. The browser code is loaded as it is (support/src-alias.mjs);
 * Firebase, which a few modules reach for, is mocked. Run: npm test.
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { registerSrcAlias } from './support/src-alias.mjs';

registerSrcAlias();
const src = file => new URL(`../../src/${file}`, import.meta.url).href;

// ── Firebase, replaced ───────────────────────────────────────────────────────

const world = { catalog: [], catalogError: null, calls: 0 };
const reset = () => Object.assign(world, { catalog: [], catalogError: null, calls: 0 });

mock.module(src('features/documents/chatCatalog.js'), {
  namedExports: {
    getChatCatalog: async () => {
      world.calls++;
      if (world.catalogError) throw world.catalogError;
      return world.catalog;
    }
  }
});
mock.module(src('shared/firebase/functions.js'), { namedExports: { callFunction: async () => ({}) } });
mock.module(src('features/settings/settingsStore.js'), {
  namedExports: { getSettings: async () => ({}), saveSettingsFields: async () => ({}) }
});

const { documentDateMs, documentDay, formatDocumentDay, byRecent, byName, nameDateMs } = await import(
  src('features/documents/documentDate.js')
);
const { DEFAULT_LISTING_FILES, MAX_LISTING_FILES, clampListingLimit } = await import(
  src('features/documents/listingLimits.js')
);
const {
  LIST_SELECTION,
  LIST_SORT,
  MAX_FIXED_DOCUMENTS,
  createDocumentList,
  defaultEmptyMessage,
  listTitle,
  newDocumentListId,
  normalizeDocumentList,
  normalizeDocumentLists
} = await import(src('features/chat/documentLists/documentListSettings.js'));
const {
  DOCUMENT_LIST_MODEL,
  documentListFor,
  documentListReplyLabel,
  documentListText,
  isDocumentListOn,
  isDocumentListRunnable
} = await import(src('features/chat/documentLists/matchDocumentList.js'));
const { catalogEntryOf, selectDocuments } = await import(
  src('features/chat/documentLists/selectDocuments.js')
);
const { DOCUMENT_LIST_ERROR_MESSAGE, streamDocumentListReply } = await import(
  src('features/chat/documentLists/streamDocumentListReply.js')
);
const { claimTriggers, normalizeCommand } = await import(src('features/chat/commands/commandSettings.js'));
const { COMMAND_MODEL, commandFor, commandReplyLabel, triggerCollisions } = await import(
  src('features/chat/commands/matchCommand.js')
);
const { TARGET_KIND, isTargetOn, noAiTargets, targetLabel } = await import(
  src('features/shortcuts/noAiTargets.js')
);
const { shortcutSummary, shortcutText } = await import(src('features/shortcuts/personalShortcuts.js'));

beforeEach(reset);

const CATEGORIES = ['Comunicazioni', 'Direzione', 'Mutuo', 'Modulistica'];
const day = (y, m, d) => Date.UTC(y, m - 1, d, 12);

const entry = (id, name, extra = {}) => ({
  id,
  name,
  mode: 'studied',
  categories: [],
  date: null,
  ...extra
});

/** A list as the settings hold it, with what the test cares about. */
const list = (extra = {}) =>
  normalizeDocumentList({ id: 'list-comunic', name: 'Comunicazioni', enabled: true, ...extra });

// ── the date of a document ───────────────────────────────────────────────────

test('a Drive document is dated by the last change on Drive, an upload by when it was uploaded', () => {
  const drive = {
    driveModifiedTime: '2026-11-25T08:30:00.000Z',
    createdAt: { toMillis: () => day(2026, 12, 1) }
  };
  assert.equal(documentDateMs(drive), Date.parse('2026-11-25T08:30:00.000Z'));
  // a Firestore Timestamp, as it comes from the SDK
  assert.equal(documentDateMs({ createdAt: { toMillis: () => day(2026, 11, 3) } }), day(2026, 11, 3));
  // `{seconds, nanoseconds}`, as it comes from a JSON copy
  assert.equal(
    documentDateMs({ createdAt: { seconds: 1_700_000_000, nanoseconds: 500_000_000 } }),
    1_700_000_000_500
  );
  // a write not yet confirmed has no createdAt: the index time stands in, then nothing
  assert.equal(documentDateMs({ createdAt: null, indexedAt: { toMillis: () => 42 } }), 42);
  assert.equal(documentDateMs({}), null);
  assert.equal(documentDateMs(null), null);
  // a date that is not one is ignored, not turned into NaN
  assert.equal(documentDateMs({ driveModifiedTime: 'mai', createdAt: { toMillis: () => 7 } }), 7);
});

test('a date written in the name wins over the dates the document carries', () => {
  const uploaded = {
    createdAt: { toMillis: () => day(2026, 11, 27) },
    driveModifiedTime: '2026-11-27T09:00:00.000Z'
  };
  // ISO, with the separators a file name may use
  for (const name of [
    'Comunicazione - 2026-11-25 - Orari.pdf',
    'Comunicazione_2026_11_25_Orari.pdf',
    'Comunicazione 2026.11.25.pdf'
  ]) {
    assert.equal(documentDateMs({ name, ...uploaded }), day(2026, 11, 25), name);
  }
  // Italian, day first
  for (const name of [
    'Comunicazione 25-11-2026.pdf',
    'Comunicazione 25/11/2026.pdf',
    'Comunicazione 25.11.2026.pdf'
  ]) {
    assert.equal(documentDateMs({ name, ...uploaded }), day(2026, 11, 25), name);
  }
  // it is a calendar day: what is displayed is the day the name says, in winter and in summer
  assert.equal(documentDay(documentDateMs({ name: 'Avviso 2026-11-25.pdf' })), '2026-11-25');
  assert.equal(documentDay(documentDateMs({ name: 'Avviso 2026-07-01.pdf' })), '2026-07-01');
  assert.equal(documentDay(documentDateMs({ name: 'Avviso 31/12/2026.pdf' })), '2026-12-31');
  assert.equal(documentDay(documentDateMs({ name: 'Avviso 2026-01-01.pdf' })), '2026-01-01');
  // the first valid one counts
  assert.equal(nameDateMs('Comunicazione 2026-11-25 (sostituisce 2026-10-02).pdf'), day(2026, 11, 25));
  assert.equal(nameDateMs('Allegato 2026-14-01 a comunicazione 03/02/2026.pdf'), day(2026, 2, 3));
});

test('a name with a date that is not one, or with none, is dated like before', () => {
  const uploaded = { createdAt: { toMillis: () => day(2026, 11, 27) } };
  // not a real date: month 13, day 45, 31 April, 29 February of a common year, a year out of range
  for (const name of [
    'Comunicazione 2026-13-45.pdf',
    'Comunicazione 45-13-2026.pdf',
    'Comunicazione 2026-04-31.pdf',
    'Comunicazione 29/02/2026.pdf',
    'Comunicazione 1999-12-31.pdf',
    'Comunicazione 31-12-2100.pdf',
    'Comunicazione 2026-00-10.pdf'
  ]) {
    assert.equal(nameDateMs(name), null, name);
    assert.equal(documentDateMs({ name, ...uploaded }), day(2026, 11, 27), name);
  }
  // a leap day is one
  assert.equal(nameDateMs('Verbale 29-02-2028.pdf'), day(2028, 2, 29));
  // numbers that are not a date: part of a longer number, or no year, or mixed separators
  for (const name of [
    'Modulo 12026-11-25.pdf',
    'Pratica 20261125.pdf',
    'Comunicazione 25-11.pdf',
    'Comunicazione 2026-11/25.pdf',
    'Comunicazione 25-11-20269.pdf',
    'Policy mutui.pdf',
    ''
  ]) {
    assert.equal(nameDateMs(name), null, name);
  }
  assert.equal(nameDateMs(undefined), null);
  assert.equal(nameDateMs(null), null);
  assert.equal(nameDateMs(42), null);
  // no date in the name: the chain of the document itself, unchanged
  assert.equal(documentDateMs({ name: 'Policy mutui.pdf', ...uploaded }), day(2026, 11, 27));
  assert.equal(documentDateMs({ name: 'Policy mutui.pdf' }), null);
  assert.equal(
    documentDateMs({ name: 'Policy.pdf', createdAt: null, indexedAt: { toMillis: () => 42 } }),
    42
  );
});

test('documents uploaded the same day are sorted by the date in their names, newest first', () => {
  // the real case: a whole batch synced on one day, so every other date ties
  const synced = {
    createdAt: { toMillis: () => day(2026, 11, 27) },
    driveModifiedTime: '2026-11-27T07:00:00.000Z'
  };
  const documents = [
    { id: 'd1', name: 'Comunicazione - 2026-11-03 - Ferie.pdf' },
    { id: 'd2', name: 'Comunicazione - 2026-11-25 - Orari.pdf' },
    { id: 'd3', name: 'Comunicazione - 25-10-2026 - Sicurezza.pdf' },
    { id: 'd4', name: 'Comunicazione - 2026-11-12 - Premi.pdf' },
    { id: 'd5', name: 'Comunicazione - senza data.pdf' }
  ].map(d => ({ ...d, ...synced }));
  const sorted = documents
    .map(d => entry(d.id, d.name, { date: documentDateMs(d) }))
    .sort((x, y) => byRecent(x, y) || byName(x, y));
  // the undated one keeps the sync date (27/11), which is the latest of all
  assert.deepEqual(
    sorted.map(e => e.id),
    ['d5', 'd2', 'd4', 'd1', 'd3']
  );
  // and through the catalog entry of the panel and the selection of a list
  const catalog = documents.filter(d => d.id !== 'd5').map(d => catalogEntryOf(d, CATEGORIES));
  assert.deepEqual(
    selectDocuments(catalog, list()).map(e => e.id),
    ['d2', 'd4', 'd1', 'd3']
  );
});

test('the day of a document is the calendar day in Rome, and is read back as dd/mm/yyyy', () => {
  assert.equal(documentDay(Date.UTC(2026, 10, 25, 12)), '2026-11-25');
  // 23:30 UTC on the 24th is already the 25th in Rome (UTC+1 in winter)
  assert.equal(documentDay(Date.UTC(2026, 10, 24, 23, 30)), '2026-11-25');
  assert.equal(documentDay(null), null);
  assert.equal(documentDay(NaN), null);
  assert.equal(formatDocumentDay('2026-11-25'), '25/11/2026');
  assert.equal(formatDocumentDay('ieri'), '');
  assert.equal(formatDocumentDay(null), '');
});

test('"most recent first" puts undated documents last and leaves a tie to the caller', () => {
  const sorted = [
    entry('a', 'A', { date: day(2026, 1, 1) }),
    entry('n', 'N'),
    entry('b', 'B', { date: day(2026, 3, 1) }),
    entry('c', 'C', { date: day(2026, 1, 1) })
  ].sort((x, y) => byRecent(x, y) || byName(x, y));
  assert.deepEqual(
    sorted.map(e => e.id),
    ['b', 'a', 'c', 'n']
  );
  assert.equal(byRecent(entry('x', 'X', { date: 5 }), entry('y', 'Y', { date: 5 })), 0);
  // numbers in names are read as numbers
  assert.ok(byName(entry('2', 'Comunicazione 2'), entry('10', 'Comunicazione 10')) < 0);
});

// ── how many files ───────────────────────────────────────────────────────────

test('a listing is six files unless a number is asked for, and never more than fifty', () => {
  assert.equal(DEFAULT_LISTING_FILES, 6);
  assert.equal(MAX_LISTING_FILES, 50);
  assert.equal(clampListingLimit(20), 20);
  assert.equal(clampListingLimit('15'), 15);
  assert.equal(clampListingLimit(12.4), 12);
  assert.equal(clampListingLimit(51), 50);
  assert.equal(clampListingLimit(9999), 50);
  for (const bad of [0, -1, NaN, 'tanti', null, undefined, '']) {
    assert.equal(clampListingLimit(bad), 6, String(bad));
  }
  assert.equal(clampListingLimit(undefined, 10), 10);
});

// ── a list in the settings ───────────────────────────────────────────────────

test('a list needs a safe id, everything else has a default', () => {
  assert.equal(normalizeDocumentList(null), null);
  assert.equal(normalizeDocumentList({ name: 'senza id' }), null);
  assert.equal(normalizeDocumentList({ id: 'ha spazi' }), null);
  assert.equal(normalizeDocumentList({ id: '../x' }), null);

  assert.deepEqual(normalizeDocumentList({ id: 'list-abc' }), {
    id: 'list-abc',
    name: 'list-abc',
    enabled: false,
    triggers: [],
    title: '',
    intro: '',
    emptyMessage: '',
    selection: 'rule',
    categories: [],
    nameContains: '',
    sort: 'recent',
    limit: 6,
    documentIds: []
  });
});

test('what an admin typed is cleaned: limit between 1 and 50, no repeats, no blanks, fifty hand-picked files at most', () => {
  const clean = normalizeDocumentList({
    id: 'list-x',
    name: '  Moduli  ',
    enabled: true,
    triggers: ['moduli', 7, 'moduli mutuo'],
    selection: 'fixed',
    categories: ['Mutuo', ' mutuo ', '', 3, 'Direzione'],
    nameContains: '  Direzione ',
    sort: 'name',
    limit: 400,
    documentIds: ['a', 'b', 'a', '', '  ', ...Array.from({ length: 80 }, (_, i) => `d${i}`)]
  });
  assert.equal(clean.name, 'Moduli');
  assert.deepEqual(clean.triggers, ['moduli', 'moduli mutuo']);
  assert.equal(clean.selection, 'fixed');
  assert.deepEqual(clean.categories, ['Mutuo', 'Direzione']);
  assert.equal(clean.nameContains, 'Direzione');
  assert.equal(clean.sort, 'name');
  assert.equal(clean.limit, 50);
  assert.equal(clean.documentIds.length, MAX_FIXED_DOCUMENTS);
  assert.deepEqual(clean.documentIds.slice(0, 3), ['a', 'b', 'd0']);
  // anything unknown is the default
  const odd = normalizeDocumentList({ id: 'list-y', selection: 'magic', sort: 'caos', limit: 'x' });
  assert.equal(odd.selection, 'rule');
  assert.equal(odd.sort, 'recent');
  assert.equal(odd.limit, 6);
});

test('the lists of the settings are the array, cleaned; the first of two with one id wins; no array is no lists', () => {
  assert.deepEqual(normalizeDocumentLists({}), []);
  assert.deepEqual(normalizeDocumentLists(undefined), []);
  assert.deepEqual(normalizeDocumentLists({ noAiDocumentLists: 'no' }), []);
  const lists = normalizeDocumentLists({
    noAiDocumentLists: [
      { id: 'list-a', name: 'Prima' },
      null,
      { id: 'list-a', name: 'Doppia' },
      { id: 'list-b' }
    ]
  });
  assert.deepEqual(
    lists.map(l => l.name),
    ['Prima', 'list-b']
  );
  // an empty array is the admin's choice
  assert.deepEqual(normalizeDocumentLists({ noAiDocumentLists: [] }), []);
});

test('a new list is off, a rule for the six most recent documents, with an id of its own', () => {
  const taken = [{ id: 'list-aaaaaaaa' }, { id: 'cmd-bbbbbbbb' }];
  const created = createDocumentList(taken);
  assert.match(created.id, /^list-[a-z0-9]{8}$/);
  assert.ok(!taken.some(item => item.id === created.id));
  assert.equal(created.enabled, false);
  assert.equal(created.selection, 'rule');
  assert.equal(created.sort, 'recent');
  assert.equal(created.limit, 6);
  assert.deepEqual(created.triggers, []);
  // the id of a command never collides: they have another prefix, and `newDocumentListId` skips any taken one
  for (let i = 0; i < 20; i++) assert.ok(newDocumentListId(taken).startsWith('list-'));
});

test('the card title is the title, else the name; the empty message is the admin’s, else a default with the name', () => {
  assert.equal(
    listTitle(list({ title: ' Ultime comunicazioni ', name: 'Comunicazioni' })),
    'Ultime comunicazioni'
  );
  assert.equal(listTitle(list({ title: '' })), 'Comunicazioni');
  assert.ok(defaultEmptyMessage(list()).includes('«Comunicazioni»'));
});

// ── which message shows a list ───────────────────────────────────────────────

test('a message shows a list only when it is exactly one of its words, as for a command', () => {
  const lists = [list({ triggers: ['comunicazioni', 'ultime comunicazioni'] })];
  for (const text of ['comunicazioni', 'Comunicazioni?', '  ULTIME   comunicazioni. ', 'comunicazioni!!']) {
    assert.equal(documentListFor(text, lists)?.id, 'list-comunic', text);
  }
  for (const text of ['comunicazioni di ottobre', 'le comunicazioni', '', '   ', 'comunicazione']) {
    assert.equal(documentListFor(text, lists), null, text);
  }
  assert.equal(documentListFor('comunicazioni', [], null), null);
  assert.equal(documentListFor('comunicazioni', undefined), null);
});

test('a list that is off, or fixed with no document, does not answer', () => {
  const words = ['comunicazioni'];
  assert.equal(documentListFor('comunicazioni', [list({ triggers: words, enabled: false })]), null);
  const empty = list({ triggers: words, selection: 'fixed', documentIds: [] });
  assert.equal(isDocumentListRunnable(empty), false);
  assert.equal(isDocumentListOn(empty), false);
  assert.equal(documentListFor('comunicazioni', [empty]), null);
  const chosen = list({ triggers: words, selection: 'fixed', documentIds: ['a'] });
  assert.equal(isDocumentListOn(chosen), true);
  assert.equal(documentListFor('comunicazioni', [chosen])?.id, 'list-comunic');
  // a rule always can run: it may match nothing, and then says so
  assert.equal(isDocumentListRunnable(list()), true);
});

test('a shortcut that names a list shows it whatever the text says, if it exists and is on', () => {
  const lists = [list({ triggers: ['comunicazioni'] }), list({ id: 'list-off', enabled: false })];
  assert.equal(documentListFor('una frase qualunque', lists, 'list-comunic')?.id, 'list-comunic');
  assert.equal(documentListFor('comunicazioni', lists, 'list-altro'), null);
  assert.equal(documentListFor('comunicazioni', lists, 'list-off'), null);
  // the id of a command is nothing to a list: the text goes on to the model
  assert.equal(documentListFor('comunicazioni', lists, 'cmd-12345678'), null);
});

test('with two lists sharing a word, the first of the list answers', () => {
  const lists = [list({ id: 'list-1', triggers: ['moduli'] }), list({ id: 'list-2', triggers: ['Moduli?'] })];
  assert.equal(documentListFor('moduli', lists)?.id, 'list-1');
});

test('a shortcut writes the list’s first word in the chat, or its name, as it does for a command', () => {
  assert.equal(documentListText(list({ triggers: ['  ', 'comunicazioni', 'altro'] })), 'comunicazioni');
  assert.equal(documentListText(list({ triggers: [] })), 'Comunicazioni');
  assert.equal(documentListText(undefined), '');
});

// ── words shared with a command, or with another list ────────────────────────

const command = (extra = {}) =>
  normalizeCommand({ id: 'cmd-erogato', name: 'Erogato', enabled: true, triggers: ['erogato'], ...extra });

test('a word of a command cannot be given to a list, nor the other way round, nor to two lists', () => {
  const commands = [command()];
  const others = [...commands, list({ id: 'list-uno', name: 'Moduli', triggers: ['moduli'] })];

  const mine = claimTriggers(['Erogato?', 'moduli', 'comunicazioni', 'comunicazioni '], others);
  assert.deepEqual(mine.triggers, ['comunicazioni']);
  assert.deepEqual(
    mine.rejected.map(r => [r.trigger, r.owner]),
    [
      ['Erogato?', 'Erogato'],
      ['moduli', 'Moduli']
    ]
  );

  // the commands' panel is given the lists too, and refuses their words
  const forCommand = claimTriggers(['moduli', 'nuovo'], [list({ triggers: ['Moduli'] })]);
  assert.deepEqual(forCommand.triggers, ['nuovo']);
  assert.equal(forCommand.rejected[0].owner, 'Comunicazioni');
});

test('a clash across a command and a list is reported against both', () => {
  const clashes = triggerCollisions([
    command({ triggers: ['moduli'] }),
    list({ triggers: ['Moduli.'] }),
    list({ id: 'list-2' })
  ]);
  assert.equal(clashes.length, 1);
  assert.deepEqual(clashes[0].commandIds, ['cmd-erogato', 'list-comunic']);
});

test('if a word did reach a command and a list, the command runs: it is looked for first', () => {
  const commands = [command({ triggers: ['moduli'], connectionId: 'conn1', sql: 'SELECT 1' })];
  const lists = [list({ triggers: ['moduli'] })];
  // useConversation: the command, and only without one the list
  const found = commandFor('moduli', commands) ?? documentListFor('moduli', lists);
  assert.equal(found.id, 'cmd-erogato');
  // a shortcut naming the list is not stopped by the command: the command ignores an id that is not its own
  assert.equal(commandFor('moduli', commands, 'list-comunic'), null);
  assert.equal(documentListFor('moduli', lists, 'list-comunic')?.id, 'list-comunic');
});

// ── which documents a list picks ─────────────────────────────────────────────

const CATALOG = [
  entry('c-0910', 'Comunicazione 10-09.pdf', { categories: ['Comunicazioni'], date: day(2026, 9, 10) }),
  entry('c-1125', 'Comunicazione Direzione 25-11.pdf', {
    categories: ['Comunicazioni', 'Direzione'],
    date: day(2026, 11, 25)
  }),
  entry('c-1112', 'Comunicazione Direzione 12-11.pdf', {
    categories: ['Comunicazioni', 'Direzione'],
    date: day(2026, 11, 12),
    mode: 'archive'
  }),
  entry('c-1124', 'Comunicazione 24-11.pdf', { categories: ['Comunicazioni'], date: day(2026, 11, 24) }),
  entry('c-nodate', 'Comunicazione senza data.pdf', { categories: ['Comunicazioni'] }),
  entry('mod-1', 'Modulo privacy.pdf', {
    categories: ['Modulistica', 'Mutuo'],
    date: day(2026, 8, 1),
    mode: 'archive'
  }),
  entry('mod-2', 'Delega.pdf', { categories: ['Modulistica'], date: day(2026, 10, 1), mode: 'archive' }),
  entry('policy', 'Policy mutui.pdf', { categories: ['Mutuo'], date: day(2026, 7, 7) })
];
const pick = (extra, catalog = CATALOG) =>
  selectDocuments(catalog, list(extra), { categories: CATEGORIES }).map(e => e.id);

test('a rule picks the most recent documents of a category, studied and archive-only alike, newest first', () => {
  assert.deepEqual(pick({ categories: ['Comunicazioni'], limit: 20 }), [
    'c-1125',
    'c-1124',
    'c-1112',
    'c-0910',
    'c-nodate'
  ]);
  // "le ultime 3": the three newest, not the first three in the catalog
  assert.deepEqual(pick({ categories: ['Comunicazioni'], limit: 3 }), ['c-1125', 'c-1124', 'c-1112']);
});

test('a rule with several categories takes a document that has any of them; with none it takes every document', () => {
  assert.deepEqual(pick({ categories: ['Modulistica', 'Mutuo'], limit: 20 }), ['mod-2', 'mod-1', 'policy']);
  assert.equal(pick({ categories: [], limit: 50 }).length, CATALOG.length);
  // the default limit is six
  assert.equal(pick({ categories: [] }).length, 6);
});

test('a rule can ask for a word in the name, with capitals, accents and punctuation not mattering', () => {
  assert.deepEqual(pick({ nameContains: 'direzione', limit: 20 }), ['c-1125', 'c-1112']);
  assert.deepEqual(pick({ nameContains: 'DIREZIONE', categories: ['Direzione'], limit: 20 }), [
    'c-1125',
    'c-1112'
  ]);
  assert.deepEqual(pick({ nameContains: 'direzione 25 11' }), ['c-1125']);
  assert.deepEqual(pick({ nameContains: 'inesistente' }), []);
  // the word and the category together: both must hold
  assert.deepEqual(pick({ nameContains: 'privacy', categories: ['Comunicazioni'] }), []);
});

test('a rule can sort by name, with the numbers read as numbers', () => {
  const numbered = [2, 10, 1].map(n => entry(`n${n}`, `Circolare ${n}.pdf`));
  assert.deepEqual(
    selectDocuments(numbered, list({ sort: 'name' })).map(e => e.id),
    ['n1', 'n2', 'n10']
  );
  assert.deepEqual(pick({ categories: ['Modulistica'], sort: 'name' }), ['mod-2', 'mod-1']);
});

test('a category taken off the admins’ list matches nothing, it does not turn the rule into "every document"', () => {
  const stale = list({ categories: ['Vecchia'] });
  assert.deepEqual(selectDocuments(CATALOG, stale, { categories: CATEGORIES }), []);
  // one still there and one gone: the one that is there counts
  assert.deepEqual(pick({ categories: ['Vecchia', 'Modulistica'], limit: 20 }), ['mod-2', 'mod-1']);
  // spelled differently in the settings: the list's spelling wins
  assert.deepEqual(pick({ categories: ['modulistica'], limit: 20 }), ['mod-2', 'mod-1']);
});

test('a hand-made list is in the order chosen, skips what is gone and does not repeat', () => {
  assert.deepEqual(
    pick({ selection: 'fixed', documentIds: ['policy', 'cancellato', 'c-1125', 'policy', 'mod-1'] }),
    ['policy', 'c-1125', 'mod-1']
  );
  assert.deepEqual(pick({ selection: 'fixed', documentIds: ['cancellato'] }), []);
  // the rule's fields mean nothing to it
  assert.deepEqual(
    pick({ selection: 'fixed', documentIds: ['mod-1'], categories: ['Comunicazioni'], limit: 1 }),
    ['mod-1']
  );
  // no list, no documents, no catalog: nothing, and no error
  assert.deepEqual(selectDocuments(CATALOG, null), []);
  assert.deepEqual(selectDocuments(undefined, list()), []);
});

test('a hand-made list of fifty is shown whole, and no list ever shows more than fifty', () => {
  const many = Array.from({ length: 70 }, (_, i) =>
    entry(`d${i}`, `Doc ${i}.pdf`, { date: day(2026, 1, 1) + i })
  );
  const fixed = list({ selection: 'fixed', documentIds: many.map(e => e.id) });
  assert.equal(fixed.documentIds.length, 50);
  assert.equal(selectDocuments(many, fixed).length, 50);
  assert.equal(selectDocuments(many, list({ limit: 50 })).length, 50);
  assert.equal(selectDocuments(many, { ...list(), limit: 9000 }).length, 50);
});

test('the panel’s preview sees what the chat will see: a Firestore document becomes the same entry', () => {
  const entryOf = catalogEntryOf(
    {
      id: 'drive-1',
      name: 'Comunicazione.pdf',
      mode: 'archive',
      categories: ['Direzione', 'Vecchia'],
      driveModifiedTime: '2026-11-25T08:00:00Z',
      createdAt: { toMillis: () => day(2026, 12, 1) }
    },
    CATEGORIES
  );
  assert.deepEqual(entryOf, {
    id: 'drive-1',
    name: 'Comunicazione.pdf',
    mode: 'archive',
    categories: ['Direzione'],
    date: Date.parse('2026-11-25T08:00:00Z')
  });
  assert.equal(catalogEntryOf({ id: 'x', name: 'X' }, CATEGORIES).mode, 'studied');
});

// ── the reply ────────────────────────────────────────────────────────────────

/** Runs the reply of a list and returns what it did, in order. */
async function reply(listExtra, { settings = { documentCategories: CATEGORIES } } = {}) {
  const events = [];
  let text = '';
  let done;
  await streamDocumentListReply({
    documentList: list(listExtra),
    settings,
    onActivityStart: (id, payload) => events.push(['start', id, payload]),
    onActivityEnd: (id, payload) => events.push(['end', id, payload]),
    onReplyStart: () => events.push(['reply']),
    onChunk: chunk => {
      text += chunk;
    },
    onDone: info => {
      done = info;
    }
  });
  return { events, text, done, end: events.find(e => e[0] === 'end')?.[2] };
}

test('a list that matches shows a listing card, then its intro, with no model: zero tokens, the list’s name in history', async () => {
  world.catalog = CATALOG;
  const { events, text, done, end } = await reply({
    title: 'Comunicazioni di Direzione',
    intro: 'Ecco le ultime comunicazioni.',
    categories: ['Comunicazioni'],
    limit: 2
  });

  assert.equal(events[0][0], 'start');
  assert.equal(events[0][2].kind, 'file_choice');
  assert.equal(end.outcome, 'done');
  assert.equal(end.reason, 'listing');
  assert.equal(end.label, 'Comunicazioni di Direzione');
  assert.deepEqual(end.files, [
    { documentId: 'c-1125', documentName: 'Comunicazione Direzione 25-11.pdf', documentDate: '2026-11-25' },
    { documentId: 'c-1124', documentName: 'Comunicazione 24-11.pdf', documentDate: '2026-11-24' }
  ]);
  // the card comes before the line, as the model's own listing does, and the reply is a normal one
  assert.ok(events.findIndex(e => e[0] === 'end') < events.findIndex(e => e[0] === 'reply'));
  assert.equal(text, 'Ecco le ultime comunicazioni.');

  assert.equal(done.model, 'elenco');
  assert.equal(done.model, DOCUMENT_LIST_MODEL);
  assert.equal(done.command, 'Comunicazioni');
  assert.deepEqual(done.usage, { input: 0, output: 0, thinking: 0 });
  assert.equal(done.error, undefined);
  assert.ok(Number.isFinite(done.durationMs));
  assert.equal(world.calls, 1);
});

test('without an intro the line says how many files, and the title falls back on the name', async () => {
  world.catalog = CATALOG;
  const many = await reply({ categories: ['Comunicazioni'], limit: 4 });
  assert.equal(many.text, 'Ecco i file (4).');
  assert.equal(many.end.label, 'Comunicazioni');

  const one = await reply({ selection: 'fixed', documentIds: ['policy'] });
  assert.equal(one.text, 'Ecco il file.');
  assert.deepEqual(one.end.files, [
    { documentId: 'policy', documentName: 'Policy mutui.pdf', documentDate: '2026-07-07' }
  ]);
});

test('a file with no date has none on the card; fifty files make a card of fifty', async () => {
  world.catalog = [...CATALOG, ...Array.from({ length: 60 }, (_, i) => entry(`x${i}`, `Extra ${i}.pdf`))];
  const { end } = await reply({ categories: ['Comunicazioni'], limit: 50 });
  assert.equal('documentDate' in end.files.at(-1), false);

  const fifty = await reply({ categories: [], limit: 50 });
  assert.equal(fifty.end.files.length, 50);
});

test('a list that matches nothing shows no card, only the admin’s message (or the default one)', async () => {
  world.catalog = CATALOG;
  const mine = await reply({
    categories: ['Mutuo'],
    nameContains: 'inesistente',
    emptyMessage: 'Niente per ora.'
  });
  assert.equal(mine.text, 'Niente per ora.');
  assert.equal(mine.end.outcome, 'done');
  assert.equal('files' in mine.end, false);
  assert.equal(mine.done.model, 'elenco');
  assert.equal(mine.done.error, undefined);

  const standard = await reply({ categories: ['Mutuo'], nameContains: 'inesistente' });
  assert.equal(standard.text, defaultEmptyMessage(list()));

  // a fixed list whose documents are all gone is empty too
  const gone = await reply({ selection: 'fixed', documentIds: ['cancellato'], emptyMessage: 'Sparito.' });
  assert.equal(gone.text, 'Sparito.');
});

test('if the documents cannot be read the reply says so and the turn is recorded as failed, never sent to the model', async () => {
  world.catalogError = Object.assign(new Error('permission-denied at https://firestore.example/x'), {
    code: 'permission-denied'
  });
  const originalError = console.error;
  console.error = () => {};
  const { text, done, end } = await reply({ categories: ['Comunicazioni'] }).finally(() => {
    console.error = originalError;
  });
  assert.equal(end.outcome, 'failed');
  assert.equal(text, DOCUMENT_LIST_ERROR_MESSAGE);
  assert.equal(done.error, true);
  assert.equal(done.model, 'elenco');
  assert.equal(done.command, 'Comunicazioni');
  // the technical reason is for admins, without addresses
  assert.ok(done.errorDetail.includes('permission-denied'));
  assert.ok(!done.errorDetail.includes('https://'));
});

// ── how the Storico names it ─────────────────────────────────────────────────

test('the Storico says "elenco di documenti", not "comando", and the two never read each other’s reply', () => {
  assert.equal(
    documentListReplyLabel({ model: 'elenco', command: 'Ultime comunicazioni' }),
    'elenco di documenti «Ultime comunicazioni», senza AI'
  );
  assert.equal(documentListReplyLabel({ model: 'elenco' }), 'elenco di documenti, senza AI');
  assert.equal(documentListReplyLabel({ model: 'comando', command: 'Erogato' }), null);
  assert.equal(documentListReplyLabel({ model: 'gemini-2.5-flash' }), null);
  assert.equal(documentListReplyLabel(undefined), null);
  assert.equal(commandReplyLabel({ model: 'elenco', command: 'Ultime comunicazioni' }), null);
  assert.equal(COMMAND_MODEL, 'comando');
  assert.notEqual(COMMAND_MODEL, DOCUMENT_LIST_MODEL);
});

// ── shortcuts that point to a list ───────────────────────────────────────────

test('a shortcut can point to a list as it points to a command: one list of targets, each with its kind', () => {
  const settings = {
    noAiCommands: [command({ connectionId: 'conn1', sql: 'SELECT 1' })],
    noAiDocumentLists: [
      list({ triggers: ['comunicazioni'] }),
      list({ id: 'list-off', name: 'Spento', enabled: false })
    ]
  };
  const targets = noAiTargets(settings);
  assert.deepEqual(
    targets.map(t => [t.id, t.kind]),
    [
      ['cmd-erogato', TARGET_KIND.command],
      ['list-comunic', TARGET_KIND.documents],
      ['list-off', TARGET_KIND.documents]
    ]
  );
  assert.deepEqual(noAiTargets({}), []);
  assert.deepEqual(noAiTargets(undefined), []);

  assert.equal(isTargetOn(targets[0]), true);
  assert.equal(isTargetOn(targets[1]), true);
  assert.equal(isTargetOn(targets[2]), false);
  assert.equal(targetLabel(targets[0]), 'Comando: Erogato');
  assert.equal(targetLabel(targets[1]), 'Elenco: Comunicazioni');

  // the shortcut shows the list's own word in the chat, and its name under the title
  const shortcut = { title: 'Ultime comunicazioni', prompt: 'comunicazioni', command: 'list-comunic' };
  assert.equal(shortcutText(shortcut, targets), 'comunicazioni');
  assert.equal(shortcutSummary(shortcut, targets), 'Elenco di documenti: Comunicazioni');
  assert.equal(shortcutSummary({ ...shortcut, command: 'cmd-erogato' }, targets), 'Comando: Erogato');
  // the list is deleted: the shortcut asks the model its saved question
  assert.equal(shortcutText(shortcut, []), 'comunicazioni');
  assert.equal(shortcutSummary({ ...shortcut, command: 'list-gone' }, targets), 'comunicazioni');
  // nothing loaded yet
  assert.equal(shortcutSummary(shortcut, null), 'Risposta senza AI');
});

test('every shortcut id the server accepts covers a list id', () => {
  // functions/src/shortcuts/personalShortcuts.js COMMAND_ID
  const accepted = /^[A-Za-z0-9_-]{1,64}$/;
  for (let i = 0; i < 50; i++) assert.match(newDocumentListId([]), accepted);
});
