/**
 * 7Hub tools: what the assistant can do inside the gestionale when it runs embedded in it.
 * They are executed by the host page (7hub-ai-poc, components/ai-assistant/host-tools.ts) through the
 * postMessage bridge (shared/embed/hostBridge.js): same session, login and visibility rules as the
 * operator's own screens. The model never gets a token and cannot reach records the operator could not
 * open by hand. Offered only when the host announces them in its context (`context.tools`).
 */
import { callHostTool } from '@/shared/embed/hostBridge';

export const HOST_TOOL_NAMES = {
  context: 'get_7hub_context',
  search: 'search_7hub_records',
  openPage: 'open_7hub_page',
  openRecord: 'open_7hub_record',
  openSection: 'open_7hub_section',
  readPage: 'read_7hub_page',
  filterList: 'filter_7hub_list',
  readSection: 'read_7hub_section',
  readLogs: 'read_7hub_logs',
  readNotes: 'read_7hub_notes'
};

// model-facing name → the host's tool (logs and notes are the host's read_section with a fixed section)
const FIXED_ARGS = {
  [HOST_TOOL_NAMES.readLogs]: { section: 'logs' },
  [HOST_TOOL_NAMES.readNotes]: { section: 'note' }
};
const TO_HOST = {
  [HOST_TOOL_NAMES.readSection]: 'read_section',
  [HOST_TOOL_NAMES.readLogs]: 'read_section',
  [HOST_TOOL_NAMES.readNotes]: 'read_section',
  [HOST_TOOL_NAMES.context]: 'get_context',
  [HOST_TOOL_NAMES.search]: 'search_records',
  [HOST_TOOL_NAMES.openPage]: 'open_page',
  [HOST_TOOL_NAMES.openRecord]: 'open_record',
  [HOST_TOOL_NAMES.openSection]: 'open_section',
  [HOST_TOOL_NAMES.readPage]: 'read_page',
  [HOST_TOOL_NAMES.filterList]: 'filter_list'
};

const DECLARATIONS = {
  get_context: {
    name: HOST_TOOL_NAMES.context,
    description:
      "Dice su quale pagina del gestionale 7Hub si trova l'operatore e, se sta guardando un cliente, un lead o " +
      'una pratica, quale. Usalo quando la domanda dipende da "qui", "questa pratica", "questo cliente".',
    parameters: { type: 'object', properties: {} }
  },
  search_records: {
    name: HOST_TOOL_NAMES.search,
    description:
      'Cerca in 7Hub clienti, lead e pratiche (mutuo, CQS, prestiti, Instant Rating) per nome, cognome, codice ' +
      'fiscale, email, telefono o numero. Vede solo quello che l’operatore può vedere. Ogni risultato ha un `ref` ' +
      'da usare con open_7hub_record e `can_open` (falso se l’operatore non ha i permessi).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Testo da cercare, ad esempio "Rossi", "RSSMRA80A01H501U" o "5492".'
        }
      },
      required: ['query']
    }
  },
  open_page: {
    name: HOST_TOOL_NAMES.openPage,
    description:
      'Apre una sezione del gestionale 7Hub per l\'operatore (ad esempio "elenco lead", "pratiche CQS", ' +
      '"provvigioni"). Se più pagine corrispondono restituisce i suggerimenti: chiedi all’operatore quale vuole.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nome della sezione, come lo direbbe l’operatore.' }
      },
      required: ['query']
    }
  },
  open_record: {
    name: HOST_TOOL_NAMES.openRecord,
    description:
      'Apre in 7Hub la scheda di un cliente, un lead o una pratica trovati con search_7hub_records (usa il loro ' +
      '`ref`). In alternativa accetta un numero esatto (`id`) con il `type` (Lead, Mutuo, CQS, Prestito…): 7Hub lo ' +
      'verifica e lo apre solo se l’operatore può vederlo. Non inventare ref o numeri.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Il ref di un risultato di search_7hub_records.' },
        id: { type: 'string', description: 'Numero esatto del record, se l’operatore l’ha dato.' },
        type: {
          type: 'string',
          description: 'Tipo del record quando si usa id: Lead, Mutuo, CQS, Prestito, Cliente.'
        }
      }
    }
  },
  open_section: {
    name: HOST_TOOL_NAMES.openSection,
    description:
      'Apre una sezione (scheda/tab) della pagina 7Hub: Documenti, Logs, Provvigioni, Note, Dati aggiuntivi, ' +
      'Richieste deroga, Polizze, Overview… Se passi `ref` (da search_7hub_records) o `id`+`type`, prima apre quel ' +
      'record e poi la sezione. Se la sezione non esiste restituisce quelle disponibili.',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Nome della sezione, ad esempio "documenti" o "provvigioni".'
        },
        ref: {
          type: 'string',
          description: 'Facoltativo: il ref di un risultato di search_7hub_records da aprire prima.'
        },
        id: { type: 'string', description: 'Facoltativo: numero esatto del record da aprire prima.' },
        type: { type: 'string', description: 'Tipo del record quando si usa id.' }
      },
      required: ['section']
    }
  },
  read_page: {
    name: HOST_TOOL_NAMES.readPage,
    description:
      "Legge quello che l'operatore vede ora nella pagina 7Hub (titolo, sezioni, testo visibile: stato, importi, " +
      'documenti, eventi…), eventualmente dopo aver aperto una sezione. Usalo per rispondere su "questa pratica" o ' +
      '"questo cliente" senza inventare: riporta solo quello che c\'è.',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Facoltativo: sezione da aprire prima di leggere, ad esempio "documenti".'
        }
      }
    }
  },
  filter_list: {
    name: HOST_TOOL_NAMES.filterList,
    description:
      'Scrive una ricerca nel campo "Cerca" dell\'elenco aperto in 7Hub (lead, pratiche, clienti…) e restituisce le ' +
      'prime righe. Apri prima l’elenco giusto con open_7hub_page. Una stringa vuota toglie il filtro.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Testo da cercare nell’elenco, ad esempio un cognome.' }
      },
      required: ['query']
    }
  },
  // the host's read_section, offered three ways so the model picks the obvious one for "log" and "note"
  read_section: [
    {
      name: HOST_TOOL_NAMES.readLogs,
      description:
        'Legge i log (storico delle attività, cambi di stato, chi ha fatto cosa e quando) della pratica o del lead ' +
        'aperto in 7Hub, o di quello indicato con `ref`/`id`. Restituisce le righe come tabella (data, azione, utente…).',
      parameters: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Facoltativo: il ref di un risultato di search_7hub_records da aprire prima.'
          },
          id: { type: 'string', description: 'Facoltativo: numero esatto del record da aprire prima.' },
          type: { type: 'string', description: 'Tipo del record quando si usa id.' }
        }
      }
    },
    {
      name: HOST_TOOL_NAMES.readNotes,
      description:
        'Legge le note della pratica o del lead aperto in 7Hub (o di quello indicato con `ref`/`id`): tipo, testo, ' +
        'stato, data e autore di ogni nota.',
      parameters: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Facoltativo: il ref di un risultato di search_7hub_records da aprire prima.'
          },
          id: { type: 'string', description: 'Facoltativo: numero esatto del record da aprire prima.' },
          type: { type: 'string', description: 'Tipo del record quando si usa id.' }
        }
      }
    },
    {
      name: HOST_TOOL_NAMES.readSection,
      description:
        'Apre e legge come tabella una sezione della scheda aperta in 7Hub: Documenti, Provvigioni, Passaggi stato, ' +
        'Task collegati, Mail, Sms, Filiale, Dati aggiuntivi… Per log e note usa read_7hub_logs / read_7hub_notes.',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', description: 'Nome della sezione, ad esempio "task collegati".' },
          ref: {
            type: 'string',
            description: 'Facoltativo: il ref di un risultato di search_7hub_records da aprire prima.'
          },
          id: { type: 'string', description: 'Facoltativo: numero esatto del record da aprire prima.' },
          type: { type: 'string', description: 'Tipo del record quando si usa id.' }
        },
        required: ['section']
      }
    }
  ]
};

// For the admin's 7Hub tab only (never sent to the model): what each tool is in plain words, what 7Hub actually
// does and which APIs it calls. Keep in sync with 7hub-ai-poc components/ai-assistant/host-tools.ts.
const PAGE_APIS = 'Quelle della pagina aperta (le stesse di quando la apri tu)';
const HOST_TOOL_INFO = {
  [HOST_TOOL_NAMES.context]: {
    label: 'Dove si trova l’operatore',
    how: 'Legge l’indirizzo della pagina aperta e la voce di menu corrispondente.',
    apis: []
  },
  [HOST_TOOL_NAMES.search]: {
    label: 'Cerca clienti, lead e pratiche',
    how: 'Fa la stessa ricerca della barra in alto di 7Hub, poi controlla per ogni risultato se l’operatore può aprirlo.',
    apis: [
      'POST janagrafica · j/api/v1/home/search',
      'POST menu_default · api/v1/BAN/utenti/{id}/user-product-visibility/check (una per risultato non suo)'
    ]
  },
  [HOST_TOOL_NAMES.openPage]: {
    label: 'Apri una pagina del menu',
    how: 'Cerca la voce nel menu dell’operatore, già caricato all’accesso, e la apre. Se più voci corrispondono propone le opzioni.',
    apis: [PAGE_APIS]
  },
  [HOST_TOOL_NAMES.openRecord]: {
    label: 'Apri una scheda',
    how: 'Apre il cliente, il lead o la pratica trovati con la ricerca. Con un numero esatto lo verifica prima con la stessa ricerca.',
    apis: ['POST janagrafica · j/api/v1/home/search (solo con un numero esatto)', PAGE_APIS]
  },
  [HOST_TOOL_NAMES.openSection]: {
    label: 'Apri una sezione della scheda',
    how: 'Clicca il tab richiesto (Documenti, Logs, Provvigioni…) nella scheda aperta.',
    apis: [PAGE_APIS]
  },
  [HOST_TOOL_NAMES.readPage]: {
    label: 'Leggi la pagina',
    how: 'Legge il testo visibile della pagina, fino a 4000 caratteri.',
    apis: []
  },
  [HOST_TOOL_NAMES.filterList]: {
    label: 'Filtra un elenco',
    how: 'Scrive nel campo «Cerca» dell’elenco aperto e legge le prime 5 righe.',
    apis: [PAGE_APIS]
  },
  [HOST_TOOL_NAMES.readSection]: {
    label: 'Leggi una sezione della scheda',
    how: 'Apre il tab, espande i riquadri chiusi e legge le tabelle (fino a 30 righe ciascuna).',
    apis: [PAGE_APIS]
  },
  [HOST_TOOL_NAMES.readLogs]: {
    label: 'Leggi i log',
    how: 'Come «Leggi una sezione», sul tab Logs della pratica o del lead.',
    apis: [PAGE_APIS]
  },
  [HOST_TOOL_NAMES.readNotes]: {
    label: 'Leggi le note',
    how: 'Come «Leggi una sezione», sul tab Note della pratica o del lead.',
    apis: [PAGE_APIS]
  }
};

/** The 7Hub tools for the admin's 7Hub tab: the model's name and description, plus what they do in practice. */
export const HOST_TOOL_CATALOG = Object.values(DECLARATIONS)
  .flat()
  .map(({ name, description }) => ({ name, description, hostFunction: TO_HOST[name], ...HOST_TOOL_INFO[name] }));

/**
 * Declarations for the tools this host actually offers, as the admin set them (Impostazioni → 7Hub): a tool
 * switched off is not offered at all, a description written there replaces the default one. Names and
 * parameters never change: they must match what 7Hub runs.
 */
export function hostToolDeclarations(context, config = {}) {
  const offered = Array.isArray(context?.tools) ? context.tools : [];
  return offered
    .flatMap(name => DECLARATIONS[name] || [])
    .filter(d => config?.[d.name]?.enabled !== false)
    .map(d => (config?.[d.name]?.description?.trim() ? { ...d, description: config[d.name].description.trim() } : d));
}

/** Tools the admin switched off, so the rules can say not to look for them. */
export const disabledHostTools = (config = {}) =>
  Object.keys(config || {}).filter(name => config[name]?.enabled === false);

const LABELS = {
  [HOST_TOOL_NAMES.context]: { running: 'Guardo dove sei in 7Hub', done: 'Visto dove sei in 7Hub' },
  [HOST_TOOL_NAMES.search]: { running: 'Cerco in 7Hub', done: 'Cercato in 7Hub' },
  [HOST_TOOL_NAMES.openPage]: { running: 'Apro la pagina', done: 'Pagina aperta' },
  [HOST_TOOL_NAMES.openRecord]: { running: 'Apro la scheda', done: 'Scheda aperta' },
  [HOST_TOOL_NAMES.openSection]: { running: 'Apro la sezione', done: 'Sezione aperta' },
  [HOST_TOOL_NAMES.readPage]: { running: 'Leggo la pagina', done: 'Letta la pagina' },
  [HOST_TOOL_NAMES.filterList]: { running: 'Filtro l’elenco', done: 'Elenco filtrato' },
  [HOST_TOOL_NAMES.readSection]: { running: 'Leggo la sezione', done: 'Letta la sezione' },
  [HOST_TOOL_NAMES.readLogs]: { running: 'Leggo i log', done: 'Letti i log' },
  [HOST_TOOL_NAMES.readNotes]: { running: 'Leggo le note', done: 'Lette le note' }
};

/**
 * Choices the operator can click straight away (several records found, several pages match): shown as a
 * card under the activity, each opening its target through the bridge — no round trip through the model.
 */
function optionsFor(name, result) {
  const records = result?.results || result?.options;
  if (Array.isArray(records) && records.length) {
    return records.slice(0, 6).map(r => ({
      key: r.ref,
      badge: r.type,
      title: r.name,
      detail: [r.detail, r.owner].filter(Boolean).join(' · '),
      disabled: r.can_open === false,
      action: { tool: 'open_record', args: { ref: r.ref } }
    }));
  }
  if (Array.isArray(result?.suggestions) && result.suggestions.length) {
    return result.suggestions.slice(0, 6).map(p => ({
      key: p.path,
      badge: 'Pagina',
      title: p.title,
      detail: p.section,
      action: { tool: 'open_page', args: { path: p.path } }
    }));
  }
  return undefined;
}

function doneLabel(name, result) {
  if (name === HOST_TOOL_NAMES.search) {
    const n = result?.count ?? 0;
    return n
      ? `Trovati ${n} risultati in 7Hub per «${result.query}»`
      : `Nessun risultato in 7Hub per «${result?.query}»`;
  }
  if ((name === HOST_TOOL_NAMES.openPage || name === HOST_TOOL_NAMES.openRecord) && result?.opened) {
    return `Ho aperto «${result.opened}»`;
  }
  if (name === HOST_TOOL_NAMES.openSection && result?.opened)
    return `Ho aperto la sezione «${result.opened}»`;
  if (name === HOST_TOOL_NAMES.filterList && result?.filtered) {
    return result.query ? `Ho filtrato l’elenco per «${result.query}»` : 'Ho tolto il filtro dall’elenco';
  }
  if (
    [HOST_TOOL_NAMES.readSection, HOST_TOOL_NAMES.readLogs, HOST_TOOL_NAMES.readNotes].includes(name) &&
    result?.section
  ) {
    return `Letta la sezione «${result.section}»`;
  }
  if (name === HOST_TOOL_NAMES.openPage || name === HOST_TOOL_NAMES.openRecord) return 'Da scegliere';
  return LABELS[name]?.done || 'Fatto';
}

/** One call to a 7Hub tool. Returns the `{response}` half of a functionResponse. */
export async function runHostToolCall(call, { round, index, onActivityStart, onActivityEnd }) {
  const activityId = `host-${round}-${index}`;
  onActivityStart(activityId, { kind: 'app', label: LABELS[call.name]?.running || 'Lavoro in 7Hub' });
  try {
    const result = await callHostTool(TO_HOST[call.name], {
      ...(call.args || {}),
      ...(FIXED_ARGS[call.name] || {})
    });
    // `opened`: a page or record was opened in 7Hub — kept in the conversation as a card (MessageList)
    onActivityEnd(activityId, {
      outcome: 'done',
      label: doneLabel(call.name, result),
      opened: result?.opened || (result?.filtered ? result.query || 'filtro' : undefined) || result?.section,
      options: optionsFor(call.name, result)
    });
    return { response: result ?? { ok: true } };
  } catch (error) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Non riuscito', message: error.message });
    return { response: { error: error.message || '7Hub tool failed' } };
  }
}
