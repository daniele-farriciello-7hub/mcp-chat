/**
 * `search_archive` tool: finds files among all the indexed documents, whatever their mode — the archive-only ones
 * (`mode: 'archive'`), which are not in the system prompt, and the studied ones. The model gives some words, if
 * it knows which a category, and how many it wants and in which order; it gets back up to that many files (id,
 * name, description, categories, mode, date) and then hands them over with `offer_files` (several candidates, or
 * a listing like "che moduli ci sono per il mutuo?" or "le ultime 20 comunicazioni", which is `reason:
 * 'listing'`) or `share_file` (one clear match). Those two accept the ids found here: they validate against the
 * whole catalog.
 *
 * Why the studied documents are searched too: a listing is a job for this tool, not for the model reading the
 * system prompt's list. Asked for "the communications sent by Direzione, most recent first", the model composed
 * the list from the prompt and dropped the newest ones; here the filter and the order are exact (`sort:
 * 'recent'` orders by the document's date, documents/documentDate.js) and `limit` says how many, up to 50. The
 * prompt only carries the studied documents' cards, with no date, and adding one to every line of every message
 * would cost tokens on each turn for something this tool answers on demand.
 *
 * The search runs in the browser over the catalog the chat already holds (documents/searchArchive.js: folded
 * text, a score by where each word is found, no embeddings), so it costs nothing and needs no round trip.
 *
 * The activity rows say it in plain words ("Cerco nell'archivio", "3 file trovati"), never the query.
 */
import {
  DEFAULT_SEARCH_RESULTS,
  MAX_SEARCH_RESULTS,
  SEARCH_SORT,
  searchArchive
} from '@/features/documents/searchArchive';
import { documentDay } from '@/features/documents/documentDate';
import { DEFAULT_LISTING_FILES, clampListingLimit } from '@/features/documents/listingLimits';

export const SEARCH_ARCHIVE_TOOL_NAME = 'search_archive';

/**
 * The tool as the model sees it. `categories` is the admins' list: with it the `category` argument is an
 * enum, so the model picks a real name (a name it still gets wrong is answered with the list, see below).
 */
export function searchArchiveTool(categories = []) {
  return {
    functionDeclarations: [
      {
        name: SEARCH_ARCHIVE_TOOL_NAME,
        description:
          'Cerca fra tutti i documenti indicizzati — quelli di solo archivio (moduli, contratti, loghi, ' +
          "locandine…), che non sono nell'elenco dei documenti, e anche quelli studiati — per nome, " +
          `descrizione, parole chiave e categoria. Restituisce al massimo ${DEFAULT_SEARCH_RESULTS} file (fino a ` +
          `${MAX_SEARCH_RESULTS} con limit) con id, nome, descrizione, categorie, mode e data. Poi mostrali con ` +
          "offer_files, così l'operatore ha le anteprime e il pulsante per scaricarli (share_file solo se ne " +
          'corrisponde uno solo, chiaramente). ' +
          'È lo strumento per ogni elenco: per "che moduli ci sono per il mutuo?" o "le comunicazioni di ' +
          'Direzione" chiamalo con la categoria giusta (e, se serve, qualche parola) e mostra il risultato con ' +
          'offer_files e reason "listing" (è un elenco di file disponibili, non una proposta: anche con un solo ' +
          'file). Per "gli ultimi", "i più recenti", "dalla più recente" usa sort "recent", e con limit ' +
          "quanti ne servono: non comporre mai a mano un elenco dall'elenco dei documenti, perderesti i più " +
          'recenti. Non rispondere mai sul contenuto dei file con mode "archive": i risultati servono solo a ' +
          'trovarli e consegnarli.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Poche parole che dicono cosa si cerca, come "modulo privacy" o "logo WeUnit bianco". ' +
                'Stringa vuota se vuoi tutta una categoria (o, con sort "recent", tutti i documenti).'
            },
            category: {
              type: 'string',
              ...(categories.length ? { enum: categories } : {}),
              description: 'Facoltativa: restringe ai file di questa categoria.'
            },
            sort: {
              type: 'string',
              enum: Object.values(SEARCH_SORT),
              description:
                '"relevance" (default): i più pertinenti per primi. "recent": dal documento più recente, ' +
                'per "gli ultimi N", "i più recenti", "dalla più recente"; i documenti senza data vanno in fondo.'
            },
            limit: {
              type: 'integer',
              description:
                `Quanti file restituire. ${DEFAULT_LISTING_FILES} se l'operatore e le istruzioni ` +
                'dell\'amministratore non indicano un numero; altrimenti quel numero (es. "le ultime 20" → 20), ' +
                `al massimo ${MAX_SEARCH_RESULTS}. Se non lo indichi restituisce ${DEFAULT_SEARCH_RESULTS} file.`
            }
          },
          required: ['query']
        }
      }
    ]
  };
}

// said to the model with every non-empty result: a category browse must not end up as a "did you mean?" card
const LISTING_HINT =
  'If the operator asked what files exist (a category, a kind of file, the latest ones), show them with offer_files and reason "listing", all the ids in one call and in this order.';

const plural = n => (n === 1 ? '1 file trovato' : `${n} file trovati`);

/** What `limit` and `sort` of a call come to: a whole number from 1 to the cap (the default when it is not one), and a known order. */
const requestedLimit = value => clampListingLimit(value, DEFAULT_SEARCH_RESULTS);
const requestedSort = value => (value === SEARCH_SORT.recent ? SEARCH_SORT.recent : SEARCH_SORT.relevance);

/** One call to `search_archive`. Returns the `{response}` half of a functionResponse. */
export async function runSearchArchiveCall(
  call,
  { catalog, categories = [], round, index, onActivityStart, onActivityEnd }
) {
  const query = typeof call.args?.query === 'string' ? call.args.query : '';
  const category = typeof call.args?.category === 'string' ? call.args.category : '';
  const sort = requestedSort(call.args?.sort);
  const limit = requestedLimit(call.args?.limit);
  const activityId = `archive-${round}-${index}`;
  onActivityStart(activityId, { kind: 'archive', label: "Cerco nell'archivio" });

  // "the latest documents" needs neither words nor a category: it is the whole archive, newest first
  if (!query.trim() && !category.trim() && sort !== SEARCH_SORT.recent) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Nessuna ricerca' });
    return { response: { error: 'give some words to look for, a category, or both' } };
  }

  const { results, total, unknownCategory } = searchArchive(catalog, {
    query,
    category,
    categories,
    sort,
    limit
  });

  if (unknownCategory) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Categoria sconosciuta' });
    return {
      response: {
        error: `unknown category "${category}": use one of the list, or search by words only`,
        categories
      }
    };
  }

  onActivityEnd(activityId, {
    outcome: 'done',
    label: total === 0 ? 'Nessun file trovato' : plural(total)
  });
  return {
    response: {
      ok: true,
      total,
      shown: results.length,
      // the order asked for: with sort "recent", newest first (a file without a date has no `date` and comes last)
      sorted: sort,
      files: results.map(({ id, name, description, categories: own, mode, date }) => ({
        id,
        name,
        description,
        categories: own,
        mode,
        ...(documentDay(date) ? { date: documentDay(date) } : {})
      })),
      note:
        total === 0
          ? 'no file matches: say so in one line, do not invent an id. Try other words or a category before giving up.'
          : total > results.length
            ? `${total - results.length} more files match: say how many there are in all, and that the operator can ask for more (up to ${MAX_SEARCH_RESULTS}) or narrow by words or category. ${LISTING_HINT}`
            : `offer or deliver them (offer_files / share_file); a file with mode "archive" is never described or read, only delivered. ${LISTING_HINT}`
    }
  };
}
