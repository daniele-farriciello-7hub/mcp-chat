/**
 * Search over the indexed documents, for the `search_archive` tool. The archive-only ones are not in the system
 * prompt, so this is how the assistant finds one; and a listing ("che moduli ci sono per il mutuo?", "le ultime 20
 * comunicazioni") has to be built here rather than by the model reading the prompt's list, which loses the newest
 * ones — so the studied documents are searched too, whatever the mode (each result says which it is). It runs in
 * the browser over the catalog the chat has already loaded (chatCatalog.js): a few hundred short cards, no server
 * and no embeddings.
 *
 * Text is folded (capitals, accents and punctuation do not matter) and compared word by word, with a
 * crude Italian stem so "mutuo" finds "mutui". Each word of the query scores by where it is found —
 * file name 5, keywords, categories, banks and products 3, description and card text 1 — scaled by how
 * close the match is, and a document scores the sum, plus a bonus when every word was found and a bigger
 * one when the whole query reads as a phrase in the name.
 *
 * `sort: 'recent'` keeps the same filter (words, category) but orders the matches from the most recent document
 * (documentDate.js; undated last), the score only breaking ties. `limit` is how many come back: 10 unless asked,
 * at most MAX_SEARCH_RESULTS. Pure.
 */
import { modeOf } from './archiveMode';
import { foldText, searchTokens, tokenMatch } from './textMatch';
import { pickCategories, visibleCategories } from './categories';
import { byName, byRecent } from './documentDate';
import { MAX_LISTING_FILES, clampListingLimit } from './listingLimits';

/** How many files come back when the caller does not say. */
export const DEFAULT_SEARCH_RESULTS = 10;
/** The most a caller can ask for: the cap of every listing (listingLimits.js). */
export const MAX_SEARCH_RESULTS = MAX_LISTING_FILES;
export const SEARCH_SORT = { relevance: 'relevance', recent: 'recent' };
const DESCRIPTION_CHARS = 300;

const WEIGHT = { name: 5, tags: 3, text: 1 };
const ALL_WORDS_BONUS = 2;
const PHRASE_BONUS = 3;

const wordsOf = value => foldText(value).split(' ').filter(Boolean);

/** The words of one document by where they sit: the name, the tag-like fields, the running text. */
function indexedWords(entry, categories) {
  return {
    name: wordsOf(entry.name),
    tags: [
      ...(entry.keywords || []),
      ...categories,
      ...(entry.banks || []),
      ...(entry.products || [])
    ].flatMap(wordsOf),
    text: [entry.description, entry.summary, ...(entry.topics || [])].flatMap(wordsOf)
  };
}

/** Score of one query word against a document: the best field it is found in. */
function wordScore(token, words) {
  let best = 0;
  for (const [field, list] of Object.entries(words)) {
    for (const word of list) best = Math.max(best, WEIGHT[field] * tokenMatch(token, word));
  }
  return best;
}

/** What the model is told about a file: the admin's own description when there is one, else the card's. */
const describe = entry =>
  (entry.description?.trim() || entry.summary || '').trim().slice(0, DESCRIPTION_CHARS);

/**
 * @param {object[]} entries     the chat catalog (every indexed document, any mode)
 * @param {object}   options
 * @param {string}   [options.query]       free text; empty with a `category` lists that category
 * @param {string}   [options.category]    a name of the list (capitals and accents do not matter)
 * @param {string[]} [options.categories]  the admins' list, the only categories that count
 * @param {'relevance'|'recent'} [options.sort]  best match first (default) or most recent document first
 * @param {number}   [options.limit]       how many to return, DEFAULT_SEARCH_RESULTS unless given, at most MAX_SEARCH_RESULTS
 * @returns {{ results: {id, name, description, categories, mode, date, score}[], total: number, unknownCategory: boolean }}
 *   `total` is how many files matched, `results` the first `limit` of them in the order asked. `date` is the
 *   document's date in milliseconds, or null.
 */
export function searchArchive(
  entries,
  {
    query = '',
    category = '',
    categories = [],
    sort = SEARCH_SORT.relevance,
    limit = DEFAULT_SEARCH_RESULTS
  } = {}
) {
  const files = entries || [];
  const wanted = String(category || '').trim();
  const [resolvedCategory] = wanted ? pickCategories([wanted], categories, 1) : [];
  if (wanted && !resolvedCategory) return { results: [], total: 0, unknownCategory: true };

  const tokens = searchTokens(query);
  const phrase = tokens.length > 1 ? tokens.join(' ') : '';

  const scored = [];
  for (const entry of files) {
    const own = visibleCategories(entry.categories, categories);
    if (resolvedCategory && !own.includes(resolvedCategory)) continue;

    let score = 0;
    if (tokens.length) {
      const words = indexedWords(entry, own);
      let found = 0;
      for (const token of tokens) {
        const points = wordScore(token, words);
        if (points > 0) found++;
        score += points;
      }
      if (found === 0) continue;
      if (found === tokens.length) score += ALL_WORDS_BONUS;
      if (phrase && ` ${foldText(entry.name)} `.includes(` ${phrase} `)) score += PHRASE_BONUS;
    }
    scored.push({
      id: entry.id,
      name: entry.name,
      description: describe(entry),
      categories: own,
      mode: modeOf(entry),
      date: Number.isFinite(entry.date) ? entry.date : null,
      score
    });
  }

  // the same name order whichever the sort: a tie is never left to the order the catalog came in
  const byRelevance = (a, b) => b.score - a.score || byName(a, b);
  scored.sort(sort === SEARCH_SORT.recent ? (a, b) => byRecent(a, b) || byRelevance(a, b) : byRelevance);
  return {
    results: scored.slice(0, clampListingLimit(limit, DEFAULT_SEARCH_RESULTS)),
    total: scored.length,
    unknownCategory: false
  };
}
