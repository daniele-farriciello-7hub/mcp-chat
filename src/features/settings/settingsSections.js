/**
 * The tabs of the configuration panel and, where a tab is long, the subsections it is split into.
 *
 *   id            what the page state, the tab components and the sidebar call it
 *   slug          its name in the URL (`#config/<slug>/<subsection>`, see features/navigation/placeUrl.js)
 *   group         where the sidebar lists it: 'config' = "Configurazione", 'assistant' = "Assistente" (Storico)
 *   subsections   `id` (also its URL slug), `name` (the sidebar entry), `title` (the page title, `name` when missing) and
 *                 `description` (the line under it)
 *
 * The tab components take `subsection` and draw only that group (`inSubsection`); without one (a chat opened with no sidebar,
 * which nothing does today: the standalone page and /embed both have it) they draw everything, as they always did. The shared settings object stays in SettingsPanel whatever is shown,
 * so what has been typed in one subsection is still there in the next and a single "Salva" saves all of it.
 */
export const SETTINGS_TABS = [
  {
    id: 'model',
    slug: 'modello',
    name: 'Modello IA',
    group: 'config',
    subsections: [
      {
        id: 'istruzioni',
        name: 'Istruzioni',
        title: 'Istruzioni al modello',
        description: 'Il testo che orienta ogni risposta: il primo posto dove intervenire.'
      },
      {
        id: 'modelli',
        name: 'Modelli',
        description: 'Quale modello risponde in chat e quale legge i documenti.'
      },
      {
        id: 'documenti',
        name: 'Uso dei documenti',
        description: 'Come si scrive la scheda di un documento e come l’assistente sceglie quale aprire.'
      },
      {
        id: 'risposte',
        name: 'Risposte',
        description: 'Creatività, lunghezza, ragionamento e domande di chiarimento.'
      },
      {
        id: 'grafici',
        name: 'Grafici',
        title: 'Grafici nella chat',
        description: 'Limiti di leggibilità dei grafici disegnati dall’app.'
      },
      {
        id: 'memoria',
        name: 'Memoria e trasparenza',
        description: 'Quanta conversazione ricorda il modello e l’avviso che si parla con un’AI.'
      }
    ]
  },
  {
    id: 'shortcuts',
    slug: 'scorciatoie',
    name: 'Scorciatoie',
    group: 'config',
    subsections: [
      {
        id: 'riquadri',
        name: 'Riquadri',
        title: 'Riquadri della chat',
        description: 'Quello che l’operatore vede aprendo la chat, nell’ordine in cui compare.'
      },
      {
        id: 'personali',
        name: 'Personali',
        title: 'Scorciatoie personali',
        description: 'Quelle che gli operatori si creano da soli, e quante ne possono avere.'
      }
    ]
  },
  {
    id: 'documents',
    slug: 'documenti',
    name: 'Documenti',
    group: 'config',
    subsections: [
      {
        id: 'da-indicizzare',
        name: 'Da indicizzare',
        description: 'File caricati che l’assistente non può ancora usare.'
      },
      { id: 'errori', name: 'Con errore', description: 'Documenti che non è stato possibile indicizzare.' },
      { id: 'indicizzati', name: 'Indicizzati', description: 'Documenti pronti per essere usati in chat.' },
      {
        id: 'drive',
        name: 'Drive',
        description: 'Cartelle e PDF di Google Drive tenuti allineati con l’archivio.'
      },
      {
        id: 'categorie',
        name: 'Categorie',
        description:
          'L’elenco da cui Gemini sceglie le categorie dei documenti, e come assegnarle a quelli che non ne hanno.'
      },
      {
        id: 'senza-ai',
        name: 'Documenti senza AI',
        description: 'Elenchi di file che compaiono subito, a parole fisse, senza passare dal modello.'
      }
    ]
  },
  {
    id: 'database',
    slug: 'database',
    name: 'Database',
    group: 'config',
    subsections: [
      {
        id: 'connessioni',
        name: 'Connessioni',
        title: 'Connessioni al database',
        description: 'Dati veri per rispondere con i numeri, non solo con i documenti.'
      },
      {
        id: 'istruzioni',
        name: 'Istruzioni e modello',
        description: 'Come l’assistente scrive le query e quale modello se ne occupa.'
      },
      {
        id: 'limiti',
        name: 'Limiti',
        description: 'Righe e tempi massimi delle query e degli export Excel.'
      },
      {
        id: 'comandi',
        name: 'Comandi senza AI',
        description: 'Risposte in pochi secondi a parole fisse, senza passare dal modello.'
      }
    ]
  },
  {
    id: 'history',
    slug: 'storico',
    name: 'Storico',
    group: 'assistant',
    subsections: [
      {
        id: 'panoramica',
        name: 'Panoramica',
        description: 'Come viene usato l’assistente, da chi e con quali strumenti.'
      },
      {
        id: 'conversazioni',
        name: 'Conversazioni',
        description: 'Le conversazioni del periodo, da aprire e scaricare.'
      },
      {
        id: 'salvataggio',
        name: 'Salvataggio',
        description: 'Se salvare le conversazioni, per quanto tempo e cosa dire agli operatori.'
      }
    ]
  },
  {
    id: 'hub',
    slug: '7hub',
    name: '7Hub',
    group: 'config',
    subsections: [
      {
        id: 'istruzioni',
        name: 'Istruzioni',
        title: 'Come usa gli strumenti 7Hub',
        description: 'Il testo che guida l’assistente quando è aperto dentro 7Hub.'
      },
      {
        id: 'strumenti',
        name: 'Strumenti',
        description: 'Cosa può fare l’assistente dentro 7Hub.'
      }
    ]
  }
];

export const findTab = id => SETTINGS_TABS.find(tab => tab.id === id);

/** The subsection of a tab by id, or the tab's first one when the id is missing or unknown; null for a tab with none. */
export function findSubsection(tab, id) {
  const subsections = tab?.subsections;
  if (!subsections?.length) return null;
  return subsections.find(sub => sub.id === id) ?? subsections[0];
}

/** Whether a group of a tab is drawn: `current` is the chosen subsection, none means "all of them" (no sidebar). */
export const inSubsection = (current, id) => !current || current === id;
