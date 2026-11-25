/**
 * Tests the categories of the documents and the two kinds of document (studied / archive only): choosing
 * categories from the admins' list and nothing else, what indexing writes about them (an admin's own
 * are never overwritten), what the server's indexing copy (functions/src/drive/indexCard.js) must keep
 * identical to the browser's (src/features/documents), and the short card of an archive document.
 * The browser modules are loaded as they are (support/src-alias.mjs). Run: npm test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { registerSrcAlias } from './support/src-alias.mjs';
import * as server from '../src/drive/indexCard.js';

registerSrcAlias();
const docs = file => import(new URL(`../../src/features/documents/${file}`, import.meta.url).href);
const categories = await docs('categories.js');
const modes = await docs('archiveMode.js');
const textMatch = await docs('textMatch.js');

const LIST = ['Mutuo', 'Cessione del quinto', 'Prestito', 'Policy banca', 'Modulistica'];

// ── choosing from the list ───────────────────────────────────────────────────

test('what the model proposes is reduced to the list: its names, spelled as there, once each, at most three', () => {
  const { pickCategories } = categories;
  assert.deepEqual(pickCategories(['mutuo', 'MUTUO', 'Mutuo '], LIST), ['Mutuo']);
  // accents, capitals and punctuation do not matter; the list's spelling wins
  assert.deepEqual(pickCategories(['cessióne DEL quinto', 'policy-banca'], LIST), [
    'Cessione del quinto',
    'Policy banca'
  ]);
  // a category the model made up is dropped, never added
  assert.deepEqual(pickCategories(['Assicurazioni', 'Mutuo', 'Fondi pensione'], LIST), ['Mutuo']);
  // at most three, the model's order
  assert.deepEqual(pickCategories(['Prestito', 'Mutuo', 'Modulistica', 'Policy banca'], LIST), [
    'Prestito',
    'Mutuo',
    'Modulistica'
  ]);
  // junk in, nothing out
  for (const bad of [undefined, null, 'Mutuo', 42, {}, [null, 3, {}], []]) {
    assert.deepEqual(pickCategories(bad, LIST), [], String(bad));
  }
  // no list, no category
  assert.deepEqual(pickCategories(['Mutuo'], []), []);
  assert.deepEqual(pickCategories(['Mutuo'], undefined), []);
});

test('the server picks exactly like the browser', () => {
  const cases = [
    [['mutuo', 'MUTUO', 'Inventata'], LIST],
    [['Prestito', 'Mutuo', 'Modulistica', 'Policy banca'], LIST],
    [['cessióne del quinto'], LIST],
    [[' policy  banca '], LIST],
    [null, LIST],
    [['Mutuo'], []],
    [
      ['Mutuo', 'Prestito'],
      ['prestito', 'PRESTITO', 'Mutuo']
    ]
  ];
  for (const [proposed, allowed] of cases) {
    assert.deepEqual(
      server.pickCategories(proposed, allowed),
      categories.pickCategories(proposed, allowed),
      JSON.stringify([proposed, allowed])
    );
    assert.deepEqual(
      server.pickCategories(proposed, allowed, 1),
      categories.pickCategories(proposed, allowed, 1)
    );
  }
  assert.deepEqual(server.DEFAULT_DOCUMENT_CATEGORIES, categories.DEFAULT_DOCUMENT_CATEGORIES);
  for (const text of ['Cessióne-del  Quinto', null, undefined, 12, 'ÀÈÌÒÙ àèìòù', "dell'anno"]) {
    assert.equal(server.foldText(text), textMatch.foldText(text), String(text));
  }
});

test('the default list is the seed the admins asked for', () => {
  assert.deepEqual(categories.DEFAULT_DOCUMENT_CATEGORIES, [
    'Mutuo',
    'Cessione del quinto',
    'Prestito',
    'Policy banca',
    'Modulistica',
    'Contratti',
    'Procedure interne',
    'Marketing'
  ]);
});

// ── what indexing writes ─────────────────────────────────────────────────────

test('indexing writes the model’s categories limited to the list', () => {
  for (const update of [categories.categoryUpdate, server.categoryUpdate]) {
    assert.deepEqual(update({ proposed: ['mutuo', 'Inventata'], allowed: LIST, manual: false }), {
      categories: ['Mutuo']
    });
    // nothing fits: the document is written with no category, not left with a stale guess
    assert.deepEqual(update({ proposed: ['Inventata'], allowed: LIST, manual: undefined }), {
      categories: []
    });
  }
});

test('categories an admin set by hand are never overwritten by indexing', () => {
  for (const update of [categories.categoryUpdate, server.categoryUpdate]) {
    assert.deepEqual(update({ proposed: ['Mutuo'], allowed: LIST, manual: true }), {});
    // not even when the model proposed something else or nothing
    assert.deepEqual(update({ proposed: [], allowed: LIST, manual: true }), {});
    assert.deepEqual(update({ proposed: undefined, allowed: LIST, manual: true }), {});
  }
});

test('with no list there is nothing to choose from and nothing is written', () => {
  for (const update of [categories.categoryUpdate, server.categoryUpdate]) {
    assert.deepEqual(update({ proposed: ['Mutuo'], allowed: [], manual: false }), {});
    assert.deepEqual(update({ proposed: ['Mutuo'], allowed: undefined, manual: false }), {});
  }
});

// ── the list the admins keep ─────────────────────────────────────────────────

test('the list is cleaned: no blanks, no repeats, no long names', () => {
  const { normalizeCategoryList, hasCategory, MAX_CATEGORY_NAME_CHARS } = categories;
  assert.deepEqual(normalizeCategoryList([' Mutuo ', 'mutuo', '', '  ', 'Cessione   del quinto', null, 7]), [
    'Mutuo',
    'Cessione del quinto',
    '7'
  ]);
  assert.deepEqual(normalizeCategoryList('Mutuo'), []);
  assert.equal(normalizeCategoryList(['x'.repeat(100)])[0].length, MAX_CATEGORY_NAME_CHARS);
  assert.equal(hasCategory(LIST, 'cessione DEL quinto'), true);
  assert.equal(hasCategory(LIST, 'Mutuo', 'Mutuo'), false); // renaming a name to itself is not a repeat
  assert.equal(hasCategory(LIST, 'Altro'), false);
});

test('a category taken off the list is invisible, and comes back if it is put back', () => {
  const { visibleCategories, matchesCategoryFilter, NO_CATEGORY, lacksCategories } = categories;
  const stored = ['Mutuo', 'Marketing'];
  assert.deepEqual(visibleCategories(stored, LIST), ['Mutuo']);
  assert.deepEqual(visibleCategories(stored, [...LIST, 'Marketing']), ['Mutuo', 'Marketing']);
  assert.deepEqual(visibleCategories(undefined, LIST), []);

  const document = { categories: ['Marketing'] };
  assert.equal(lacksCategories(document, LIST), true);
  assert.equal(matchesCategoryFilter(document, NO_CATEGORY, LIST), true);
  assert.equal(matchesCategoryFilter(document, 'Marketing', LIST), false);
  assert.equal(matchesCategoryFilter(document, 'all', LIST), true);
  assert.equal(matchesCategoryFilter({ categories: ['Mutuo'] }, 'mutuo', LIST), true);
  assert.equal(matchesCategoryFilter({ categories: ['Mutuo'] }, NO_CATEGORY, LIST), false);
});

test('"Classifica" works on indexed documents with no visible category that nobody set by hand', () => {
  const { needsClassifying } = categories;
  const base = { indexingStatus: 'done', indexCard: { summary: 'x' }, categories: [] };
  assert.equal(needsClassifying(base, LIST), true);
  assert.equal(needsClassifying({ ...base, categories: undefined }, LIST), true);
  assert.equal(needsClassifying({ ...base, categories: ['Mutuo'] }, LIST), false);
  // a name the list no longer has does not count as a category
  assert.equal(needsClassifying({ ...base, categories: ['Marketing'] }, LIST), true);
  // an admin who left it with none meant it
  assert.equal(needsClassifying({ ...base, categoriesManual: true }, LIST), false);
  // nothing to classify from
  assert.equal(needsClassifying({ ...base, indexCard: null }, LIST), false);
  assert.equal(needsClassifying({ ...base, indexingStatus: 'pending' }, LIST), false);
});

// ── the two kinds of document ────────────────────────────────────────────────

test('a document without a mode is a studied one', () => {
  const { modeOf, isArchive, splitByMode, DOCUMENT_MODE } = modes;
  assert.equal(modeOf({}), DOCUMENT_MODE.studied);
  assert.equal(modeOf(undefined), DOCUMENT_MODE.studied);
  assert.equal(modeOf({ mode: 'studied' }), DOCUMENT_MODE.studied);
  assert.equal(modeOf({ mode: 'garbage' }), DOCUMENT_MODE.studied);
  assert.equal(isArchive({ mode: 'archive' }), true);
  const { studied, archive } = splitByMode([
    { id: 'a' },
    { id: 'b', mode: 'archive' },
    { id: 'c', mode: 'studied' }
  ]);
  assert.deepEqual(
    studied.map(d => d.id),
    ['a', 'c']
  );
  assert.deepEqual(
    archive.map(d => d.id),
    ['b']
  );
});

// ── the server's indexing copy ───────────────────────────────────────────────

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const browserIndexing = read('../../src/features/documents/indexing.js');
const serverCard = read('../src/drive/indexCard.js');
const between = (source, start, end) =>
  source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)) + end.length);
const clean = text =>
  text
    .replace(/^export /, '')
    .replace(/\s+/g, ' ')
    .trim();
const same = (start, end) =>
  assert.equal(clean(between(serverCard, start, end)), clean(between(browserIndexing, start, end)), start);

test('the short card, the categories and the schema of a request are the browser’s, word for word', () => {
  same('const LIGHT_CARD_SCHEMA', '\n};');
  // the instructions are a template literal: compare what is inside the backticks
  const instructions = source => between(source, 'const LIGHT_INDEXING_INSTRUCTIONS = `', '`;');
  assert.equal(instructions(serverCard).replace(/^export /, ''), instructions(browserIndexing));
  same('const categoriesProperty', '\n});');
  same('const categoriesInstruction', ': null;');
  same('const schemaFor', '\n};');
  // the pieces of the prompt that depend on the mode
  for (const piece of [
    'isArchive(document) ? LIGHT_INDEXING_INSTRUCTIONS',
    'categoriesInstruction(categories)'
  ]) {
    assert.ok(serverCard.includes(piece) && browserIndexing.includes(piece), piece);
  }
});

test('an archive document is asked for the short card, a studied one for the full card', () => {
  assert.equal(server.schemaFor('studied', []), server.INDEX_CARD_SCHEMA);
  assert.equal(server.schemaFor('archive', []), server.LIGHT_CARD_SCHEMA);
  assert.deepEqual(server.LIGHT_CARD_SCHEMA.required, ['summary', 'keywords']);
  assert.ok(!('topics' in server.LIGHT_CARD_SCHEMA.properties));

  // with a list, the answer has `categories`, limited to the list by the schema itself
  for (const [mode, base] of [
    ['studied', server.INDEX_CARD_SCHEMA],
    ['archive', server.LIGHT_CARD_SCHEMA]
  ]) {
    const schema = server.schemaFor(mode, LIST);
    assert.deepEqual(schema.properties.categories.items.enum, LIST);
    assert.deepEqual(schema.required, [...base.required, 'categories']);
    assert.deepEqual(Object.keys(schema.properties), [...Object.keys(base.properties), 'categories']);
  }
  // the full card's schema is not touched by any of this
  assert.ok(!('categories' in server.INDEX_CARD_SCHEMA.properties));
});

test('the prompt of an archive document is short and dedicated; the studied one is the admin’s', () => {
  const attachments = [{ name: 'g.md', content: 'guida' }];
  const studied = server.indexingPrompt('ISTRUZIONI', attachments, { name: 'A.pdf' }, LIST);
  assert.ok(studied.startsWith('ISTRUZIONI\n'));
  assert.ok(studied.includes('guida'));
  assert.ok(studied.includes('SOLO fra queste: Mutuo; Cessione del quinto;'));

  const archive = server.indexingPrompt('ISTRUZIONI', attachments, { name: 'M.pdf', mode: 'archive' }, LIST);
  assert.ok(archive.startsWith(server.LIGHT_INDEXING_INSTRUCTIONS));
  assert.ok(!archive.includes('ISTRUZIONI'));
  assert.ok(!archive.includes('guida'));
  assert.ok(archive.includes('Il documento si chiama "M.pdf".'));
  assert.ok(archive.includes('SOLO fra queste'));
  // the card is short because the instructions ask for it: they are not the long ones of the full card
  assert.ok(server.LIGHT_INDEXING_INSTRUCTIONS.length < server.DEFAULT_INDEXING_INSTRUCTIONS.length * 2);
  assert.ok(server.LIGHT_INDEXING_INSTRUCTIONS.includes('BREVE'));

  // no list, no sentence about it
  assert.ok(!server.indexingPrompt('I', [], { name: 'A.pdf' }, []).includes('Categorie'));
});

test('the card of an archive document is marked light, the full card is not', () => {
  const answer = { summary: ' Modulo privacy ', keywords: ['privacy', 'privacy', ' mutuo '] };
  assert.deepEqual(server.cardFromAnswer(answer, 'archive'), {
    summary: 'Modulo privacy',
    banks: [],
    products: [],
    topics: [],
    keywords: ['privacy', 'mutuo'],
    light: true
  });
  assert.ok(!('light' in server.cardFromAnswer(answer, 'studied')));
  assert.ok(!('light' in server.cardFromAnswer(answer)));
});

test('the list of categories is read from the settings like the browser does', () => {
  assert.deepEqual(server.indexingSettings({}).categories, categories.DEFAULT_DOCUMENT_CATEGORIES);
  // an empty list is the admins' choice: no categories, not the seed
  assert.deepEqual(server.indexingSettings({ documentCategories: [] }).categories, []);
  assert.deepEqual(server.indexingSettings({ documentCategories: ['A', ' ', 7, 'B'] }).categories, [
    'A',
    'B'
  ]);
  assert.deepEqual(
    server.indexingSettings({ documentCategories: 'Mutuo' }).categories,
    categories.DEFAULT_DOCUMENT_CATEGORIES
  );
});
