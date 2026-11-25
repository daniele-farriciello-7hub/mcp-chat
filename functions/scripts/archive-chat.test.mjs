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
});

test('without archive files the prompt does not mention the archive at all', () => {
  const text = prompt([POLICY]);
  assert.ok(!text.includes('search_archive'));
  assert.ok(!text.includes('solo archivio'));
  // and the same as before for the rest
  assert.ok(text.includes('SELEZIONE'));
  assert.ok(text.includes('Archivio documentale: 1 documenti indicizzati.'));
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
    categories: ['Mutuo', 'Modulistica']
  });
  assert.equal(events[0][2].label, "Cerco nell'archivio");
  assert.equal(events[0][2].kind, 'archive');
  assert.equal(events.at(-1)[2].label, '2 file trovati');
  assert.equal(events.at(-1)[2].outcome, 'done');

  const one = await search({ query: 'privacy' });
  assert.equal(one.events.at(-1)[2].label, '1 file trovato');
});

test('search_archive never returns a studied document', async () => {
  const { response } = await search({ query: 'policy banca rossa' });
  assert.deepEqual(response.files, []);
  assert.equal(response.total, 0);
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
