/**
 * `search_archive` tool: finds files among the archive documents (`mode: 'archive'`), which are not in the
 * system prompt. The model gives some words and, if it knows which, a category; it gets back up to 10 files
 * (id, name, description, categories) and then hands them over with `offer_files` (several candidates, or a
 * listing like "che moduli ci sono per il mutuo?", which is `reason: 'listing'`) or `share_file` (one clear
 * match). Those two accept the
 * ids found here: they validate against the whole catalog, archive files included.
 *
 * The search runs in the browser over the catalog the chat already holds (documents/searchArchive.js: folded
 * text, a score by where each word is found, no embeddings), so it costs nothing and needs no round trip.
 * Only archive files are searched: the studied ones are already in the system prompt, with their ids, and
 * `share_file` takes them straight from there.
 *
 * The activity rows say it in plain words ("Cerco nell'archivio", "3 file trovati"), never the query.
 */
import { MAX_SEARCH_RESULTS, searchArchive } from '@/features/documents/searchArchive';

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
          "Cerca fra i file di solo archivio (moduli, contratti, loghi, locandine…), che non sono nell'elenco dei " +
          'documenti: per nome, descrizione, parole chiave e categoria. Restituisce al massimo 10 file con id, ' +
          "nome, descrizione e categorie. Poi mostrali con offer_files, così l'operatore ha le anteprime e il " +
          'pulsante per scaricarli (share_file solo se ne corrisponde uno solo, chiaramente). ' +
          'Per una domanda come "che moduli ci sono per il mutuo?" chiama questo strumento con la categoria ' +
          'giusta (e, se serve, qualche parola) e mostra il risultato con offer_files e reason "listing" ' +
          '(è un elenco di file disponibili, non una proposta: anche con un solo file). Non rispondere mai sul ' +
          'contenuto di questi file: i risultati servono solo a trovarli e consegnarli.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Poche parole che dicono cosa si cerca, come "modulo privacy" o "logo WeUnit bianco". ' +
                'Stringa vuota se vuoi tutta una categoria.'
            },
            category: {
              type: 'string',
              ...(categories.length ? { enum: categories } : {}),
              description: 'Facoltativa: restringe ai file di questa categoria.'
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
  'If the operator asked what files exist (a category, a kind of file), show them with offer_files and reason "listing".';

const plural = n => (n === 1 ? '1 file trovato' : `${n} file trovati`);

/** One call to `search_archive`. Returns the `{response}` half of a functionResponse. */
export async function runSearchArchiveCall(
  call,
  { catalog, categories = [], round, index, onActivityStart, onActivityEnd }
) {
  const query = typeof call.args?.query === 'string' ? call.args.query : '';
  const category = typeof call.args?.category === 'string' ? call.args.category : '';
  const activityId = `archive-${round}-${index}`;
  onActivityStart(activityId, { kind: 'archive', label: "Cerco nell'archivio" });

  if (!query.trim() && !category.trim()) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Nessuna ricerca' });
    return { response: { error: 'give some words to look for, a category, or both' } };
  }

  const { results, total, unknownCategory } = searchArchive(catalog, {
    query,
    category,
    categories,
    limit: MAX_SEARCH_RESULTS
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
      files: results.map(({ id, name, description, categories: own }) => ({
        id,
        name,
        description,
        categories: own
      })),
      note:
        total === 0
          ? 'no archive file matches: say so in one line, do not invent an id. Try other words or a category before giving up.'
          : total > results.length
            ? `${total - results.length} more files match: say how many, and suggest narrowing by words or category. ${LISTING_HINT}`
            : `these are archive files: offer or deliver them (offer_files / share_file), never describe their content. ${LISTING_HINT}`
    }
  };
}
