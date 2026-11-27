/**
 * Tests what the chat does with the two kinds of document: the system prompt carries the studied documents
 * and only counts the archive ones, `read_document` refuses an archive file, `search_archive` answers
 * the model with files it can hand over, and `share_file` / `offer_files` take archive ids. The browser code
 * is loaded as it is (support/src-alias.mjs); Firebase, which the tools reach for, is mocked. Run: npm test.
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { registerSrcAlias } from './support/src-alias.mjs';

registerSrcAlias();
const src = file => new URL(`../../src/${file}`, import.meta.url).href;

// ── Firebase, replaced ───────────────────────────────────────────────────────

const world = { readCalls: [], stored: {}, urls: {} };
const reset = () => Object.assign(world, { readCalls: [], stored: {}, urls: {} });

mock.module(src('features/documents/chatCatalog.js'), {
  namedExports: {
    // as the real one: an archive document is never handed over, whatever the cached catalog says
    getDocumentForReading: async id => {
      world.readCalls.push(id);
      const stored = world.stored[id];
      if (!stored) return null;
      if (stored.mode === 'archive') return { id, name: stored.name, archiveOnly: true };
      return { id, name: stored.name, mimeType: 'application/pdf', fileUri: `gs://bucket/${id}` };
    }
  }
});
mock.module(src('features/documents/documentStore.js'), {
  namedExports: { getDocumentUrlById: async id => world.urls[id] ?? null }
});

const { buildSystemInstruction } = await import(src('features/chat/systemPrompt.js'));
const { runReadDocumentCall } = await import(src('features/chat/tools/readDocument.js'));
const { SEARCH_ARCHIVE_TOOL_NAME, runSearchArchiveCall, searchArchiveTool } = await import(
  src('features/chat/tools/searchArchive.js')
);
const { runShareFileCall } = await import(src('features/chat/tools/shareFile.js'));
const { OFFER_FILES_TOOL, runOfferFilesCall } = await import(src('features/chat/tools/offerFiles.js'));
const { DEFAULT_LISTING_FILES, MAX_LISTING_FILES } = await import(src('features/documents/listingLimits.js'));
const { runToolCalls } = await import(src('features/chat/tools/runToolCalls.js'));
const { ARCHIVE_ONLY_REFUSAL } = await import(src('features/documents/archiveMode.js'));

beforeEach(reset);

const LIST = ['Mutuo', 'Cessione del quinto', 'Modulistica'];

const entry = (id, name, extra = {}) => ({
  id,
  name,
  mimeType: 'application/pdf',
  description: '',
  summary: `Riassunto di ${name}.`,
  banks: [],
  products: [],
  topics: [],
  keywords: [],
  categories: [],
  mode: 'studied',
  ...extra
});

const POLICY = entry('policy-1', 'Policy Banca Rossa.pdf', {
  banks: ['Banca Rossa'],
  categories: ['Mutuo'],
  keywords: ['LTV']
});
const PRIVACY = entry('privacy-1', 'Modulo privacy mutuo.pdf', {
  mode: 'archive',
  summary: 'Modulo privacy per richiesta mutuo, da far firmare al cliente.',
  keywords: ['privacy'],
  categories: ['Mutuo', 'Modulistica']
});
const DELEGA = entry('delega-1', 'Delega di pagamento.pdf', {
  mode: 'archive',
  summary: 'Delega per la cessione del quinto.',
  categories: ['Cessione del quinto', 'Modulistica']
});

const prompt = catalog =>
  buildSystemInstruction({
    instructions: 'ISTRUZIONI',
    catalog,
    documentSelection: 'SELEZIONE',
    documentCategories: LIST,
    clarificationFrequency: 'when_needed'
  });

// ── the system prompt ────────────────────────────────────────────────────────

test('the catalog of the prompt holds the studied documents and leaves the archive ones out', () => {
  const text = prompt([POLICY, PRIVACY, DELEGA]);
  assert.ok(text.includes('[id: policy-1] Policy Banca Rossa.pdf'));
  assert.ok(text.includes('Archivio documentale: 1 documenti indicizzati.'));
  // nothing of an archive file: not its id, name, summary or keywords
  for (const hidden of [
    'privacy-1',
    'delega-1',
    'Modulo privacy mutuo',
    'Delega di pagamento',
    'far firmare',
    'cessione del quinto.'
  ]) {
    assert.ok(!text.includes(hidden), hidden);
  }
});

test('a studied document’s line carries its categories', () => {
  const line = prompt([POLICY])
    .split('\n')
    .find(l => l.startsWith('- [id: policy-1]'));
  assert.ok(line.includes('Istituti: Banca Rossa.'));
  assert.ok(line.includes('Categorie: Mutuo.'));
  assert.ok(line.indexOf('Categorie:') > line.indexOf('Istituti:'));
  // none, no sentence about it
  const bare = prompt([{ ...POLICY, categories: [] }])
    .split('\n')
    .find(l => l.startsWith('- [id: policy-1]'));
  assert.ok(!bare.includes('Categorie'));
});

test('the archive is one line with the count and how to search it, then the rules', () => {
  const text = prompt([POLICY, PRIVACY, DELEGA]);
  const line = text.split('\n').find(l => l.startsWith('File di solo archivio:'));
  assert.ok(line.includes(': 2 '));
  assert.ok(line.includes('search_archive'));
  assert.ok(line.includes('categorie: Mutuo, Cessione del quinto, Modulistica.'));
  // the rule that keeps the model from answering about their content
  assert.ok(text.includes('Non rispondere mai a domande sul loro contenuto'));
  assert.ok(text.includes('è disponibile per il download'));
  assert.ok(text.includes('che moduli ci sono per il mutuo?'));
  assert.ok(text.includes('offer_files'));
  // browsing a category is a listing, never a "did you mean?"
  assert.ok(text.includes('offer_files e reason "listing"'));
  assert.ok(text.includes('mai "no_exact_match" né "ambiguous"'));
  // all the files in one call: a second one would only replace the first card
  assert.ok(text.includes('offer_files una sola volta per risposta'));
});

test('without archive files the prompt has no archive block, but the rules for listing files are there', () => {
  const text = prompt([POLICY]);
  // nothing about files that are only archived
  assert.ok(!text.includes('solo archivio'));
  assert.ok(!text.includes('File di solo archivio'));
  assert.ok(!text.includes('Regole per i file di solo archivio'));
  // and the same as before for the rest
  assert.ok(text.includes('SELEZIONE'));
  assert.ok(text.includes('Archivio documentale: 1 documenti indicizzati.'));
  // a listing ("le ultime 20 comunicazioni") is built with search_archive, studied documents included
  assert.ok(text.includes('Regole per gli elenchi di file'));
  assert.ok(text.includes('search_archive'));
  assert.ok(text.includes('sort "recent"'));
});

test('the rules for lists say how many files to show: 6 unless a number is asked for, 50 at most', () => {
  assert.equal(DEFAULT_LISTING_FILES, 6);
  assert.equal(MAX_LISTING_FILES, 50);
  for (const catalog of [[POLICY], [PRIVACY], [POLICY, PRIVACY, DELEGA]]) {
    const text = prompt(catalog);
    const rules = text.slice(text.indexOf('Regole per gli elenchi di file'));
    // the default, and where a bigger number comes from: the operator's message or the admin's instructions
    assert.ok(rules.includes('al massimo 6 (limit 6)'));
    assert.ok(rules.includes("le istruzioni dell'amministratore dicono quanti file mostrare"));
    assert.ok(rules.includes('"le ultime 20 comunicazioni"'));
    assert.ok(rules.includes('"per le comunicazioni mostra le ultime 15"'));
    assert.ok(rules.includes('fino a 50'));
    assert.ok(rules.includes('Non superare mai 50'));
    // one card, all the files, in the order search_archive gave them
    assert.ok(rules.includes("nell'ordine in cui li ha dati search_archive"));
  }
  // no 6 is left over elsewhere as a hard limit: the candidates of a choice are "di norma" 6, a bigger listing is allowed
  const text = prompt([POLICY, PRIVACY, DELEGA]);
  assert.ok(text.includes('almeno 2 e di norma al massimo 6'));
  assert.ok(!text.includes('offer_files ne mostra al massimo 6'));
});

test('a catalog of archive files only has no list to study, but the rules to hand them over', () => {
  const text = prompt([PRIVACY]);
  assert.ok(text.includes('nessun documento da consultare per rispondere'));
  assert.ok(!text.includes('SELEZIONE'));
  assert.ok(!text.includes('[id:'));
  assert.ok(text.includes('File di solo archivio: 1'));
  assert.ok(text.includes("Se l'operatore chiede di avere, vedere o scaricare un file"));
  // an empty archive is still the old sentence
  assert.ok(prompt([]).includes("per ora non c'e' ancora nessun documento indicizzato"));
});

// ── read_document ────────────────────────────────────────────────────────────

const activity = () => {
  const events = [];
  return {
    events,
    onActivityStart: (id, payload) => events.push(['start', id, payload]),
    onActivityEnd: (id, payload) => events.push(['end', id, payload])
  };
};

test('read_document refuses an archive file and says what to do instead', async () => {
  world.stored = { 'privacy-1': { name: PRIVACY.name, mode: 'archive' } };
  const a = activity();
  const result = await runReadDocumentCall(
    { args: { id: 'privacy-1' } },
    { catalog: [PRIVACY], round: 0, index: 0, ...a }
  );
  assert.equal(result.response.error, ARCHIVE_ONLY_REFUSAL);
  assert.ok(result.response.error.includes('archive-only'));
  assert.ok(result.response.error.includes('available for download'));
  assert.equal(result.parts, undefined, 'no file goes to the model');
  assert.deepEqual(world.readCalls, [], 'the catalog already said archive: the file is not even looked up');
  assert.equal(a.events.at(-1)[2].outcome, 'failed');
});

test('read_document also refuses a file that became archive-only after the catalog was cached', async () => {
  // the cached catalog still says studied; the document itself says archive
  world.stored = { 'policy-1': { name: POLICY.name, mode: 'archive' } };
  const result = await runReadDocumentCall(
    { args: { id: 'policy-1' } },
    { catalog: [POLICY], round: 0, index: 0, ...activity() }
  );
  assert.equal(result.response.error, ARCHIVE_ONLY_REFUSAL);
  assert.equal(result.parts, undefined);
  assert.deepEqual(world.readCalls, ['policy-1']);
});

test('read_document still opens a studied document', async () => {
  world.stored = { 'policy-1': { name: POLICY.name, mode: 'studied' } };
  const result = await runReadDocumentCall(
    { args: { id: 'policy-1' } },
    { catalog: [POLICY], round: 0, index: 0, ...activity() }
  );
  assert.equal(result.response.ok, true);
  assert.deepEqual(result.parts, [
    { fileData: { mimeType: 'application/pdf', fileUri: 'gs://bucket/policy-1' } }
  ]);
  // an id that is nowhere is still "not found", not "archive only"
  const missing = await runReadDocumentCall(
    { args: { id: 'nope' } },
    { catalog: [POLICY], round: 0, index: 1, ...activity() }
  );
  assert.equal(missing.response.error, 'document not found');
});

test('the dispatcher turns the refusal into the functionResponse the model waits for', async () => {
  const [reply] = await runToolCalls([{ id: 'c1', name: 'read_document', args: { id: 'privacy-1' } }], {
    catalog: [PRIVACY],
    round: 0,
    ...activity()
  });
  assert.equal(reply.functionResponse.name, 'read_document');
  assert.equal(reply.functionResponse.response.error, ARCHIVE_ONLY_REFUSAL);
});

// ── search_archive ───────────────────────────────────────────────────────────

const search = async (args, catalog = [POLICY, PRIVACY, DELEGA]) => {
  const a = activity();
  const result = await runSearchArchiveCall(
    { args },
    { catalog, categories: LIST, round: 0, index: 0, ...a }
  );
  return { ...result, events: a.events };
};

test('search_archive finds archive files and says so in plain Italian', async () => {
  const { response, events } = await search({ query: 'modulo privacy' });
  assert.equal(response.ok, true);
  // best first: the form about privacy, then the other one that is only a "modulistica" (a near match)
  assert.deepEqual(
    response.files.map(f => f.id),
    ['privacy-1', 'delega-1']
  );
  assert.deepEqual(response.files[0], {
    id: 'privacy-1',
    name: 'Modulo privacy mutuo.pdf',
    description: 'Modulo privacy per richiesta mutuo, da far firmare al cliente.',
    categories: ['Mutuo', 'Modulistica'],
    mode: 'archive'
  });
  assert.equal(events[0][2].label, "Cerco nell'archivio");
  assert.equal(events[0][2].kind, 'archive');
  assert.equal(events.at(-1)[2].label, '2 file trovati');
  assert.equal(events.at(-1)[2].outcome, 'done');

  const one = await search({ query: 'privacy' });
  assert.equal(one.events.at(-1)[2].label, '1 file trovato');
});

test('search_archive also finds studied documents, and says which are which', async () => {
  const { response } = await search({ query: 'policy banca rossa' });
  assert.deepEqual(
    response.files.map(f => [f.id, f.mode]),
    [['policy-1', 'studied']]
  );
  assert.equal(response.total, 1);
});

test('search_archive lists a category: "che moduli ci sono per il mutuo?"', async () => {
  const { response, events } = await search({ query: '', category: 'Modulistica' });
  assert.deepEqual(response.files.map(f => f.id).sort(), ['delega-1', 'privacy-1']);
  assert.equal(events.at(-1)[2].label, '2 file trovati');
  const mutuo = await search({ query: 'moduli', category: 'mutuo' });
  assert.deepEqual(
    mutuo.response.files.map(f => f.id),
    ['privacy-1']
  );
});

test('search_archive with nothing found, an unknown category or no request answers usefully', async () => {
  const none = await search({ query: 'carburante' });
  assert.equal(none.response.ok, true);
  assert.equal(none.response.total, 0);
  assert.ok(none.response.note.includes('do not invent an id'));
  assert.equal(none.events.at(-1)[2].label, 'Nessun file trovato');
  assert.equal(none.events.at(-1)[2].outcome, 'done');

  const unknown = await search({ query: 'privacy', category: 'Assicurazioni' });
  assert.ok(unknown.response.error.includes('unknown category'));
  assert.deepEqual(unknown.response.categories, LIST);
  assert.equal(unknown.events.at(-1)[2].outcome, 'failed');

  const empty = await search({});
  assert.ok(empty.response.error);
  assert.equal(empty.events.at(-1)[2].outcome, 'failed');
});

test('search_archive says how many more there are past the ten it returns', async () => {
  const many = Array.from({ length: 14 }, (_, i) => entry(`m${i}`, `Modulo ${i}.pdf`, { mode: 'archive' }));
  const { response, events } = await search({ query: 'modulo' }, many);
  assert.equal(response.shown, 10);
  assert.equal(response.total, 14);
  assert.ok(response.note.startsWith('4 more files match'));
  assert.equal(events.at(-1)[2].label, '14 file trovati');
});

test('the tool the model sees offers the list of categories as the values of `category`', () => {
  const [declaration] = searchArchiveTool(LIST).functionDeclarations;
  assert.equal(declaration.name, SEARCH_ARCHIVE_TOOL_NAME);
  assert.equal(declaration.name, 'search_archive');
  assert.deepEqual(declaration.parameters.properties.category.enum, LIST);
  assert.deepEqual(declaration.parameters.required, ['query']);
  // the hint that makes a category listing show download buttons
  assert.ok(declaration.description.includes('offer_files'));
  assert.ok(declaration.description.includes('che moduli ci sono per il mutuo?'));
  assert.ok(declaration.description.includes('reason "listing"'));
  // no list, no enum (an empty enum is not valid)
  assert.ok(!('enum' in searchArchiveTool([]).functionDeclarations[0].parameters.properties.category));
});

test('the dispatcher knows search_archive', async () => {
  const [reply] = await runToolCalls([{ id: 'c1', name: 'search_archive', args: { query: 'delega' } }], {
    catalog: [DELEGA],
    categories: LIST,
    round: 0,
    ...activity()
  });
  assert.equal(reply.functionResponse.name, 'search_archive');
  assert.deepEqual(
    reply.functionResponse.response.files.map(f => f.id),
    ['delega-1']
  );
});

// ── delivering archive files ─────────────────────────────────────────────────

test('share_file hands over an archive file, and still refuses an id nobody has', async () => {
  world.urls = { 'privacy-1': 'https://example.test/privacy.pdf' };
  const a = activity();
  const done = await runShareFileCall(
    { args: { id: 'privacy-1' } },
    { catalog: [POLICY, PRIVACY], round: 0, index: 0, ...a }
  );
  assert.equal(done.response.ok, true);
  assert.equal(a.events.at(-1)[2].documentId, 'privacy-1');
  assert.equal(a.events.at(-1)[2].outcome, 'done');

  const invented = await runShareFileCall(
    { args: { id: 'made-up' } },
    { catalog: [POLICY, PRIVACY], round: 0, index: 1, ...activity() }
  );
  assert.ok(invented.response.error);
});

test('offer_files shows archive files to pick from, with no round trip through the model', async () => {
  const a = activity();
  const result = await runOfferFilesCall(
    { args: { question: 'Quale modulo?', ids: ['privacy-1', 'delega-1', 'invented'], reason: 'ambiguous' } },
    { catalog: [POLICY, PRIVACY, DELEGA], round: 0, index: 0, ...a }
  );
  assert.equal(result.response.ok, true);
  assert.ok(result.response.ignored, 'the invented id is dropped and the model is told');
  const end = a.events.at(-1)[2];
  assert.deepEqual(
    end.files.map(f => f.documentId),
    ['privacy-1', 'delega-1']
  );
  assert.equal(end.reason, 'ambiguous');
  assert.equal(end.label, 'Quale modulo?');
});

test('a listing keeps its own reason and its title, with one file or several', async () => {
  const several = activity();
  const result = await runOfferFilesCall(
    { args: { question: 'Moduli per il mutuo', ids: ['privacy-1', 'delega-1'], reason: 'listing' } },
    { catalog: [POLICY, PRIVACY, DELEGA], round: 0, index: 0, ...several }
  );
  assert.equal(result.response.ok, true);
  assert.equal(several.events.at(-1)[2].reason, 'listing');
  assert.equal(several.events.at(-1)[2].label, 'Moduli per il mutuo');
  assert.ok(result.response.shown.includes('list'));

  // a category can hold just one file: still a listing, not a "did you mean this?"
  const single = activity();
  await runOfferFilesCall(
    { args: { question: 'Moduli per il mutuo', ids: ['privacy-1'], reason: 'listing' } },
    { catalog: [POLICY, PRIVACY, DELEGA], round: 0, index: 0, ...single }
  );
  const end = single.events.at(-1)[2];
  assert.equal(end.reason, 'listing');
  assert.deepEqual(
    end.files.map(f => f.documentId),
    ['privacy-1']
  );
});

test('a listing without a title is called "File disponibili"; a choice without one keeps its question', async () => {
  const listing = activity();
  await runOfferFilesCall(
    { args: { question: '  ', ids: ['privacy-1', 'delega-1'], reason: 'listing' } },
    { catalog: [PRIVACY, DELEGA], round: 0, index: 0, ...listing }
  );
  assert.equal(listing.events.at(-1)[2].label, 'File disponibili');

  const choice = activity();
  await runOfferFilesCall(
    { args: { ids: ['privacy-1', 'delega-1'] } },
    { catalog: [PRIVACY, DELEGA], round: 0, index: 0, ...choice }
  );
  assert.equal(choice.events.at(-1)[2].label, 'Quale file intendi?');
  assert.equal(choice.events.at(-1)[2].reason, 'ambiguous');
});

test('a single file offered as ambiguous or as no exact match is a "did you mean this?"', async () => {
  for (const reason of ['ambiguous', 'no_exact_match', undefined, 'something else']) {
    const a = activity();
    await runOfferFilesCall(
      { args: { question: 'Forse intendevi questo?', ids: ['privacy-1'], reason } },
      { catalog: [PRIVACY], round: 0, index: 0, ...a }
    );
    assert.equal(a.events.at(-1)[2].reason, 'no_exact_match', String(reason));
  }
});

test('every offer_files card that was shown carries the same replaceKey, a failed call carries none', async () => {
  // the model sometimes calls it twice in one reply (a list of 5, then of 6): the later card replaces
  // the earlier one (useConversation `latestByReplaceKey`), whatever its reason, title or files
  const first = activity();
  await runOfferFilesCall(
    { args: { question: 'Comunicazioni di direzione', ids: ['privacy-1', 'delega-1'], reason: 'listing' } },
    { catalog: [POLICY, PRIVACY, DELEGA], round: 0, index: 0, ...first }
  );
  const second = activity();
  const result = await runOfferFilesCall(
    { args: { question: 'Quale modulo?', ids: ['privacy-1', 'delega-1', 'policy-1'] } },
    { catalog: [POLICY, PRIVACY, DELEGA], round: 1, index: 0, ...second }
  );
  const key = first.events.at(-1)[2].replaceKey;
  assert.equal(typeof key, 'string');
  assert.ok(key);
  assert.equal(second.events.at(-1)[2].replaceKey, key);
  assert.equal(second.events.at(-1)[2].outcome, 'done');

  // a second call is harmless to the model: it is told the card replaces the earlier one
  assert.equal(result.response.ok, true);
  assert.ok(result.response.note.includes('replaces'));

  // nothing valid to show: the earlier card must stay, so the failed end has no key
  const failed = activity();
  const failure = await runOfferFilesCall(
    { args: { question: 'Quale modulo?', ids: ['invented'] } },
    { catalog: [POLICY, PRIVACY, DELEGA], round: 2, index: 0, ...failed }
  );
  assert.ok(failure.response.error);
  assert.equal(failed.events.at(-1)[2].outcome, 'failed');
  assert.equal('replaceKey' in failed.events.at(-1)[2], false);
});

test('the model is told to call offer_files once per reply, in the tool and in the prompt', () => {
  const [declaration] = OFFER_FILES_TOOL.functionDeclarations;
  assert.ok(declaration.description.includes('una volta per risposta'));
});

test('the tool the model sees lists the three reasons and says when to use "listing"', () => {
  const [declaration] = OFFER_FILES_TOOL.functionDeclarations;
  assert.deepEqual(declaration.parameters.properties.reason.enum, ['ambiguous', 'no_exact_match', 'listing']);
  assert.ok(declaration.description.includes('reason "listing"'));
  assert.ok(declaration.parameters.properties.question.description.includes('Moduli per il mutuo'));
});

test('search_archive tells the model to show what it found as a listing', async () => {
  const { response } = await runSearchArchiveCall(
    { args: { query: '', category: 'Modulistica' } },
    { catalog: [PRIVACY, DELEGA], categories: LIST, round: 0, index: 0, ...activity() }
  );
  assert.ok(response.note.includes('reason "listing"'));
});

// ── listings: how many, in which order, with which date ──────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const NOV_1 = Date.UTC(2026, 10, 1, 12);

/** `n` communications, one a day from the 1st of November: studied documents, as in the dev archive. */
const communications = n =>
  Array.from({ length: n }, (_, i) =>
    entry(`com-${i}`, `Comunicazione ${String(i + 1).padStart(2, '0')}.pdf`, {
      categories: ['Mutuo'],
      date: NOV_1 + i * DAY_MS
    })
  );

test('search_archive lists the most recent studied documents first and returns as many as asked', async () => {
  const catalog = communications(30);
  const { response, events } = await search(
    { query: '', category: 'Mutuo', sort: 'recent', limit: 20 },
    catalog
  );
  assert.equal(response.total, 30);
  assert.equal(response.shown, 20);
  assert.equal(response.sorted, 'recent');
  // the newest first: the 30th of the month's communications, then back
  assert.deepEqual(
    response.files.slice(0, 3).map(f => f.id),
    ['com-29', 'com-28', 'com-27']
  );
  assert.equal(response.files.at(-1).id, 'com-10');
  // each one carries its day (Rome), and says it is a studied document
  assert.equal(response.files[0].date, '2026-11-30');
  assert.equal(response.files[0].mode, 'studied');
  assert.equal(events.at(-1)[2].label, '30 file trovati');
  // 10 more than shown: the model is told to say so and that more can be asked for
  assert.ok(response.note.startsWith('10 more files match'));
  assert.ok(response.note.includes('up to 50'));
});

test('search_archive: the limit is capped at 50, falls back to 10 when it is not a number, and "recent" needs no words', async () => {
  const catalog = communications(60);
  assert.equal((await search({ query: '', sort: 'recent', limit: 200 }, catalog)).response.shown, 50);
  assert.equal((await search({ query: '', sort: 'recent', limit: 'tante' }, catalog)).response.shown, 10);
  assert.equal((await search({ query: '', sort: 'recent' }, catalog)).response.shown, 10);
  assert.equal((await search({ query: '', sort: 'recent', limit: 6 }, catalog)).response.shown, 6);
  // an unknown order is the relevance one; without words, category or "recent" there is still nothing to search
  assert.equal(
    (await search({ query: 'comunicazione', sort: 'alfabetico' }, catalog)).response.sorted,
    'relevance'
  );
  assert.ok((await search({ query: '', sort: 'relevance' }, catalog)).response.error);
});

test('a file without a date has no `date` in the result, and goes last in a recent listing', async () => {
  const catalog = [...communications(2), entry('senza', 'Senza data.pdf', { categories: ['Mutuo'] })];
  const { response } = await search({ query: '', category: 'Mutuo', sort: 'recent' }, catalog);
  assert.deepEqual(
    response.files.map(f => f.id),
    ['com-1', 'com-0', 'senza']
  );
  assert.equal('date' in response.files[2], false);
});

test('the tool the model sees has `sort` and `limit`, and says 6 unless a number is asked for, up to 50', () => {
  const [declaration] = searchArchiveTool(LIST).functionDeclarations;
  const { sort, limit } = declaration.parameters.properties;
  assert.deepEqual(sort.enum, ['relevance', 'recent']);
  assert.equal(limit.type, 'integer');
  assert.ok(limit.description.includes('6'));
  assert.ok(limit.description.includes('50'));
  assert.deepEqual(declaration.parameters.required, ['query']);
  // it covers every document, and never a hand-made list
  assert.ok(declaration.description.includes('anche quelli studiati'));
  assert.ok(declaration.description.includes('sort "recent"'));
});

test('offer_files shows up to fifty files, and drops the rest', async () => {
  const catalog = communications(60);
  const a = activity();
  const result = await runOfferFilesCall(
    { args: { question: 'Comunicazioni', ids: catalog.map(e => e.id), reason: 'listing' } },
    { catalog, round: 0, index: 0, ...a }
  );
  const end = a.events.at(-1)[2];
  assert.equal(end.files.length, 50);
  assert.equal(end.files[0].documentId, 'com-0');
  assert.equal(end.reason, 'listing');
  assert.equal(result.response.ok, true);
  // the model is told it was cut, so it says so to the operator
  assert.ok(result.response.capped.includes('50'));
  // a dozen is a dozen
  const twelve = activity();
  await runOfferFilesCall(
    { args: { question: 'Comunicazioni', ids: catalog.slice(0, 12).map(e => e.id), reason: 'listing' } },
    { catalog, round: 0, index: 0, ...twelve }
  );
  assert.equal(twelve.events.at(-1)[2].files.length, 12);
  assert.equal(
    'capped' in
      (
        await runOfferFilesCall(
          { args: { question: 'x', ids: ['com-0', 'com-1'], reason: 'listing' } },
          { catalog, round: 0, index: 0, ...activity() }
        )
      ).response,
    false
  );
});

test('a card carries the day of each file, when it has one, and nothing else about the date', async () => {
  const catalog = [...communications(1), entry('senza', 'Senza data.pdf')];
  const a = activity();
  await runOfferFilesCall(
    { args: { question: 'Comunicazioni', ids: ['com-0', 'senza'], reason: 'listing' } },
    { catalog, round: 0, index: 0, ...a }
  );
  assert.deepEqual(a.events.at(-1)[2].files, [
    { documentId: 'com-0', documentName: 'Comunicazione 01.pdf', documentDate: '2026-11-01' },
    { documentId: 'senza', documentName: 'Senza data.pdf' }
  ]);
});

test('the tool offer_files says 6 as the rule and 50 as the most, to ask for it', () => {
  const [declaration] = OFFER_FILES_TOOL.functionDeclarations;
  assert.ok(declaration.description.includes('di solito da 1 a 6'));
  assert.ok(declaration.description.includes('fino a 50'));
  assert.ok(declaration.parameters.properties.ids.description.includes('Da 1 a 6 id'));
  assert.ok(declaration.parameters.properties.ids.description.includes('fino a 50'));
});
