/**
 * Tests the categories of the documents and the two kinds of document (studied / archive only): choosing
 * categories from the admins' list and nothing else, what indexing writes about them (an admin's own
 * are never overwritten), what the server's indexing copy (functions/src/drive/indexCard.js) must keep
 * identical to the browser's (src/features/documents), the short card of an archive document, and the bulk
 * change of the categories of many documents (add, take off, replace: the maximum of three, the names the list
 * no longer has, the summary sentence).
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
const bulk = await docs('bulkCategories.js');

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

// ── the same change on many documents (the "Categorie" action of the selection bar) ──────────────────────────

const add = (stored, ...names) => bulk.changeCategories(stored, { action: 'add', names }, LIST);
const remove = (stored, ...names) => bulk.changeCategories(stored, { action: 'remove', names }, LIST);
const replace = (stored, ...names) => bulk.changeCategories(stored, { action: 'replace', names }, LIST);

test('adding a category keeps the ones a document has and puts the new one after them', () => {
  assert.deepEqual(add([], 'Mutuo'), { result: 'changed', categories: ['Mutuo'] });
  assert.deepEqual(add(undefined, 'Mutuo'), { result: 'changed', categories: ['Mutuo'] });
  assert.deepEqual(add(['Prestito'], 'Mutuo'), { result: 'changed', categories: ['Prestito', 'Mutuo'] });
  // written as the list spells it, whatever was stored or asked
  assert.deepEqual(add(['prestito'], 'MUTUO'), { result: 'changed', categories: ['Prestito', 'Mutuo'] });
  // several at once, each once
  assert.deepEqual(add([], 'Mutuo', 'Prestito', 'mutuo'), {
    result: 'changed',
    categories: ['Mutuo', 'Prestito']
  });
});

test('a document that already has the category is not written again', () => {
  assert.deepEqual(add(['Mutuo', 'Prestito'], 'Prestito'), { result: 'unchanged' });
  assert.deepEqual(add(['mutuo'], 'Mutuo'), { result: 'unchanged' });
  // already full, but it has it: nothing to do, not "full"
  assert.deepEqual(add(['Mutuo', 'Prestito', 'Modulistica'], 'Mutuo'), { result: 'unchanged' });
  // a name that is not in the list is nothing to add
  assert.deepEqual(add(['Mutuo'], 'Inventata'), { result: 'unchanged' });
  assert.deepEqual(add(['Mutuo']), { result: 'unchanged' });
});

test('a document with three visible categories is skipped on add, never over the maximum', () => {
  const three = ['Mutuo', 'Prestito', 'Modulistica'];
  assert.deepEqual(add(three, 'Policy banca'), { result: 'full' });
  // two are visible plus one the list no longer has: that one is invisible, it does not take a place
  assert.deepEqual(add(['Mutuo', 'Marketing', 'Prestito'], 'Modulistica'), {
    result: 'changed',
    categories: ['Mutuo', 'Prestito', 'Modulistica', 'Marketing']
  });
  // several names: all of them or none, so a document with two cannot take two more
  assert.deepEqual(add(['Mutuo', 'Prestito'], 'Modulistica', 'Policy banca'), { result: 'full' });
  assert.deepEqual(add(['Mutuo'], 'Modulistica', 'Policy banca'), {
    result: 'changed',
    categories: ['Mutuo', 'Modulistica', 'Policy banca']
  });
  // taking exactly the last place is fine
  assert.equal(
    add(['Mutuo', 'Prestito'], 'Modulistica').categories.length,
    categories.MAX_CATEGORIES_PER_DOCUMENT
  );
});

test('taking a category off leaves the others, and does nothing to a document that lacks it', () => {
  assert.deepEqual(remove(['Mutuo', 'Prestito'], 'Mutuo'), { result: 'changed', categories: ['Prestito'] });
  assert.deepEqual(remove(['Mutuo'], 'mutuo'), { result: 'changed', categories: [] });
  assert.deepEqual(remove(['Mutuo', 'Prestito', 'Modulistica'], 'Mutuo', 'Modulistica'), {
    result: 'changed',
    categories: ['Prestito']
  });
  assert.deepEqual(remove(['Prestito'], 'Mutuo'), { result: 'unchanged' });
  assert.deepEqual(remove([], 'Mutuo'), { result: 'unchanged' });
  assert.deepEqual(remove(undefined, 'Mutuo'), { result: 'unchanged' });
  assert.deepEqual(remove(['Mutuo'], 'Inventata'), { result: 'unchanged' });
});

test('replacing leaves a document with exactly the chosen categories', () => {
  assert.deepEqual(replace(['Mutuo', 'Prestito', 'Modulistica'], 'Policy banca'), {
    result: 'changed',
    categories: ['Policy banca']
  });
  assert.deepEqual(replace([], 'Mutuo', 'Prestito'), {
    result: 'changed',
    categories: ['Mutuo', 'Prestito']
  });
  // the same set, in whatever order, is not a change
  assert.deepEqual(replace(['Prestito', 'Mutuo'], 'Mutuo', 'Prestito'), { result: 'unchanged' });
  // an empty choice (or one that is not in the list) never wipes a document
  assert.deepEqual(replace(['Mutuo']), { result: 'unchanged' });
  assert.deepEqual(replace(['Mutuo'], 'Inventata'), { result: 'unchanged' });
  // at most three, even if more are asked
  assert.equal(replace([], 'Mutuo', 'Prestito', 'Modulistica', 'Policy banca').categories.length, 3);
});

test('a category the list no longer has stays on the document, unseen, after the new ones', () => {
  // "Marketing" and "Vecchia" were taken off the list: nothing here shows or touches them
  const stored = ['Marketing', 'Mutuo', 'Vecchia'];
  assert.deepEqual(add(stored, 'Prestito'), {
    result: 'changed',
    categories: ['Mutuo', 'Prestito', 'Marketing', 'Vecchia']
  });
  assert.deepEqual(remove(stored, 'Mutuo'), { result: 'changed', categories: ['Marketing', 'Vecchia'] });
  assert.deepEqual(replace(stored, 'Prestito'), {
    result: 'changed',
    categories: ['Prestito', 'Marketing', 'Vecchia']
  });
  // and they stay invisible
  assert.deepEqual(categories.visibleCategories(add(stored, 'Prestito').categories, LIST), [
    'Mutuo',
    'Prestito'
  ]);
  // junk in the stored array is not written back
  assert.deepEqual(add(['Mutuo', null, 3, '  ', {}], 'Prestito').categories, ['Mutuo', 'Prestito']);
  // a name the admins put back is visible again
  assert.deepEqual(categories.visibleCategories(add(stored, 'Prestito').categories, [...LIST, 'Marketing']), [
    'Mutuo',
    'Prestito',
    'Marketing'
  ]);
  // unchanged also when the only difference would be an invisible name
  assert.deepEqual(remove(['Marketing'], 'Mutuo'), { result: 'unchanged' });
});

test('an action that does not exist is a mistake, not a silent no-op', () => {
  assert.throws(
    () => bulk.changeCategories(['Mutuo'], { action: 'clear', names: ['Mutuo'] }, LIST),
    /Unknown/
  );
});

test('the plan lists what to write and counts the rest', () => {
  const documents = [
    { id: 'a', categories: [] },
    { id: 'b', categories: ['Mutuo'] }, // already has it
    { id: 'c', categories: ['Prestito', 'Modulistica', 'Policy banca'] }, // no room
    { id: 'd', categories: ['Prestito'] },
    { id: 'e' } // never classified
  ];
  const plan = bulk.planCategoryChange(documents, { action: 'add', names: ['Mutuo'] }, LIST);
  assert.deepEqual(plan.updates, [
    { id: 'a', categories: ['Mutuo'] },
    { id: 'd', categories: ['Prestito', 'Mutuo'] },
    { id: 'e', categories: ['Mutuo'] }
  ]);
  assert.deepEqual([plan.changed, plan.unchanged, plan.full], [3, 1, 1]);

  const taken = bulk.planCategoryChange(documents, { action: 'remove', names: ['Prestito'] }, LIST);
  assert.deepEqual(taken.updates, [
    { id: 'c', categories: ['Modulistica', 'Policy banca'] },
    { id: 'd', categories: [] }
  ]);
  assert.deepEqual([taken.changed, taken.unchanged, taken.full], [2, 3, 0]);

  // the documents themselves are not changed
  assert.deepEqual(documents[0].categories, []);
  assert.deepEqual(bulk.planCategoryChange([], { action: 'add', names: ['Mutuo'] }, LIST).updates, []);
});

test('the summary says what was done, what was skipped and what failed', () => {
  const { describeCategoryChange } = bulk;
  const one = { action: 'add', names: ['Mutuo'] };
  assert.deepEqual(describeCategoryChange(one, { changed: 12, unchanged: 0, full: 2 }), {
    tone: 'ok',
    text: '«Mutuo» aggiunta a 12 documenti; 2 ne avevano già 3.'
  });
  assert.equal(
    describeCategoryChange(one, { changed: 1, unchanged: 1, full: 1 }).text,
    '«Mutuo» aggiunta a 1 documento; 1 era già a posto; 1 ne aveva già 3.'
  );
  assert.equal(
    describeCategoryChange(
      { action: 'add', names: ['Mutuo', 'Prestito'] },
      { changed: 4, unchanged: 0, full: 2 }
    ).text,
    '«Mutuo» e «Prestito» aggiunte a 4 documenti; 2 non avevano posto per tutte (massimo 3).'
  );
  assert.equal(
    describeCategoryChange({ action: 'remove', names: ['Mutuo'] }, { changed: 5, unchanged: 3, full: 0 })
      .text,
    '«Mutuo» tolta da 5 documenti; 3 erano già a posto.'
  );
  assert.equal(
    describeCategoryChange(
      { action: 'replace', names: ['A', 'B', 'C'] },
      { changed: 2, unchanged: 0, full: 0 }
    ).text,
    'Categorie sostituite con «A», «B» e «C» in 2 documenti.'
  );
  // nothing to write
  assert.equal(
    describeCategoryChange(one, { changed: 0, unchanged: 0, full: 3 }).text,
    'Nessun documento aggiornato; 3 ne avevano già 3.'
  );
  // some batches failed: the rest is still reported, and it is an error
  assert.deepEqual(describeCategoryChange(one, { changed: 12, unchanged: 0, full: 0 }, 5), {
    tone: 'error',
    text: '«Mutuo» aggiunta a 7 documenti; 5 non sono stati aggiornati: riprova.'
  });
  assert.deepEqual(describeCategoryChange(one, { changed: 3, unchanged: 0, full: 0 }, 3), {
    tone: 'error',
    text: 'Nessun documento aggiornato; 3 non sono stati aggiornati: riprova.'
  });
  assert.equal(
    describeCategoryChange(one, { changed: 2, unchanged: 0, full: 0 }, 1).text,
    '«Mutuo» aggiunta a 1 documento; 1 non è stato aggiornato: riprova.'
  );
});
