/**
 * How often a Drive source is synchronised, and when it is due next. The frequency ids are the ones
 * the browser sends (src/features/drive/driveFrequencies.js): keep the two lists aligned.
 *
 * `daily` runs at `dailyHour` (0-23) in Europe/Rome, `weekly` on Mondays at the same hour. The
 * others repeat at a fixed interval from the start of the last run. Rome wall-clock time is worked
 * out with Intl, so daylight saving needs no library.
 */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const FREQUENCIES = ['every15min', 'hourly', 'every6h', 'daily', 'weekly', 'manual'];
export const DEFAULT_FREQUENCY = 'hourly';
export const DEFAULT_DAILY_HOUR = 3;

const INTERVAL_MS = { every15min: 15 * MINUTE_MS, hourly: HOUR_MS, every6h: 6 * HOUR_MS };

/**
 * The scheduler wakes every 15 minutes, so a source is also "due" up to this long before its time:
 * otherwise a tick that fires a few seconds early would skip it and double its period.
 */
export const DUE_SLACK_MS = 2 * MINUTE_MS;

const ROME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric'
});

/** Rome's wall clock at an instant, as numbers. */
function romeParts(ms) {
  const parts = Object.fromEntries(ROME.formatToParts(new Date(ms)).map(p => [p.type, Number(p.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour };
}

/** The instant at which Rome's clock reads `year-month-day hour:00` (month 1-12). */
function romeWallToInstant(year, month, day, hour) {
  const wall = Date.UTC(year, month - 1, day, hour);
  const offsetAt = instant => {
    const p = romeParts(instant);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour) - Math.floor(instant / HOUR_MS) * HOUR_MS;
  };
  // the offset depends on the instant being looked for: two passes settle it, also around a clock change
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

/** Validated schedule fields, or throws a message for the admin. */
export function normalizeSchedule({ frequency, dailyHour }) {
  if (!FREQUENCIES.includes(frequency)) throw new Error('Frequenza non valida.');
  const hour = dailyHour === undefined || dailyHour === null ? DEFAULT_DAILY_HOUR : Number(dailyHour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Ora non valida.');
  return { frequency, dailyHour: hour };
}

/** The first Rome `hour:00` strictly after `from`, on a Monday when `mondayOnly`. */
function nextRomeHour(from, hour, mondayOnly) {
  const { year, month, day } = romeParts(from);
  for (let offset = 0; offset < 9; offset++) {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    if (mondayOnly && date.getUTCDay() !== 1) continue;
    const candidate = romeWallToInstant(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      hour
    );
    if (candidate > from) return candidate;
  }
  return from + DAY_MS; // unreachable: a Monday always falls within nine days
}

/** When a source with this schedule is next due, given the start of its last run; null = never by itself. */
export function nextRunAfter({ frequency, dailyHour = DEFAULT_DAILY_HOUR }, from) {
  if (frequency === 'manual') return null;
  if (INTERVAL_MS[frequency]) return from + INTERVAL_MS[frequency];
  return nextRomeHour(from, dailyHour, frequency === 'weekly');
}

/**
 * When the source is due after a run that started at `startedMs`. A run that was itself the scheduled one
 * may start a little before its time (see DUE_SLACK_MS): for the wall-clock frequencies the next date is
 * then counted from the scheduled time, or the same slot would come round again.
 */
export function nextRunAfterRun(schedule, startedMs, scheduledMs) {
  const wasScheduled = scheduledMs != null && scheduledMs <= startedMs + DUE_SLACK_MS;
  const wallClock = schedule.frequency === 'daily' || schedule.frequency === 'weekly';
  return nextRunAfter(schedule, wallClock && wasScheduled ? Math.max(startedMs, scheduledMs) : startedMs);
}

/** True when the source should run at this tick. `nextRunAt` is epoch ms. */
export const isDue = ({ frequency, nextRunAt }, now) =>
  frequency !== 'manual' && (nextRunAt == null || nextRunAt <= now + DUE_SLACK_MS);
