/**
 * Tests the scheduler's tick (src/drive/tick.js): which sources it runs and in what order, what it keeps
 * alive on the way, and that one source failing does not stop the others. Run: npm test (module mocks).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/drive/${file}`, import.meta.url).href;
const real = await import('firebase-admin/firestore');
const MIN = 60_000;
const ts = ms => real.Timestamp.fromMillis(ms);

const world = {};
function reset() {
  Object.assign(world, { sources: [], channelChecks: [], runs: [], failOn: null, budget: null });
}
reset();

mock.module(src('sourceStore.js'), { namedExports: { listSources: async () => world.sources } });
mock.module(src('channels.js'), {
  namedExports: { syncChannels: async source => void world.channelChecks.push(source.id) }
});
mock.module(src('syncSource.js'), {
  namedExports: {
    makeBudget: () => world.budget || { newWorkUntil: Date.now() + 400_000 },
    runSource: async (id, options) => {
      world.runs.push({ id, trigger: options.trigger, onlyIfDue: options.onlyIfDue });
      if (world.failOn === id) throw new Error('boom');
      return { trigger: options.trigger, errors: [] };
    }
  }
});
const { runDriveTick } = await import(src('tick.js'));

const source = (id, overrides = {}) => ({
  id,
  frequency: 'hourly',
  nextRunAt: ts(Date.now() - MIN),
  lastRunAt: ts(Date.now() - 60 * MIN),
  webhookAt: null,
  webhook: { channels: 0 },
  ...overrides
});

beforeEach(reset);

test('due sources run oldest first; sources not due, and manual-only ones, do not', async () => {
  world.sources = [
    source('late', { nextRunAt: ts(Date.now() - MIN) }),
    source('early', { nextRunAt: ts(Date.now() - 30 * MIN) }),
    source('later', { nextRunAt: ts(Date.now() + 40 * MIN) }),
    source('manual', { frequency: 'manual', nextRunAt: null })
  ];
  await runDriveTick();
  assert.deepEqual(
    world.runs.map(run => run.id),
    ['early', 'late']
  );
  assert.equal(world.runs[0].onlyIfDue, true); // the lease re-checks it
});

test('a notification since the last run shows as the trigger', async () => {
  world.sources = [
    source('a', { webhookAt: ts(Date.now() - 5 * MIN) }),
    source('b', { webhookAt: ts(Date.now() - 90 * MIN) })
  ];
  await runDriveTick();
  assert.deepEqual(
    world.runs.map(run => run.trigger),
    ['webhook', 'schedule']
  );
});

test('channels are kept alive for every source that can have them, due or not', async () => {
  world.sources = [
    source('auto', { nextRunAt: ts(Date.now() + 40 * MIN) }),
    source('manual-with-channels', { frequency: 'manual', nextRunAt: null, webhook: { channels: 2 } }),
    source('manual-none', { frequency: 'manual', nextRunAt: null })
  ];
  await runDriveTick();
  assert.deepEqual(world.channelChecks.sort(), ['auto', 'manual-with-channels']);
});

test('one source failing does not stop the others', async () => {
  world.sources = [source('a', { nextRunAt: ts(Date.now() - 20 * MIN) }), source('b')];
  world.failOn = 'a';
  await runDriveTick();
  assert.deepEqual(
    world.runs.map(run => run.id),
    ['a', 'b']
  );
});

test('with too little time left no new source is started', async () => {
  world.budget = { newWorkUntil: Date.now() + 30_000 };
  world.sources = [source('a')];
  await runDriveTick();
  assert.deepEqual(world.runs, []);
});
