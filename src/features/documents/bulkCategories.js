/**
 * Changing the categories of several documents at once (the "Categorie" action in the selection bar of the
 * indexed list): what each document would end up with, and the sentence that tells what happened. Pure.
 *
 * Three actions on a few names of the admins' list (at most MAX_CATEGORIES_PER_DOCUMENT of them):
 *   add      the names a document lacks are added to it. A document that would end up with more than the
 *            maximum is skipped ("full"): it never gets some of the names and not the others
 *   remove   the names are taken off the documents that have them
 *   replace  the document gets exactly these names (an empty choice does nothing: it never clears a document)
 * A document that is already as the action wants it is left alone ("unchanged"): nothing is written for it.
 *
 * The list is the only truth (categories.js): only the names still in it count, so a name the admins took off
 * the list stays written on the document, unseen, exactly as it was (after the new ones in the array). The
 * single-document editor drops those names when it saves; here they must survive, since the admin never saw them.
 */
import { MAX_CATEGORIES_PER_DOCUMENT, pickCategories, visibleCategories } from './categories';
import { foldText } from './textMatch';

export const CATEGORY_ACTION = { add: 'add', remove: 'remove', replace: 'replace' };
export const CATEGORY_RESULT = { changed: 'changed', unchanged: 'unchanged', full: 'full' };

const sameSet = (a, b) => a.length === b.length && a.every(name => b.includes(name));

/**
 * What one document gets: `{ result: 'changed', categories }` with the whole array to write (its categories
 * after the action, spelled as in the list, then the ones the list no longer has), or `{ result: 'unchanged' }`
 * / `{ result: 'full' }` with nothing to write. `stored` is the document's `categories` as they are saved.
 */
export function changeCategories(stored, { action, names }, allowed) {
  const own = visibleCategories(stored, allowed);
  const chosen = pickCategories(names, allowed);
  const hidden = [
    ...new Set(
      (Array.isArray(stored) ? stored : []).filter(
        name => typeof name === 'string' && name.trim() && pickCategories([name], allowed).length === 0
      )
    )
  ];
  const changed = categories => ({ result: CATEGORY_RESULT.changed, categories: [...categories, ...hidden] });
  const unchanged = { result: CATEGORY_RESULT.unchanged };

  switch (action) {
    case CATEGORY_ACTION.add: {
      const missing = chosen.filter(name => !own.includes(name));
      if (!missing.length) return unchanged;
      if (own.length + missing.length > MAX_CATEGORIES_PER_DOCUMENT) return { result: CATEGORY_RESULT.full };
      return changed([...own, ...missing]);
    }
    case CATEGORY_ACTION.remove: {
      const keys = new Set(chosen.map(foldText));
      const kept = own.filter(name => !keys.has(foldText(name)));
      return kept.length === own.length ? unchanged : changed(kept);
    }
    case CATEGORY_ACTION.replace:
      return !chosen.length || sameSet(own, chosen) ? unchanged : changed(chosen);
    default:
      throw new Error(`Unknown category action: ${action}`);
  }
}

/**
 * The change over a list of documents: `updates` is `[{ id, categories }]` for the ones to write, and the
 * three counts say how many documents were changed, were already as wanted, or had no room (add only).
 */
export function planCategoryChange(documents, change, allowed) {
  const plan = { updates: [], changed: 0, unchanged: 0, full: 0 };
  for (const document of documents) {
    const { result, categories } = changeCategories(document.categories, change, allowed);
    plan[result]++;
    if (result === CATEGORY_RESULT.changed) plan.updates.push({ id: document.id, categories });
  }
  return plan;
}

const documentsLabel = n => `${n} ${n === 1 ? 'documento' : 'documenti'}`;

/** «A», «B» e «C» */
function quoted(names) {
  const marked = names.map(name => `«${name}»`);
  return marked.length > 1 ? `${marked.slice(0, -1).join(', ')} e ${marked.at(-1)}` : (marked[0] ?? '');
}

/**
 * The final summary, as `{ tone, text }` ('ok', or 'error' when some documents could not be saved), e.g.
 * "«Mutuo» aggiunta a 12 documenti; 2 ne avevano già 3." `failed` is how many of `plan.updates` were not written.
 */
export function describeCategoryChange({ action, names }, plan, failed = 0) {
  const written = plan.changed - failed;
  const many = names.length > 1;
  const label = quoted(names);

  let headline;
  if (written <= 0) headline = 'Nessun documento aggiornato';
  else if (action === CATEGORY_ACTION.add)
    headline = `${label} ${many ? 'aggiunte' : 'aggiunta'} a ${documentsLabel(written)}`;
  else if (action === CATEGORY_ACTION.remove)
    headline = `${label} ${many ? 'tolte' : 'tolta'} da ${documentsLabel(written)}`;
  else headline = `Categorie sostituite con ${label} in ${documentsLabel(written)}`;

  const notes = [];
  if (plan.unchanged) {
    notes.push(`${plan.unchanged} ${plan.unchanged === 1 ? 'era già a posto' : 'erano già a posto'}`);
  }
  if (plan.full) {
    const verb = plan.full === 1 ? 'aveva' : 'avevano';
    notes.push(
      many
        ? `${plan.full} non ${verb} posto per tutte (massimo ${MAX_CATEGORIES_PER_DOCUMENT})`
        : `${plan.full} ne ${verb} già ${MAX_CATEGORIES_PER_DOCUMENT}`
    );
  }
  if (failed) {
    notes.push(`${failed} non ${failed === 1 ? 'è stato aggiornato' : 'sono stati aggiornati'}: riprova`);
  }
  return { tone: failed ? 'error' : 'ok', text: `${[headline, ...notes].join('; ')}.` };
}
