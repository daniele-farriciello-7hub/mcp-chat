/**
 * What the scheduler does every 15 minutes (`driveScheduler`, functions/index.js), for the app it runs as:
 *
 *   1. keep the Drive notification channels alive — renew the ones near expiry (channels.js);
 *   2. run the sources that are due: the version comparison, at each source's own frequency, whether or
 *      not a webhook is working. A notification only makes `nextRunAt` "now" (sourceStore.noteDriveChange).
 *
 * The oldest-due source goes first, and the tick stops starting sources when its time budget is nearly
 * spent: what is left is still due and is taken by the next tick.
 */
import { syncChannels } from './channels.js';
import { isDue } from './schedule.js';
import { listSources } from './sourceStore.js';
import { makeBudget, runSource } from './syncSource.js';
import { runPool } from './retry.js';

// a source started with less than this left would only be interrupted
const MIN_TIME_TO_START_MS = 60_000;

const millis = value => value?.toMillis?.() ?? null;

export async function runDriveTick() {
  const budget = makeBudget();
  const now = Date.now();
  const sources = await listSources();

  // a manual-only source with nothing registered has nothing to keep alive
  const watched = sources.filter(source => source.frequency !== 'manual' || source.webhook?.channels > 0);
  await runPool(watched, 2, async source => {
    try {
      await syncChannels(source, { now });
    } catch (error) {
      console.warn(`drive: channels of ${source.id} failed:`, error?.message || error);
    }
  });

  const due = sources
    .filter(source => isDue({ frequency: source.frequency, nextRunAt: millis(source.nextRunAt) }, now))
    .sort((a, b) => (millis(a.nextRunAt) ?? 0) - (millis(b.nextRunAt) ?? 0));

  for (const source of due) {
    if (Date.now() > budget.newWorkUntil - MIN_TIME_TO_START_MS) break;
    const notified = (millis(source.webhookAt) ?? 0) > (millis(source.lastRunAt) ?? 0);
    try {
      const result = await runSource(source.id, {
        trigger: notified ? 'webhook' : 'schedule',
        budget,
        onlyIfDue: true
      });
      if (result) {
        console.log(
          `drive: ${source.id} ${result.trigger}`,
          JSON.stringify({ ...result, errors: result.errors.length })
        );
      }
    } catch (error) {
      // one source failing to start or to record its outcome must not stop the others
      console.error(`drive: ${source.id} failed`, error);
    }
  }
}
