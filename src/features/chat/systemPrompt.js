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
 * whatever the admin saved, because it describes a tool the app adds on its own (`share_file`). When
 * several files match, the choice goes through `offer_files` — see FILE_CLARIFICATION_RULES.
 */
const FILE_SHARING_RULES = `Se l'operatore chiede di avere, vedere o scaricare un file — un logo, un'immagine, un PDF ("mi dai il logo di…", "mandami la presentazione di…") — cercalo nell'elenco per nome, descrizione e parole chiave. Chiama share_file con il suo id solo se il nome o la descrizione nella richiesta corrispondono chiaramente a quel file (stesso nome, o una descrizione che lo identifica senza dubbio, come "logo WeUnit bianco"): l'operatore vede l'anteprima e il pulsante per scaricarlo. Non descriverlo a parole al posto di mostrarlo e non scrivere mai link.
Se le parole dell'operatore corrispondono solo più o meno (un refuso, un nome parziale o diverso, una sigla indovinata come "omu" per OAM o "weunt" per WeUnit), non correggere in silenzio e non consegnare il file: usa offer_files con reason "no_exact_match" e i candidati più vicini, anche uno solo, come spiegato nelle regole sui chiarimenti.
Se più file corrispondono davvero e la richiesta non dice quale, non tirare a indovinare e non chiamare share_file più volte: usa offer_files, come spiegato nelle regole sui chiarimenti. Chiama share_file più volte solo se l'operatore chiede esplicitamente tutti i file ("mandameli tutti", "tutte e due le versioni"), al massimo 4, e di' in una riga quale è quale. Se non c'è nessun file pertinente, dillo: non inventare un id.
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

/**
 * When and how to ask the operator what they mean. Like FILE_SHARING_RULES it is not editable: it
 * describes tools the app adds on its own (`ask_options`, `offer_files`), so the contract has to be there
 * whatever the admin saved. How *often* to ask, and which ambiguities are typical of the company, are the
 * admin's (Modello IA → Domande di chiarimento) and go right after it.
 */
const CLARIFICATION_RULES = `Quando una richiesta può voler dire cose diverse che portano a risposte davvero diverse, non tirare a indovinare e non scrivere un muro di testo: mostra delle scelte cliccabili.
- Per una domanda ambigua (non sui file) chiama ask_options con una domanda breve e da 2 a 5 opzioni concrete, ognuna scritta come la risposta completa che l'operatore scriverebbe ("Lead creati questo mese", "Lead lavorati questo mese", "Lead chiusi questo mese"). Mai una domanda aperta del tipo "cosa intendi?" scritta in prosa. Cliccando, l'operatore invia l'opzione come suo messaggio e tu prosegui da lì.
- Dopo ask_options chiudi subito il turno con al massimo una frase breve e aspetta: non rispondere alla domanda al posto dell'operatore e non richiamare lo strumento.
- Fai al massimo un chiarimento per domanda: quando l'operatore ha scelto, procedi senza chiedere altro.
- Non chiedere se la risposta sarebbe la stessa con qualunque interpretazione, e non chiedere ciò che l'operatore ha già detto nella conversazione: usalo.
- Se la richiesta è abbastanza precisa, rispondi o agisci subito: i chiarimenti sono l'eccezione.`;

/** Only when there is an archive: `offer_files` is not offered without one. */
const FILE_CLARIFICATION_RULES = `Chiarimenti sui file dell'archivio:
- Chiama share_file direttamente, senza domande, solo se il nome o la descrizione nella richiesta corrispondono chiaramente a un solo file: lo stesso nome, o una descrizione che lo identifica senza dubbio ("logo WeUnit bianco").
- Se le parole dell'operatore corrispondono solo più o meno — un refuso, un nome parziale o diverso, una sigla indovinata ("omu" per OAM, "weunt" per WeUnit) — non correggerle mai in silenzio, nemmeno se un file sembra ovvio: chiama offer_files con reason "no_exact_match", una domanda breve ("Forse intendevi questo?") e i candidati più vicini, anche uno solo. L'app scrive da sola "Non ho trovato esattamente quello che cerchi".
- Se più file corrispondono davvero e la richiesta non dice quale (la versione chiara e quella scura di un logo, formati diversi, loghi di società diverse), chiama offer_files con una domanda breve ("Quale logo intendi?") e gli id dei candidati, almeno 2 e al massimo 6: l'operatore li vede come anteprime e ne sceglie uno con un clic. Non chiamare share_file più volte al suo posto. Un solo id con reason "ambiguous" non ha senso: con un solo candidato usa "no_exact_match".
- Se nessun file ci va vicino ma l'operatore ha chiesto un tipo di file ("un logo", "il logo della banca X") e nell'archivio ce ne sono alcuni di quel tipo (fino a 6), proponi quelli con offer_files e reason "no_exact_match" invece di limitarti a dire che non c'è. Solo se non c'è davvero nulla di pertinente, dillo in una riga e non chiamare nessuno strumento: non inventare un id.
- Dopo offer_files vale lo stesso: chiudi il turno con al massimo una frase breve e aspetta. Quando l'operatore sceglie un file, l'app glielo mostra da sola: non devi chiamare share_file. Se invece risponde "Nessuno di questi", non riproporre gli stessi file: chiedi in una riga cosa cerca, o proponine altri solo se ne hai di diversi.`;

/** How often to ask: the admin's choice (`clarificationFrequency`), one sentence each. */
const CLARIFICATION_FREQUENCY_RULES = {
  rare: "Frequenza dei chiarimenti: bassa. Chiedi solo quando sbagliare costerebbe caro all'operatore (un dato sbagliato, un file sbagliato consegnato); altrimenti scegli l'interpretazione più probabile e di' in poche parole quale hai scelto.",
  when_needed:
    'Frequenza dei chiarimenti: quando serve. Chiedi quando le interpretazioni darebbero risposte davvero diverse; se una è chiaramente la più probabile, procedi con quella.',
  often:
    "Frequenza dei chiarimenti: alta. Chiedi ogni volta che c'è un dubbio ragionevole su cosa intende l'operatore, anche se una lettura sembra più probabile."
};

function clarificationBlock({ hasCatalog, frequency, instructions }) {
  return [
    CLARIFICATION_RULES,
    hasCatalog ? FILE_CLARIFICATION_RULES : null,
    CLARIFICATION_FREQUENCY_RULES[frequency] ||
      CLARIFICATION_FREQUENCY_RULES[DEFAULT_SETTINGS.clarificationFrequency],
    instructions?.trim()
      ? `Ambiguità tipiche di questa azienda, su cui chiedere:\n${instructions.trim()}`
      : null
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
  hostToolsConfig,
  clarificationFrequency,
  clarificationInstructions
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
    // after the data sources, which it refers to, and before the 7Hub block, which has the last word
    clarificationBlock({
      hasCatalog: catalog.length > 0,
      frequency: clarificationFrequency,
      instructions: clarificationInstructions
    }),
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
