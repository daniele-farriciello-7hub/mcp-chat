/**
 * Tests for the Drive sync's pure parts: link parsing, schedules, the per-file plan, the webhook token,
 * and the guard that keeps the index-card definition identical to the browser's. Run: npm test
 * (Node's built-in runner, no network, no Firebase).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseDriveLink } from '../src/drive/driveLink.js';
import {
  DUE_SLACK_MS,
  isDue,
  nextRunAfter,
  nextRunAfterRun,
  normalizeSchedule
} from '../src/drive/schedule.js';
import { MAX_FILE_SIZE_BYTES } from '../src/drive/archive.js';
import { RETRY_FAILED_AFTER_MS, SKIP_REASONS, planFile } from '../src/drive/syncPlan.js';
import { isTransientError, runPool, withRetry } from '../src/drive/retry.js';
import { PRODUCTION_APP, DEVELOPMENT_APP, forApp } from '../src/appContext.js';
import { channelToken, verifyChannelToken } from '../src/drive/channels.js';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_DOCUMENT_CATEGORIES,
  DEFAULT_INDEXING_INSTRUCTIONS,
  DEFAULT_INDEXING_MODEL,
  INDEX_CARD_SCHEMA,
  cardFromAnswer,
  indexingPrompt,
  indexingSettings
} from '../src/drive/indexCard.js';
import { attachmentsBlock } from '../src/drive/promptAttachments.js';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

// ── links ────────────────────────────────────────────────────────────────────

test('parseDriveLink reads folder, file and bare-id forms', () => {
  const links = [
    `https://drive.google.com/drive/folders/${ID}`,
    `https://drive.google.com/drive/folders/${ID}?usp=sharing`,
    `https://drive.google.com/drive/u/0/folders/${ID}`,
    `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
    `https://drive.google.com/file/u/1/d/${ID}/edit`,
    `https://drive.google.com/open?id=${ID}`,
    `https://drive.google.com/uc?export=download&id=${ID}`,
    `https://docs.google.com/document/d/${ID}/edit`,
    `  ${ID}  `,
    ID
  ];
  for (const link of links) assert.equal(parseDriveLink(link), ID, link);
});

test('parseDriveLink refuses what is not a Drive id', () => {
  for (const link of [
    '',
    '   ',
    'pippo',
    'https://example.com/drive/folders/' + ID,
    `https://drive.google.com/`,
    null,
    42
  ]) {
    assert.equal(parseDriveLink(link), null, String(link));
  }
  // ids go into Drive queries: no quote can get through
  assert.equal(parseDriveLink(`https://drive.google.com/open?id=${ID}'%20or%20'1'='1`), null);
});

// ── schedules ────────────────────────────────────────────────────────────────

const iso = ms => new Date(ms).toISOString();

test('interval frequencies count from the start of the last run', () => {
  const from = Date.parse('2026-06-10T10:00:00Z');
  assert.equal(iso(nextRunAfter({ frequency: 'every15min' }, from)), '2026-06-10T10:15:00.000Z');
  assert.equal(iso(nextRunAfter({ frequency: 'hourly' }, from)), '2026-06-10T11:00:00.000Z');
  assert.equal(iso(nextRunAfter({ frequency: 'every6h' }, from)), '2026-06-10T16:00:00.000Z');
  assert.equal(nextRunAfter({ frequency: 'manual' }, from), null);
});

test('daily runs at the chosen hour of Rome, in summer and in winter time', () => {
  // CEST (UTC+2)
  assert.equal(
    iso(nextRunAfter({ frequency: 'daily', dailyHour: 3 }, Date.parse('2026-06-10T10:00:00Z'))),
    '2026-06-11T01:00:00.000Z'
  );
  // CET (UTC+1)
  assert.equal(
    iso(nextRunAfter({ frequency: 'daily', dailyHour: 3 }, Date.parse('2026-12-10T10:00:00Z'))),
    '2026-12-11T02:00:00.000Z'
  );
  // later today when the hour has not come yet (Rome is 12:00 here)
  assert.equal(
    iso(nextRunAfter({ frequency: 'daily', dailyHour: 18 }, Date.parse('2026-06-10T10:00:00Z'))),
    '2026-06-10T16:00:00.000Z'
  );
});

test('daily follows the clock change: 03:00 stays 03:00 in Rome', () => {
  // the night of 2026-03-29 Rome goes from CET to CEST: 03:00 that day is 01:00 UTC, the day before 02:00 UTC
  assert.equal(
    iso(nextRunAfter({ frequency: 'daily', dailyHour: 3 }, Date.parse('2026-03-28T02:30:00Z'))),
    '2026-03-29T01:00:00.000Z'
  );
  assert.equal(
    iso(nextRunAfter({ frequency: 'daily', dailyHour: 3 }, Date.parse('2026-03-29T01:30:00Z'))),
    '2026-03-30T01:00:00.000Z'
  );
  // and back, on 2026-10-25
  assert.equal(
    iso(nextRunAfter({ frequency: 'daily', dailyHour: 3 }, Date.parse('2026-10-24T02:30:00Z'))),
    '2026-10-25T02:00:00.000Z'
  );
});

test('weekly runs on Monday', () => {
  // 2026-06-10 is a Wednesday: the next Monday is the 15th
  assert.equal(
    iso(nextRunAfter({ frequency: 'weekly', dailyHour: 3 }, Date.parse('2026-06-10T10:00:00Z'))),
    '2026-06-15T01:00:00.000Z'
  );
  // on a Monday after the hour: a week later
  assert.equal(
    iso(nextRunAfter({ frequency: 'weekly', dailyHour: 3 }, Date.parse('2026-06-15T10:00:00Z'))),
    '2026-06-22T01:00:00.000Z'
  );
});

test('a scheduled run that starts slightly early does not come round twice', () => {
  const scheduled = Date.parse('2026-06-11T01:00:00Z'); // 03:00 in Rome
  const startedEarly = scheduled - 90_000;
  const schedule = { frequency: 'daily', dailyHour: 3 };
  assert.equal(iso(nextRunAfterRun(schedule, startedEarly, scheduled)), '2026-06-12T01:00:00.000Z');
  // a manual run in the afternoon does not skip the night's slot
  const manual = Date.parse('2026-06-10T12:00:00Z');
  assert.equal(iso(nextRunAfterRun(schedule, manual, scheduled)), '2026-06-11T01:00:00.000Z');
});

test('isDue allows for a tick that fires a little early', () => {
  const now = Date.parse('2026-06-10T10:00:00Z');
  assert.equal(isDue({ frequency: 'hourly', nextRunAt: now + DUE_SLACK_MS - 1 }, now), true);
  assert.equal(isDue({ frequency: 'hourly', nextRunAt: now + DUE_SLACK_MS + 60_000 }, now), false);
  assert.equal(isDue({ frequency: 'hourly', nextRunAt: null }, now), true);
  assert.equal(isDue({ frequency: 'manual', nextRunAt: now - 1 }, now), false);
});

test('normalizeSchedule validates what the browser sends', () => {
  assert.deepEqual(normalizeSchedule({ frequency: 'daily', dailyHour: 7 }), {
    frequency: 'daily',
    dailyHour: 7
  });
  assert.deepEqual(normalizeSchedule({ frequency: 'hourly' }), { frequency: 'hourly', dailyHour: 3 });
  assert.throws(() => normalizeSchedule({ frequency: 'every-minute' }));
  assert.throws(() => normalizeSchedule({ frequency: 'daily', dailyHour: 24 }));
  assert.throws(() => normalizeSchedule({ frequency: 'daily', dailyHour: 2.5 }));
});

// ── what to do with a file ───────────────────────────────────────────────────

const NOW = Date.parse('2026-06-10T10:00:00Z');
const entry = (overrides = {}) => ({
  id: 'f1',
  name: 'Guida.pdf',
  size: 1000,
  version: '5',
  md5: 'aaa',
  modifiedTime: '2026-06-01T00:00:00.000Z',
  webViewLink: 'https://drive.google.com/file/d/f1/view',
  path: 'Moduli',
  ...overrides
});
const stored = (overrides = {}) => ({
  source: 'drive',
  name: 'Guida.pdf',
  storagePath: 'assistente-7hub/documents/drive-f1/Guida.pdf',
  indexingStatus: 'done',
  driveSourceIds: ['s1'],
  driveVersion: '5',
  driveMd5: 'aaa',
  driveModifiedTime: '2026-06-01T00:00:00.000Z',
  driveWebViewLink: 'https://drive.google.com/file/d/f1/view',
  drivePath: 'Moduli',
  ...overrides
});
const plan = input => planFile({ sourceId: 's1', forceSince: null, now: NOW, ...input });

test('a new file is downloaded and indexed', () => {
  assert.deepEqual(plan({ entry: entry() }), { type: 'create', download: true, index: true, changed: true });
});

test('a file that did not change is left alone', () => {
  assert.deepEqual(plan({ entry: entry(), existing: stored() }), { type: 'none' });
});

test('a changed checksum means download and index again', () => {
  const result = plan({ entry: entry({ md5: 'bbb', version: '6' }), existing: stored() });
  assert.deepEqual(result, { type: 'update', download: true, index: true, changed: true });
});

test('a rename or a version bump with the same checksum costs no download and no card', () => {
  const renamed = plan({ entry: entry({ name: 'Guida 2.pdf', version: '6' }), existing: stored() });
  assert.deepEqual(renamed, { type: 'update', download: false, index: false, changed: true });
  const bumped = plan({ entry: entry({ version: '6' }), existing: stored() });
  assert.deepEqual(bumped, { type: 'update', download: false, index: false, changed: false });
});

test('without a checksum the version decides', () => {
  const noMd5 = { md5: null };
  assert.equal(plan({ entry: entry({ ...noMd5 }), existing: stored({ driveMd5: null }) }).type, 'none');
  assert.equal(
    plan({ entry: entry({ ...noMd5, version: '6' }), existing: stored({ driveMd5: null }) }).download,
    true
  );
});

test('a file reached from a second source is only linked', () => {
  const result = plan({ entry: entry(), existing: stored({ driveSourceIds: ['other'] }) });
  assert.deepEqual(result, { type: 'update', download: false, index: false, changed: false });
});

test('a failed card is retried, but not at every run', () => {
  const failed = stored({ indexingStatus: 'failed' });
  assert.equal(plan({ entry: entry(), existing: failed }).index, true);
  const justFailed = stored({
    indexingStatus: 'failed',
    driveIndexFailedAt: { toMillis: () => NOW - 60_000 }
  });
  assert.equal(plan({ entry: entry(), existing: justFailed }).type, 'none');
  const failedLongAgo = stored({
    indexingStatus: 'failed',
    driveIndexFailedAt: { toMillis: () => NOW - RETRY_FAILED_AFTER_MS - 1 }
  });
  assert.equal(plan({ entry: entry(), existing: failedLongAgo }).index, true);
});

test('an interrupted document is indexed at the next run', () => {
  const result = plan({ entry: entry(), existing: stored({ indexingStatus: 'pending' }) });
  assert.deepEqual(result, { type: 'update', download: false, index: true, changed: true });
});

test('"Reindicizza tutto" redoes every card once, then leaves them alone', () => {
  const forceSince = NOW - 3_600_000;
  const old = stored({ indexedAt: { toMillis: () => forceSince - 1000 } });
  assert.deepEqual(plan({ entry: entry(), existing: old, forceSince }), {
    type: 'update',
    download: false,
    index: true,
    changed: true
  });
  const redone = stored({ indexedAt: { toMillis: () => forceSince + 1000 } });
  assert.equal(plan({ entry: entry(), existing: redone, forceSince }).type, 'none');
});

test('a document without bytes is downloaded again', () => {
  assert.equal(plan({ entry: entry(), existing: stored({ storagePath: null }) }).download, true);
});

test('a PDF over 20 MB is skipped with its reason', () => {
  assert.deepEqual(plan({ entry: entry({ size: MAX_FILE_SIZE_BYTES + 1 }) }), {
    type: 'skip',
    reason: SKIP_REASONS.tooLarge
  });
  assert.equal(plan({ entry: entry({ size: MAX_FILE_SIZE_BYTES }) }).type, 'create');
});

test('a name already taken is skipped, saying by what', () => {
  assert.deepEqual(plan({ entry: entry(), conflict: { source: 'upload' } }), {
    type: 'skip',
    reason: 'esiste già un documento caricato con questo nome'
  });
  assert.equal(plan({ entry: entry(), conflict: { source: 'drive' } }).reason, SKIP_REASONS.takenName);
});

// ── retry and pool ───────────────────────────────────────────────────────────

test('transient errors are recognised, others are not', () => {
  assert.equal(isTransientError({ status: 503 }), true);
  assert.equal(isTransientError(new Error('429 RESOURCE_EXHAUSTED')), true);
  assert.equal(isTransientError(new Error('read ECONNRESET')), true);
  assert.equal(isTransientError({ code: 404 }), false);
  assert.equal(isTransientError(new Error('Descrizione mancante')), false);
});

test('withRetry retries transient failures and gives up on the others', async () => {
  let calls = 0;
  const flaky = async () => {
    if (++calls < 3) throw new Error('503 UNAVAILABLE');
    return 'ok';
  };
  assert.equal(await withRetry(flaky, { baseDelayMs: 1 }), 'ok');
  assert.equal(calls, 3);

  let permanent = 0;
  await assert.rejects(() =>
    withRetry(
      async () => {
        permanent++;
        throw Object.assign(new Error('nope'), { status: 404 });
      },
      { baseDelayMs: 1 }
    )
  );
  assert.equal(permanent, 1);

  const controller = new AbortController();
  controller.abort();
  let aborted = 0;
  await assert.rejects(() =>
    withRetry(
      async () => {
        aborted++;
        throw new Error('503');
      },
      { baseDelayMs: 1, signal: controller.signal }
    )
  );
  assert.equal(aborted, 1);
});

test('runPool never runs more than `limit` at once and keeps the order', async () => {
  let running = 0;
  let peak = 0;
  const results = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async n => {
    running++;
    peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
    return n * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(peak, 3);
});

// ── webhook token ────────────────────────────────────────────────────────────

test('the channel token proves a source and cannot be forged or moved to another app', () => {
  process.env.DB_CRED_KEY = Buffer.alloc(32, 7).toString('base64');
  const token = forApp(PRODUCTION_APP, () => channelToken(ID))();
  assert.ok(token.length <= 256);
  assert.equal(forApp(PRODUCTION_APP, () => verifyChannelToken(token))(), ID);
  // the development twin never accepts a production token
  assert.equal(forApp(DEVELOPMENT_APP, () => verifyChannelToken(token))(), null);
  // another source's id with this MAC, a tampered MAC, junk
  const mac = token.slice(token.lastIndexOf('.') + 1);
  for (const bad of [`other.${mac}`, `${ID}.${mac.slice(0, -1)}A`, ID, '', undefined, null, '.x']) {
    assert.equal(forApp(PRODUCTION_APP, () => verifyChannelToken(bad))(), null, String(bad));
  }
  // without the key nothing verifies
  delete process.env.DB_CRED_KEY;
  assert.equal(forApp(PRODUCTION_APP, () => verifyChannelToken(token))(), null);
});

// ── the index card is the browser's ──────────────────────────────────────────

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const browserIndexing = read('../../src/features/documents/indexing.js');
const browserDefaults = read('../../src/features/settings/defaultSettings.js');
const browserModels = read('../../src/features/settings/models.js');
const browserAttachments = read('../../src/shared/promptAttachments.js');

const between = (source, start, end) =>
  source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)) + end.length);

test('INDEX_CARD_SCHEMA is the browser one, word for word', () => {
  const serverSource = read('../src/drive/indexCard.js');
  const clean = text =>
    text
      .replace(/^export /, '')
      .replace(/\s+/g, ' ')
      .trim();
  assert.equal(
    clean(between(serverSource, 'export const INDEX_CARD_SCHEMA', '\n};')),
    clean(between(browserIndexing, 'const INDEX_CARD_SCHEMA', '\n};'))
  );
});

test('the indexing instructions and models default to the browser ones', () => {
  const instructions = between(browserDefaults, 'const DEFAULT_INDEXING_INSTRUCTIONS = `', '`;');
  assert.ok(instructions.includes(DEFAULT_INDEXING_INSTRUCTIONS));
  assert.ok(browserModels.includes(`DEFAULT_CHAT_MODEL = '${DEFAULT_CHAT_MODEL}'`));
  assert.ok(browserModels.includes(`DEFAULT_INDEXING_MODEL = '${DEFAULT_INDEXING_MODEL}'`));
});

test('the prompt text and the attachment block are the browser ones', () => {
  const document = { name: 'Guida.pdf', description: ' Modulo di delega ' };
  const prompt = indexingPrompt('ISTRUZIONI', [{ name: 'g.md', content: 'testo' }], document);
  const lines = prompt.split('\n');
  assert.equal(lines[0], 'ISTRUZIONI');
  assert.equal(lines.at(-2), 'Il documento si chiama "Guida.pdf".');
  assert.ok(lines.at(-1).includes('«Modulo di delega»'));
  // every fixed sentence the server writes is in the browser's prompt too
  for (const sentence of [
    'Il documento si chiama "${document.name}".',
    "Chi l'ha caricato lo descrive così: «${document.description.trim()}». È la fonte più affidabile su cosa sia ",
    'e a cosa serva: la scheda deve essere coerente con questa descrizione e riprenderne i termini.'
  ]) {
    assert.ok(browserIndexing.includes(sentence), sentence);
  }
  assert.equal(
    attachmentsBlock([{ name: 'g.md', content: 'testo' }]),
    '--- Guida allegata "g.md" ---\ntesto\n--- fine guida allegata ---'
  );
  for (const piece of [
    '--- Guida allegata "${a.name}" ---\\n${a.content}\\n--- fine guida allegata ---',
    ".join('\\n\\n')"
  ]) {
    assert.ok(browserAttachments.includes(piece), piece);
  }
});

test('settings are completed with the defaults like the browser does', () => {
  assert.deepEqual(indexingSettings({}), {
    modelId: DEFAULT_INDEXING_MODEL,
    instructions: DEFAULT_INDEXING_INSTRUCTIONS,
    attachments: [],
    categories: DEFAULT_DOCUMENT_CATEGORIES
  });
  // an empty indexing model means "the chat model"
  assert.equal(indexingSettings({ indexingModel: '', chatModel: 'gemini-x' }).modelId, 'gemini-x');
  assert.equal(indexingSettings({ indexingModel: '' }).modelId, DEFAULT_CHAT_MODEL);
  assert.equal(indexingSettings({ indexingModel: 'gemini-y' }).modelId, 'gemini-y');
  assert.equal(
    indexingSettings({ indexingAttachments: [{ name: 'a', content: 'b' }] }).attachments.length,
    1
  );
});

test('the card is cleaned like the browser does', () => {
  assert.deepEqual(
    cardFromAnswer({
      summary: ' Ciao ',
      banks: ['A', 'A', ' B '],
      products: null,
      topics: ['x', ''],
      keywords: [1, '1']
    }),
    { summary: 'Ciao', banks: ['A', 'B'], products: [], topics: ['x'], keywords: ['1'] }
  );
  assert.ok(INDEX_CARD_SCHEMA.required.includes('summary'));
});
