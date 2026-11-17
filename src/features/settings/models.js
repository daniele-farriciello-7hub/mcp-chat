/**
 * Selectable Gemini models. Ids are verified against the endpoint, not derived from names:
 * `gemini-3.1-pro` does not exist, Pro only answers as `-preview`.
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
  }
];

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
