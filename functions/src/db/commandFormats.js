/**
 * The formats of the "commands without AI" (settings.noAiCommands, Configurazione → Database): how the
 * rows of a command's fixed query become its answer. The answer itself is written in the browser
 * (`src/features/chat/commands/formats.js` has the matching registry: keep the two lists of formats in
 * step); what lives here is what the server must know about each format:
 *
 *   - `columns`: the column contract. The query must return all of them, under these names, or the
 *     command fails and names the missing ones (empty = no contract, any columns will do);
 *   - `defaultSql`: the query a command of that format runs when its own SQL is empty ('' = none: a
 *     command of that format cannot run without SQL).
 *
 * To add a format: an entry here, an entry in the browser registry, and nothing else: the endpoint
 * (`command` action in `http/databaseEndpoint.js`) reads the contract from this table.
 */

/** The default query of the `erogato` format. Column names are the contract with its composer: see EROGATO_COLUMNS. */
export const EROGATO_SQL = `SELECT DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS oggi, prodotto, cur, YEAR(d) AS anno, MONTH(d) AS mese,
  COALESCE(banca, '(non indicata)') AS banca, COALESCE(nome_dt, '(non indicato)') AS dt, fuori_sistema,
  COUNT(*) AS pratiche, ROUND(SUM(importo), 2) AS erogato, ROUND(SUM(COALESCE(importo_mediazione, 0)), 2) AS mediazione,
  SUM(da_stato) AS con_data_da_cambio_stato
FROM (SELECT prodotto, importo, importo_mediazione, banca, nome_dt, 'NO' AS fuori_sistema,
        COALESCE(data_liquidazione, data_passaggio_perfezionamento) AS d,
        COALESCE(data_liquidazione, data_passaggio_perfezionamento) >= MAKEDATE(YEAR(CURRENT_DATE), 1) AS cur,
        data_liquidazione IS NULL AS da_stato
      FROM ai_pratiche
      WHERE liquidata = 'SI'
        AND (COALESCE(data_liquidazione, data_passaggio_perfezionamento) BETWEEN MAKEDATE(YEAR(CURRENT_DATE), 1) AND CURRENT_DATE
          OR COALESCE(data_liquidazione, data_passaggio_perfezionamento)
             BETWEEN MAKEDATE(YEAR(CURRENT_DATE), 1) - INTERVAL 1 YEAR AND CURRENT_DATE - INTERVAL 1 YEAR)
      UNION ALL
      SELECT prodotto, importo, importo_mediazione, banca, nome_dt, fuori_sistema, data_liquidazione,
        data_liquidazione >= MAKEDATE(YEAR(CURRENT_DATE), 1), 0
      FROM ai_erogato_extra
      WHERE (data_liquidazione BETWEEN MAKEDATE(YEAR(CURRENT_DATE), 1) AND CURRENT_DATE
         OR data_liquidazione BETWEEN MAKEDATE(YEAR(CURRENT_DATE), 1) - INTERVAL 1 YEAR AND CURRENT_DATE - INTERVAL 1 YEAR)) e
GROUP BY prodotto, cur, YEAR(d), MONTH(d), COALESCE(banca, '(non indicata)'), COALESCE(nome_dt, '(non indicato)'), fuori_sistema`;

/** What `componiErogato` reads from every row. A query of the `erogato` format must return all of them, under these names. */
export const EROGATO_COLUMNS = [
  'oggi',
  'prodotto',
  'cur',
  'anno',
  'mese',
  'banca',
  'dt',
  'fuori_sistema',
  'pratiche',
  'erogato',
  'mediazione',
  'con_data_da_cambio_stato'
];

export const COMMAND_FORMATS = {
  erogato: { columns: EROGATO_COLUMNS, defaultSql: EROGATO_SQL },
  // a plain table of the rows: it reads whatever columns the query has
  table: { columns: [], defaultSql: '' }
};

/** `Object.hasOwn`, not `in`: a format read from the settings is a string of the admin's, e.g. "constructor". */
export const isKnownFormat = format => typeof format === 'string' && Object.hasOwn(COMMAND_FORMATS, format);

/** The columns of the format's contract that `columns` (what the query returned) lacks. */
export const missingColumns = (format, columns) =>
  (COMMAND_FORMATS[format]?.columns ?? []).filter(name => !columns.includes(name));

/**
 * Ready-made commands the admin can start from ("Aggiungi comando → Da modello"): what the browser copies
 * into a new command. The SQL is copied, not linked: a command made from a preset is the admin's own.
 */
export const COMMAND_PRESETS = [
  {
    format: 'erogato',
    name: 'Erogato',
    triggers: ['erogato'],
    sql: EROGATO_SQL,
    errorMessage: "Non sono riuscito a leggere l'erogato in questo momento, riprova tra poco."
  }
];
