import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { isImage } from '@/features/documents/fileTypes';
import { attachmentsBlock } from '@/shared/promptAttachments';
import { disabledHostTools } from './tools/hostTools';

/**
 * One table, name and card only — never its columns. Column types, keys and descriptions are real
 * weight (dozens of tables × dozens of columns adds up on every single message) and most questions
 * only touch one or two tables, so they are fetched on demand with `describe_table`
 * (`tools/describeTable.js`) instead of carried on every round, the same way `read_document` keeps
 * full document text out of the catalog until the model actually needs it.
 */
function tableBlock(table) {
  const kind = table.kind === 'view' ? '[vista] ' : '';
  const summary = table.card?.summary ? ` — ${table.card.summary}` : '';
  const rows = table.approxRows != null ? ` Circa ${table.approxRows} righe.` : '';
  return `  - [id: ${table.id}] ${kind}${table.name}${summary}${rows}`;
}

/**
 * Enabled database connections and their enabled tables, so the model can write `query_database`
 * calls. Each of the two instruction fields here can carry its own attached files
 * (`PromptAttachments.jsx`), independent of the other prompt fields' attachments.
 */
function schemaBlock(
  schema,
  databaseInstructions,
  databaseSelection,
  databaseAttachments,
  databaseSelectionAttachments
) {
  if (!schema?.length) return null;
  const connections = schema
    .map(
      ({ connectionId, label, database, tables }) =>
        `Connessione [id: ${connectionId}] "${label}" (database ${database}):\n` +
        tables.map(tableBlock).join('\n')
    )
    .join('\n\n');
  return [
    databaseInstructions || DEFAULT_SETTINGS.databaseInstructions,
    attachmentsBlock(databaseAttachments),
    'Database disponibili:',
    connections,
    databaseSelection || DEFAULT_SETTINGS.databaseSelectionInstructions,
    attachmentsBlock(databaseSelectionAttachments)
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * How to hand over a file. Here and not in the admin's editable selection text: it has to be there
 * whatever the admin saved, because it describes a tool the app adds on its own (`share_file`).
 */
const FILE_SHARING_RULES = `Se l'operatore chiede di avere, vedere o scaricare un file — un logo, un'immagine, un PDF ("mi dai il logo di…", "mandami la presentazione di…") — cercalo nell'elenco per nome, descrizione e parole chiave e chiama share_file con il suo id: l'operatore vede l'anteprima e il pulsante per scaricarlo. Non descriverlo a parole al posto di mostrarlo e non scrivere mai link.
Se più file corrispondono davvero (ad esempio la versione chiara e quella scura dello stesso logo, o formati diversi) mostrali tutti, uno share_file ciascuno e al massimo 4, e di' in una riga quale è quale. Se i candidati sono molti o la richiesta è ambigua, chiedi quale vuole invece di tirare a indovinare. Se nessun file corrisponde, dillo: non inventare un id.
Le voci marcate [immagine] sono immagini: la loro descrizione è scritta dall'operatore e fa fede su cosa raffigurano. read_document serve a guardare il contenuto di un file per rispondere, non a consegnarlo.`;

/** Indexed documents, one line each, so the model can decide what to open. */
function catalogBlock(catalog, documentSelection, documentSelectionAttachments) {
  if (!catalog.length) return "Archivio documentale: per ora non c'e' ancora nessun documento indicizzato.";
  const lines = catalog
    .map(entry => {
      // banks and products come first: they are what tells two otherwise similar documents apart
      const banks = entry.banks?.length ? ` Istituti: ${entry.banks.join(', ')}.` : '';
      const products = entry.products?.length ? ` Prodotti: ${entry.products.join(', ')}.` : '';
      const topics = entry.topics?.length ? ` Argomenti: ${entry.topics.join(', ')}.` : '';
      const keywords = entry.keywords?.length ? ` Parole chiave: ${entry.keywords.join(', ')}.` : '';
      const kind = isImage(entry.mimeType) ? ' [immagine]' : '';
      // written by the operator: stated before the card, which Gemini wrote from the file itself
      const description = entry.description ? `Descrizione dell'operatore: «${entry.description}». ` : '';
      return `- [id: ${entry.id}] ${entry.name}${kind} — ${description}${entry.summary}${banks}${products}${topics}${keywords}`;
    })
    .join('\n');
  return [
    `Archivio documentale: ${catalog.length} documenti indicizzati.`,
    lines,
    documentSelection || DEFAULT_SETTINGS.documentSelectionInstructions,
    FILE_SHARING_RULES,
    attachmentsBlock(documentSelectionAttachments)
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** What the host told us about the operator and the current page, as one sentence. */
function contextLine(context) {
  if (!context) return null;
  const parts = [];
  const name = context.user?.name;
  const email = context.user?.email;
  if (name) parts.push(`Stai parlando con ${name}${email ? ` (${email})` : ''}.`);
  else if (email) parts.push(`Stai parlando con ${email}.`);
  if (context.page) {
    parts.push(
      `In questo momento e' sulla pagina ${context.pageTitle ? `«${context.pageTitle}» (${context.page})` : context.page} del gestionale.`
    );
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * Embedded in 7Hub with its tools: this replaces the "you cannot read customers" limit of the defaults.
 * The text is the admin's (Impostazioni → 7Hub); left empty, the default applies — without it the 7Hub tools
 * would compete with the database and the general instructions.
 */
function hostToolsBlock(context, text, config) {
  const tools = Array.isArray(context?.tools) ? context.tools : [];
  if (!tools.length) return null;
  const rules = text?.trim() ? text : DEFAULT_SETTINGS.hostToolsInstructions;
  // switched off in Impostazioni → 7Hub: the rules may still name them
  const off = disabledHostTools(config);
  return off.length
    ? `${rules}\n- Questi strumenti sono disattivati dall'amministratore: non usarli e non dire che puoi farlo: ${off.join(', ')}.`
    : rules;
}

export function buildSystemInstruction({
  instructions,
  instructionsAttachments,
  context,
  catalog,
  documentSelection,
  documentSelectionAttachments,
  schema,
  databaseInstructions,
  databaseSelection,
  databaseAttachments,
  databaseSelectionAttachments,
  hostToolsInstructions,
  hostToolsAttachments,
  hostToolsConfig
}) {
  return [
    instructions,
    attachmentsBlock(instructionsAttachments),
    contextLine(context),
    catalogBlock(catalog, documentSelection, documentSelectionAttachments),
    schemaBlock(
      schema,
      databaseInstructions,
      databaseSelection,
      databaseAttachments,
      databaseSelectionAttachments
    ),
    // last, so it wins over earlier text: embedded in 7Hub, records are handled with the 7Hub tools
    hostToolsBlock(context, hostToolsInstructions, hostToolsConfig),
    context?.tools?.length ? attachmentsBlock(hostToolsAttachments) : null
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Past conversation in the model's format. Activity rows are UI only and never sent.
 *
 * Gemini refuses a history that opens on a model turn ("First Content should be with role 'user'"),
 * and keeping only the last N messages lands on a reply every other time — so the chat broke once a
 * conversation grew past the limit. Leading replies are dropped: losing one for context beats the
 * whole request failing.
 */
export function toModelHistory(messages = []) {
  const history = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.text?.trim() && !m.unanswered)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  const firstUser = history.findIndex(entry => entry.role === 'user');
  return firstUser === -1 ? [] : history.slice(firstUser);
}
