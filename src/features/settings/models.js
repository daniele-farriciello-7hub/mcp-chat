/**
 * Selectable Gemini models. Ids are verified against the endpoint, not derived from names:
 * `gemini-3.1-pro` does not exist, Pro only answers as `-preview`.
 * Ids verified on 23/11/2026 (Vertex AI, location global, generateContent), the "nuovo" ones included.
 * `gemini-3.8-flash-lite` answers 404 and `gemini-omni-1.2-flash` only works through another API, so
 * neither is listed. The new ones are there for admins to try: their speed and cost on our workload are
 * unknown, and what the descriptions say about them comes from secondary sources, not from our tests.
 * None of them is a default or a fallback.
 */
export const MODELS = [
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    description: 'Rapido ed equilibrato.'
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    description: 'Il più leggero. Perde qualcosa sulle risposte lunghe e articolate.'
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro (anteprima)',
    description:
      'Il più capace: ragiona meglio sui casi complessi, ma è più lento. È in anteprima: Google può ritirarlo senza preavviso.'
  },
  // new (November 2026), listed after the established ones. "(nuovo)" is cut by IndexedDocumentRow's modelName
  {
    id: 'gemini-4-neon',
    name: 'Gemini 4 Neon (nuovo)',
    description:
      'Nuovo (novembre 2026), da provare: il modello generico più recente. Velocità e costo sul nostro lavoro ancora non li conosciamo.'
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen (nuovo)',
    description:
      'Nuovo (novembre 2026), da provare: pensato per programmare e per i compiti da agente di tutti i giorni. Velocità e costo ancora da misurare.'
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon (nuovo)',
    description:
      'Nuovo (novembre 2026), da provare: indicato come il più forte nel ragionamento della famiglia 4. Velocità e costo ancora da misurare.'
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon (nuovo)',
    description:
      'Nuovo (novembre 2026), da provare: un Gemini 4 precedente agli altri. Velocità e costo ancora da misurare.'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (nuovo)',
    description:
      'Nuovo (novembre 2026), da provare: un Flash più recente del 3.5. Velocità e costo ancora da misurare.'
  }
];

// both defaults are copied in functions/src/drive/indexCard.js (server-side indexing of Drive documents)
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash';

// indexing runs once per document, so it defaults to the most capable model
export const DEFAULT_INDEXING_MODEL = 'gemini-3.1-pro-preview';

// When the chat model stays rate-limited after the retries, the turn goes on with this one: the lightest,
// so the likeliest to have headroom. If that is the model being limited, the next one up takes over.
export const FALLBACK_CHAT_MODEL = 'gemini-3.5-flash-lite';
const SECOND_FALLBACK_CHAT_MODEL = 'gemini-3.5-flash';

/** The model to finish a turn with when `modelId` is rate-limited. */
export const fallbackModelFor = modelId =>
  modelId === FALLBACK_CHAT_MODEL ? SECOND_FALLBACK_CHAT_MODEL : FALLBACK_CHAT_MODEL;
