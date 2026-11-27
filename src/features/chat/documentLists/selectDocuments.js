/**
 * Which documents a list without AI shows (documentListSettings.js), picked from the documents catalog the chat
 * already holds (documents/chatCatalog.js): every indexed document, studied or archive-only. Pure, so the same
 * function draws the chat's card and the admin's preview in the panel, and it can be checked in plain node.
 *
 *   fixed   the files the admin chose, in their order; one that is not in the catalog (deleted, or not indexed any
 *           more) is skipped without a word
 *   rule    the documents with any of the rule's categories (none named = every document) whose name contains the
 *           rule's text, sorted by date (most recent first, undated last) or by name, and the first `limit` of them.
 *           A rule that names categories none of which is still in the admins' list matches nothing: a category
 *           taken off the list must not turn "the communications" into "every document"
 *
 * Catalog entries need `id`, `name`, `categories` and `date` (milliseconds or null). Text is compared folded
 * (documents/textMatch.js): capitals, accents and punctuation do not matter.
 */
import { byName, byRecent, documentDateMs } from '@/features/documents/documentDate';
import { modeOf } from '@/features/documents/archiveMode';
import { MAX_LISTING_FILES, clampListingLimit } from '@/features/documents/listingLimits';
import { visibleCategories } from '@/features/documents/categories';
import { foldText } from '@/features/documents/textMatch';
import { LIST_SELECTION, LIST_SORT } from './documentListSettings.js';

/** The rule's categories that still exist, spelled as the admins' list has them. */
export const liveRuleCategories = (list, allowedCategories) =>
  visibleCategories(list?.categories, allowedCategories ?? list?.categories ?? []);

/**
 * @param {object[]} catalog  the chat catalog entries
 * @param {object}   list     a normalized list of documents (documentListSettings.js)
 * @param {object}   [options]
 * @param {string[]} [options.categories]  the admins' list of categories (settings.documentCategories)
 * @returns {object[]} catalog entries, in the order to show, at most MAX_LISTING_FILES
 */
export function selectDocuments(catalog, list, { categories } = {}) {
  const entries = Array.isArray(catalog) ? catalog : [];
  if (!list) return [];

  if (list.selection === LIST_SELECTION.fixed) {
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const chosen = [];
    for (const id of list.documentIds ?? []) {
      const entry = byId.get(id);
      if (entry && !chosen.includes(entry)) chosen.push(entry);
    }
    return chosen.slice(0, MAX_LISTING_FILES);
  }

  const wanted = liveRuleCategories(list, categories).map(foldText);
  const names = Array.isArray(list.categories) ? list.categories.filter(name => String(name).trim()) : [];
  // categories were asked for and none of them exists any more: nothing, not everything
  if (names.length && !wanted.length) return [];

  const needle = foldText(list.nameContains);
  const matching = entries.filter(entry => {
    if (wanted.length) {
      const own = visibleCategories(entry.categories, categories ?? entry.categories ?? []).map(foldText);
      if (!wanted.some(name => own.includes(name))) return false;
    }
    return !needle || foldText(entry.name).includes(needle);
  });

  const order = list.sort === LIST_SORT.name ? byName : (a, b) => byRecent(a, b) || byName(a, b);
  return matching.sort(order).slice(0, clampListingLimit(list.limit));
}

/**
 * A document as Firestore holds it (what the admin's panel has live) turned into the entry this selection works on,
 * the same fields the chat's catalog entries have for it (documents/chatCatalog.js): the panel's preview and its
 * picker see what the chat will see.
 */
export const catalogEntryOf = (document, categories) => ({
  id: document.id,
  name: document.name,
  mode: modeOf(document),
  categories: visibleCategories(document.categories, categories ?? []),
  date: documentDateMs(document)
});
