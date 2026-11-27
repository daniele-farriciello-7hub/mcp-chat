/**
 * The date of a document, for the listings that go "from the most recent" ("le ultime 20 comunicazioni",
 * `search_archive` with `sort: 'recent'`, the lists without AI of documentLists/). A document carries several
 * timestamps, and its name may carry the real date; the best one for "how recent is this" is, in this order:
 *
 *   the name            a date written in the file name wins over everything: "Comunicazione - 2026-11-25 - X.pdf".
 *                       Whatever a whole batch of files was uploaded or synced on is the same day for all of them,
 *                       while the name says which day each one is from. ISO `YYYY-MM-DD` (also with `_` or `.`)
 *                       and Italian `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY` are read; the first valid one counts
 *                       (a real calendar date, year 2000 to 2099: "2026-13-45" is not a date and is skipped)
 *   driveModifiedTime   a Drive document (schema.js): when the file was last changed on Drive, an ISO string. It is
 *                       the date the content is from; `createdAt` there is only when the sync first saw the file,
 *                       which is the same day for everything a new source brings in at once
 *   createdAt           an uploaded document: when the admin uploaded it (a replaced file is written again, so it
 *                       gets the date of the new version)
 *   indexedAt           last resort, for a document that somehow has neither
 *
 * A date in the name is a calendar day with no time: it becomes noon UTC of that day, which is the same day in Rome
 * all year (13:00 or 14:00 there), so `documentDay` shows exactly the day the name says. A document with none of
 * these has no date and goes last in a "recent" listing. Pure and dependency-free (apart from the Rome day
 * formatter), so it loads in plain node.
 */
import { romeDay } from '@/features/history/romeDay';

/** Epoch milliseconds from what Firestore and Drive give: a Timestamp, `{seconds}`, an ISO string or a number. */
function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  const seconds = value.seconds ?? value._seconds;
  if (Number.isFinite(seconds)) {
    return seconds * 1000 + Math.floor((value.nanoseconds ?? value._nanoseconds ?? 0) / 1e6);
  }
  return null;
}

/**
 * A date as a name writes it: ISO (2026-11-25, 2026_11_25, 2026.11.25; one separator throughout) or Italian
 * (25-11-2026, 25/11/2026, 25.11.2026). It must stand alone: not inside a longer run of digits.
 */
const NAME_DATE =
  /(?:^|\D)(?:(?<isoYear>\d{4})(?<isoSep>[-_.])(?<isoMonth>\d{2})\k<isoSep>(?<isoDay>\d{2})|(?<itDay>\d{2})(?<itSep>[-/.])(?<itMonth>\d{2})\k<itSep>(?<itYear>\d{4}))(?!\d)/g;

/** A real calendar date, in the years a document can come from, as noon UTC of that day; null when it is not one. */
function calendarDayMs(year, month, dayOfMonth) {
  if (year < 2000 || year > 2099) return null;
  const millis = Date.UTC(year, month - 1, dayOfMonth, 12);
  const date = new Date(millis);
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dayOfMonth;
  return real ? millis : null;
}

/** The first valid date written in a file name as epoch milliseconds (noon UTC of that day), or null. */
export function nameDateMs(name) {
  if (typeof name !== 'string') return null;
  for (const { groups } of name.matchAll(NAME_DATE)) {
    const millis = groups.isoYear
      ? calendarDayMs(Number(groups.isoYear), Number(groups.isoMonth), Number(groups.isoDay))
      : calendarDayMs(Number(groups.itYear), Number(groups.itMonth), Number(groups.itDay));
    if (millis !== null) return millis;
  }
  return null;
}

/** The date of a document as epoch milliseconds, or null when it has none. */
export const documentDateMs = document =>
  nameDateMs(document?.name) ??
  toMillis(document?.driveModifiedTime) ??
  toMillis(document?.createdAt) ??
  toMillis(document?.indexedAt);

/** That date as the calendar day in Rome, 'YYYY-MM-DD' (what the model and the stored cards carry), or null. */
export const documentDay = millis => (Number.isFinite(millis) ? romeDay(new Date(millis)) : null);

/** 'YYYY-MM-DD' as the operator reads it, '25/11/2026'; '' when there is none. */
export const formatDocumentDay = day =>
  /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? day.split('-').reverse().join('/') : '';

/**
 * Compare function for "most recent first": a document without a date goes after every dated one, equal dates are a
 * tie (0), left to the caller to break (by relevance, by name). Takes entries with `date` (milliseconds or null,
 * see `documentDateMs`).
 */
export function byRecent(a, b) {
  const first = Number.isFinite(a.date) ? a.date : null;
  const second = Number.isFinite(b.date) ? b.date : null;
  if (first === second) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return second - first;
}

/** Compare function for names, numbers read as numbers ("Comunicazione 2" before "Comunicazione 10"). */
export const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'it', { numeric: true });
