/**
 * How many files a listing shows, in one place. A listing is a list of files shown with `offer_files` (the
 * model's) or by a document list without AI (documentLists/): "che moduli ci sono per il mutuo?", "mostrami le
 * ultime 20 comunicazioni".
 *
 *   DEFAULT_LISTING_FILES   what is shown when neither the operator's message nor the admin's instructions say how
 *                           many: the card stays a small grid of thumbnails
 *   MAX_LISTING_FILES       the hard cap, whoever asks: the card is a scrolling list past a few files
 *                           (components/FileChoiceCard.jsx), but there has to be an end
 *
 * functions/src/history/historyStore.js keeps the same cap (`MAX_CHOICE_FILES`) for the cards it stores: the server
 * cannot import this file, so functions/scripts/history-store.test.mjs compares the two. Pure.
 */
export const DEFAULT_LISTING_FILES = 6;
export const MAX_LISTING_FILES = 50;

/** A requested number of files as a whole number from 1 to the cap; `fallback` when it is not a usable number. */
export function clampListingLimit(value, fallback = DEFAULT_LISTING_FILES) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 1 ? Math.min(MAX_LISTING_FILES, number) : fallback;
}
