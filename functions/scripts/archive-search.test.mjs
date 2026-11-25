/**
 * Tests the search over the archive files (src/features/documents/searchArchive.js, used by the
 * `search_archive` tool): how text is folded and split into words, how a document scores by where a word is
 * found, which documents can be found at all (archive ones only, categories still in the list) and how many
 * come back. Pure, loaded as it is. Run: npm test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerSrcAlias } from './support/src-alias.mjs';

registerSrcAlias();
const docs = file => import(new URL(`../../src/features/documents/${file}`, import.meta.url).href);
const { foldText, searchTokens, stem, tokenMatch } = await docs('textMatch.js');
const { MAX_SEARCH_RESULTS, searchArchive } = await docs('searchArchive.js');

const LIST = ['Mutuo', 'Cessione del quinto', 'Prestito', 'Modulistica', 'Marketing'];

/** An archive file as the chat catalog holds it. */
const file = (id, name, extra = {}) => ({
  id,
  name,
  mode: 'archive',
  description: '',
  summary: '',
  keywords: [],
  banks: [],
  products: [],
  topics: [],
  categories: [],
  ...extra
});

const CATALOG = [
  file('privacy', 'Modulo privacy mutuo.pdf', {
    summary: 'Modulo privacy per richiesta mutuo, da far firmare al cliente.',
    keywords: ['privacy', 'GDPR', 'consenso'],
    categories: ['Mutuo', 'Modulistica']
  }),
  file('delega', 'Delega di pagamento.pdf', {
    summary: 'Delega per la cessione del quinto.',
    keywords: ['delega', 'quinto', 'trattenuta'],
    categories: ['Cessione del quinto', 'Modulistica']
  }),
  file('logo', 'Logo WeUnit bianco.svg', {
    description: 'Logo WeUnit, versione bianca su sfondo trasparente',
    keywords: ['logo', 'marchio'],
    categories: ['Marketing']
  }),
  file('informativa', 'Informativa trasparenza.pdf', {
    summary: 'Informativa sul mutuo e sulla privacy del cliente.',
    keywords: ['trasparenza'],
    categories: ['Mutuo']
  }),
  // not an archive file: studied documents are in the prompt, not searched
  {
    ...file('policy', 'Policy mutui privacy.pdf', { categories: ['Mutuo'], keywords: ['privacy'] }),
    mode: 'studied'
  },
  { ...file('old', 'Modulo vecchio.pdf'), mode: undefined }
];

const ids = result => result.results.map(r => r.id);

// ── text ─────────────────────────────────────────────────────────────────────

test('capitals, accents and punctuation never matter', () => {
  assert.equal(foldText('  Cessióne-del  QUINTO! '), 'cessione del quinto');
  assert.equal(foldText("Dell'Anno_2026.pdf"), 'dell anno 2026 pdf');
  assert.equal(foldText(null), '');
  assert.equal(foldText(undefined), '');
  assert.equal(foldText(42), '42');
});

test('filler words are dropped from a query, unless nothing else is left', () => {
  assert.deepEqual(searchTokens('mandami il modulo privacy per il mutuo'), ['modulo', 'privacy', 'mutuo']);
  assert.deepEqual(searchTokens('Il file'), ['il', 'file']);
  assert.deepEqual(searchTokens(''), []);
});

test('plural and singular share a stem, a partial word matches a longer one, noise does not', () => {
  assert.equal(stem('mutuo'), stem('mutui'));
  assert.equal(stem('moduli'), stem('modulo'));
  assert.equal(stem('cessioni'), stem('cessione'));
  assert.equal(stem('sì'), 'sì'); // short words are left alone
  assert.equal(tokenMatch('mutui', 'mutuo'), 1);
  assert.equal(tokenMatch('banc', 'banche'), 0.6);
  assert.equal(tokenMatch('mut', 'mutuo'), 0); // too short to be a prefix
  assert.equal(tokenMatch('logo', 'privacy'), 0);
});

// ── what can be found ────────────────────────────────────────────────────────

test('only archive files are searched, studied ones and ones without a mode are not', () => {
  const found = searchArchive(CATALOG, { query: 'privacy', categories: LIST });
  assert.ok(ids(found).includes('privacy'));
  assert.ok(!ids(found).includes('policy'));
  assert.ok(!ids(found).includes('old'));
  assert.deepEqual(searchArchive(CATALOG, { query: 'vecchio', categories: LIST }).results, []);
  assert.deepEqual(searchArchive([], { query: 'privacy' }).results, []);
  assert.deepEqual(searchArchive(undefined, { query: 'privacy' }).results, []);
});

test('the name beats the keywords, which beat the description', () => {
  const catalog = [
    file('d', 'Documento A.pdf', { summary: 'Parla di rinnovo anagrafica.' }),
    file('k', 'Documento B.pdf', { keywords: ['rinnovo'] }),
    file('n', 'Rinnovo.pdf')
  ];
  assert.deepEqual(ids(searchArchive(catalog, { query: 'rinnovo' })), ['n', 'k', 'd']);
  // a category counts like a keyword
  const withCategory = [
    file('c', 'Documento C.pdf', { categories: ['Marketing'] }),
    file('t', 'Documento D.pdf', { summary: 'Marketing' })
  ];
  assert.deepEqual(ids(searchArchive(withCategory, { query: 'marketing', categories: LIST })), ['c', 't']);
});

test('a request in the operator’s words finds the file', () => {
  const found = searchArchive(CATALOG, { query: 'mandami il modulo privacy per il mutuo', categories: LIST });
  assert.equal(found.results[0].id, 'privacy');
  // plural, capitals, accents
  assert.equal(
    searchArchive(CATALOG, { query: 'MODULI PRIVACY', categories: LIST }).results[0].id,
    'privacy'
  );
  assert.equal(
    searchArchive(CATALOG, { query: 'logo weunit bianco', categories: LIST }).results[0].id,
    'logo'
  );
  assert.equal(
    searchArchive(CATALOG, { query: 'delegà di pagaménto', categories: LIST }).results[0].id,
    'delega'
  );
  // a file found by what its description says
  assert.equal(
    searchArchive(CATALOG, { query: 'sfondo trasparente', categories: LIST }).results[0].id,
    'logo'
  );
});

test('every word found, and the words in a row in the name, count for more', () => {
  const catalog = [
    file('a', 'Modulo generico.pdf', { keywords: ['privacy'] }),
    file('b', 'Privacy cliente modulo.pdf'),
    file('c', 'Modulo privacy.pdf')
  ];
  assert.deepEqual(ids(searchArchive(catalog, { query: 'modulo privacy' })), ['c', 'b', 'a']);
});

test('nothing is found for words that are nowhere', () => {
  const found = searchArchive(CATALOG, { query: 'carburante', categories: LIST });
  assert.deepEqual(found.results, []);
  assert.equal(found.total, 0);
  assert.equal(found.unknownCategory, false);
});

// ── categories ───────────────────────────────────────────────────────────────

test('a category narrows the search, and alone it lists the whole category', () => {
  const listed = searchArchive(CATALOG, { query: '', category: 'mutuo', categories: LIST });
  assert.deepEqual(ids(listed).sort(), ['informativa', 'privacy']);
  assert.equal(listed.total, 2);

  const narrowed = searchArchive(CATALOG, { query: 'privacy', category: 'Modulistica', categories: LIST });
  assert.deepEqual(ids(narrowed), ['privacy']);

  // accents and capitals in the category too
  assert.deepEqual(ids(searchArchive(CATALOG, { category: 'CESSIONE DEL QUINTO', categories: LIST })), [
    'delega'
  ]);
});

test('a category that is not in the list is reported, not silently ignored', () => {
  const found = searchArchive(CATALOG, { query: 'privacy', category: 'Assicurazioni', categories: LIST });
  assert.equal(found.unknownCategory, true);
  assert.deepEqual(found.results, []);
});

test('a category taken off the list does not count: not to find files by, not to show', () => {
  const trimmed = LIST.filter(name => name !== 'Marketing');
  assert.equal(searchArchive(CATALOG, { category: 'Marketing', categories: trimmed }).unknownCategory, true);
  const found = searchArchive(CATALOG, { query: 'logo', categories: trimmed });
  assert.deepEqual(found.results[0].categories, []);
  // a name that is still there is returned in the list's spelling
  assert.deepEqual(searchArchive(CATALOG, { query: 'privacy', categories: LIST }).results[0].categories, [
    'Mutuo',
    'Modulistica'
  ]);
});

// ── what comes back ──────────────────────────────────────────────────────────

test('each result is id, name, description and categories; the admin’s description comes first', () => {
  const [logo] = searchArchive(CATALOG, { query: 'logo', categories: LIST }).results;
  assert.deepEqual(Object.keys(logo).sort(), ['categories', 'description', 'id', 'name', 'score']);
  assert.equal(logo.description, 'Logo WeUnit, versione bianca su sfondo trasparente');
  const [privacy] = searchArchive(CATALOG, { query: 'privacy mutuo', categories: LIST }).results;
  assert.equal(privacy.description, 'Modulo privacy per richiesta mutuo, da far firmare al cliente.');
  // long descriptions are cut
  const long = searchArchive([file('l', 'Lungo.pdf', { summary: 'x'.repeat(1000) })], { query: 'lungo' });
  assert.ok(long.results[0].description.length <= 300);
});

test('at most ten come back, with how many matched, best first', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    file(`f${i}`, `Modulo ${String(i).padStart(2, '0')}.pdf`)
  );
  const found = searchArchive(many, { query: 'modulo' });
  assert.equal(MAX_SEARCH_RESULTS, 10);
  assert.equal(found.results.length, 10);
  assert.equal(found.total, 25);
  // equal scores keep the name order
  assert.deepEqual(ids(found).slice(0, 3), ['f0', 'f1', 'f2']);
  assert.equal(searchArchive(many, { query: 'modulo', limit: 3 }).results.length, 3);
});
