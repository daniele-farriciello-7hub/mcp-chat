/**
 * The lists of documents without AI as the browser keeps them: `settings.noAiDocumentLists`, an array edited in
 * Configurazione → Documenti → Documenti senza AI and read by the chat (`matchDocumentList.js`, `selectDocuments.js`).
 * Like the commands without AI (../commands/commandSettings.js) it is a fixed answer to an exact message, but the
 * answer is a card of files the browser picks from the documents catalog: no model call, no tokens, no server.
 *
 * A list:
 *   id            stable, generated (`newDocumentListId`, always 'list-…'); shortcuts point to it exactly as they point to
 *                 a command (the ids of the two never collide: commands are 'cmd-…', the old one 'erogato')
 *   name          what the panel, the shortcut picker and the Storico show
 *   enabled       off until the admin switches it on
 *   triggers      exact messages that show it: the same words-matching rules as a command (`normalizeTrigger`), and no
 *                 word may belong to two lists or to a list and a command (`claimTriggers`, the panels enforce it)
 *   title         the card's heading ('' = the name)
 *   intro         an optional line the assistant writes under the card ('' = a plain "Ecco i file")
 *   emptyMessage  what the chat says when nothing matches ('' = the default one, `defaultEmptyMessage`)
 *   selection     'rule' or 'fixed':
 *     rule    categories (0..n names of settings.documentCategories: a document qualifies with any of them; none = every
 *             document), nameContains (text the file name must contain, '' = any), sort ('recent' by the document's
 *             date, documents/documentDate.js, or 'name'), limit (1 to 50, 6 by default)
 *     fixed   documentIds, the files the admin chose by hand, in the order shown; a file that is gone is skipped
 *
 * Any document qualifies, studied or archive-only. Pure and dependency-free, so it loads in plain node.
 */
import {
  MAX_LISTING_FILES,
  DEFAULT_LISTING_FILES,
  clampListingLimit
} from '@/features/documents/listingLimits';

export const LIST_SELECTION = { rule: 'rule', fixed: 'fixed' };
export const LIST_SORT = { recent: 'recent', name: 'name' };

/** Most files an admin can pick by hand for one list: the cap of every listing. */
export const MAX_FIXED_DOCUMENTS = MAX_LISTING_FILES;
export const MAX_LIST_NAME_CHARS = 80;
export const MAX_NAME_FILTER_CHARS = 100;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const text = value => (typeof value === 'string' ? value : '');

/** What the chat says when a list matches nothing and the admin wrote no message of their own. */
export const defaultEmptyMessage = list =>
  `Non ho trovato documenti da mostrare per «${list?.name?.trim() || 'questo elenco'}» in questo momento.`;

/** The heading of a list's card: its title, or its name when the admin left the title empty. */
export const listTitle = list => text(list?.title).trim() || text(list?.name).trim() || 'File disponibili';

/** A list of strings without empty entries or repeats (capitals and accents aside, so «Mutuo» and «mutuo» are one). */
function uniqueStrings(value, key = item => item.toLowerCase()) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (!clean || seen.has(key(clean))) continue;
    seen.add(key(clean));
    list.push(clean);
  }
  return list;
}

/** One list as the browser uses it, or null when it is not one (no safe id). Missing values get the defaults. */
export function normalizeDocumentList(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id).trim();
  if (!SAFE_ID.test(id)) return null;
  return {
    id,
    name: text(raw.name).trim().slice(0, MAX_LIST_NAME_CHARS) || id,
    enabled: raw.enabled === true,
    // an empty list is the admin's choice (no word shows it, only a shortcut)
    triggers: Array.isArray(raw.triggers) ? raw.triggers.filter(t => typeof t === 'string') : [],
    title: text(raw.title),
    intro: text(raw.intro),
    emptyMessage: text(raw.emptyMessage),
    selection: raw.selection === LIST_SELECTION.fixed ? LIST_SELECTION.fixed : LIST_SELECTION.rule,
    categories: uniqueStrings(raw.categories),
    nameContains: text(raw.nameContains).trim().slice(0, MAX_NAME_FILTER_CHARS),
    sort: raw.sort === LIST_SORT.name ? LIST_SORT.name : LIST_SORT.recent,
    limit: clampListingLimit(raw.limit, DEFAULT_LISTING_FILES),
    documentIds: uniqueStrings(raw.documentIds, item => item)
      .filter(id => id.length <= 200)
      .slice(0, MAX_FIXED_DOCUMENTS)
  };
}

/** The lists of a stored settings object: the array when there is one, else none. The first of two with one id wins. */
export function normalizeDocumentLists(stored) {
  const lists = Array.isArray(stored?.noAiDocumentLists)
    ? stored.noAiDocumentLists.map(normalizeDocumentList)
    : [];
  const seen = new Set();
  return lists.filter(list => {
    if (!list || seen.has(list.id)) return false;
    seen.add(list.id);
    return true;
  });
}

/**
 * A new id, different from the ones in `existing` (lists, or lists and commands: anything with an `id`): 'list-' and
 * eight letters or digits.
 */
export function newDocumentListId(existing = []) {
  const taken = new Set(existing.map(item => item.id));
  let id;
  do id = `list-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
  while (taken.has(id));
  return id;
}

/**
 * A new list: off, with no words, a rule for the six most recent documents of any category. The admin sets it up and
 * switches it on. `existing` is every list and command already there (ids must not repeat).
 */
export const createDocumentList = existing =>
  normalizeDocumentList({
    id: newDocumentListId(existing),
    name: 'Nuovo elenco',
    enabled: false,
    selection: LIST_SELECTION.rule,
    sort: LIST_SORT.recent,
    limit: DEFAULT_LISTING_FILES
  });
