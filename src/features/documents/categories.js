/**
 * Document categories: a short fixed list the admins keep (`documentCategories` in the settings,
 * Configurazione → Documenti → Categorie), from which Gemini picks 1–3 for each document at indexing. What
 * is stored on a document is `categories` (names from that list) and `categoriesManual`, set once an
 * admin has corrected them by hand: from then on indexing leaves them alone. Pure.
 *
 * The list is the only truth. A name that is no longer in it (the admin removed it) stays written on the
 * documents that had it but is invisible: every reader goes through `visibleCategories`. Putting the
 * name back brings it back; renaming moves the documents along (`renameCategoryOnDocuments`).
 *
 * Copied in functions/src/drive/indexCard.js (`pickCategories`, `DEFAULT_DOCUMENT_CATEGORIES`): the
 * server indexes Drive documents and must choose the same way. functions/scripts/archive-categories.test.mjs
 * runs both over the same cases.
 */
import { foldText } from './textMatch';

export const DEFAULT_DOCUMENT_CATEGORIES = [
  'Mutuo',
  'Cessione del quinto',
  'Prestito',
  'Policy banca',
  'Modulistica',
  'Contratti',
  'Procedure interne',
  'Marketing'
];

/** Most categories one document carries, whoever picks them. */
export const MAX_CATEGORIES_PER_DOCUMENT = 3;
export const MAX_CATEGORY_NAME_CHARS = 40;
export const MAX_CATEGORIES_IN_LIST = 40;

/** One list entry as it is kept: single spaces, trimmed, not too long. */
const cleanName = name =>
  String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CATEGORY_NAME_CHARS)
    .trim();

/** The admin's list, cleaned: no empty entries, no repeats (capitals and accents do not tell two apart). */
export function normalizeCategoryList(list) {
  const seen = new Set();
  const names = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const name = cleanName(raw);
    const key = foldText(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === MAX_CATEGORIES_IN_LIST) break;
  }
  return names;
}

/** True when `name` is already in `list` (ignoring capitals and accents), `except` aside. */
export const hasCategory = (list, name, except = null) =>
  list.some(item => item !== except && foldText(item) === foldText(name));

/**
 * What a model (or anyone) proposed, reduced to the list: only names in `allowed`, spelled as in the list,
 * each once, at most `max`. Anything else — a category the model invented, a word that is not one — is
 * dropped, so a document can never carry a category the admins did not create.
 */
export function pickCategories(proposed, allowed, max = MAX_CATEGORIES_PER_DOCUMENT) {
  const byKey = new Map();
  for (const name of Array.isArray(allowed) ? allowed : []) {
    if (!byKey.has(foldText(name))) byKey.set(foldText(name), name);
  }
  const picked = [];
  for (const raw of Array.isArray(proposed) ? proposed : []) {
    const name = byKey.get(foldText(raw));
    if (name && !picked.includes(name)) picked.push(name);
    if (picked.length >= max) break;
  }
  return picked;
}

/** The categories a document has that are still in the list: what the panel and the chat show. */
export const visibleCategories = (stored, allowed) => pickCategories(stored, allowed, Infinity);

/**
 * What indexing writes about categories on a document. A document whose categories an admin corrected by
 * hand (`manual`) is not touched, and nothing is written when there is no list to choose from. Otherwise
 * the model's pick, limited to the list.
 */
export function categoryUpdate({ proposed, allowed, manual }) {
  if (manual === true || !allowed?.length) return {};
  return { categories: pickCategories(proposed, allowed) };
}

/** Whether a document has no category an admin or the model gave it, among those still in the list. */
export const lacksCategories = (document, allowed) =>
  visibleCategories(document?.categories, allowed).length === 0;

/**
 * Documents that "Classifica tutti" works on: indexed, with a card to classify from, no category left in the
 * list, and no hand-made choice (an admin who left a document without any category meant it).
 */
export const needsClassifying = (document, allowed) =>
  // INDEXING_STATUS.done (schema.js, which pulls in Firebase: this module has to stay loadable without it)
  document?.indexingStatus === 'done' &&
  Boolean(document?.indexCard) &&
  document?.categoriesManual !== true &&
  lacksCategories(document, allowed);

/** Value of the "no category" choice in the panel's filter, which no real name can take. */
export const NO_CATEGORY = '__none__';

/** Whether a document passes the category filter of the panel: 'all', NO_CATEGORY or a name of the list. */
export function matchesCategoryFilter(document, filter, allowed) {
  if (!filter || filter === 'all') return true;
  const own = visibleCategories(document?.categories, allowed);
  if (filter === NO_CATEGORY) return own.length === 0;
  return own.some(name => foldText(name) === foldText(filter));
}
