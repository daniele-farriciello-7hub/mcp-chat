/**
 * The formats of the commands without AI, browser side: how the rows of a command's query become the
 * markdown of the answer. The server has the matching list (`COMMAND_FORMATS` in
 * functions/src/db/commandFormats.js), which holds the column contract and the default query of each format:
 * keep the two lists of formats in step.
 *
 * An entry: `label` and `summary` (what the admin reads in the panel), `hasDefaultSql` (a command of this
 * format may leave its SQL empty: the server runs the format's own query) and `compose({ rows, columns,
 * command })`, which returns the markdown. Pure and dependency-free (the composers are), so it loads in
 * plain node (functions/scripts/chat-commands.test.mjs).
 *
 * To add a format: an entry here, one in the server's list, and a composer next to `erogato.js`.
 */
import { componiErogato } from './erogato.js';
import { componiTabella } from './tabella.js';

export const COMMAND_FORMATS = {
  erogato: {
    label: 'Erogato',
    summary:
      'Il resoconto dell’erogato: mese e anno per prodotto con il confronto sull’anno prima, andamento mensile, direttori territoriali e prime banche. La query deve restituire le colonne del modello.',
    hasDefaultSql: true,
    compose: ({ rows }) => componiErogato(rows)
  },
  table: {
    label: 'Tabella',
    summary:
      'Le righe della query in una tabella, con i numeri all’italiana. Va bene qualsiasi colonna; se ne mostrano le prime 50.',
    hasDefaultSql: false,
    compose: ({ rows, columns, command }) =>
      componiTabella(rows, { columns, title: command?.title ?? '', intro: command?.intro ?? '' })
  }
};

/** `Object.hasOwn`, not `in`: a format comes from the settings, and "constructor" is not one. */
export const isKnownFormat = format => typeof format === 'string' && Object.hasOwn(COMMAND_FORMATS, format);

/** The formats in the order the panel lists them: [{ id, label, summary }]. */
export const FORMAT_LIST = Object.entries(COMMAND_FORMATS).map(([id, { label, summary }]) => ({
  id,
  label,
  summary
}));
