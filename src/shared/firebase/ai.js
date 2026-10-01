/**
 * Firebase AI Logic on the Vertex AI backend. The model key never reaches the client.
 *
 * Location is "global", not an EU region: Gemini 3.x on Vertex is only served from `global`
 * (`europe-west8` answers 404), so conversation text may be processed outside the EU. To restore
 * EU residency, switch to a European region and a model available there.
 */
import { getAI, getGenerativeModel, VertexAIBackend } from 'firebase/ai';
// imported, not fetched with getApp(): the import is what runs initializeApp()
import { app } from './app';

const LOCATION = 'global';

let aiInstance = null;

function ai() {
  if (!aiInstance) aiInstance = getAI(app, { backend: new VertexAIBackend(LOCATION) });
  return aiInstance;
}

/** A Gemini model handle. `modelParams` is passed through to getGenerativeModel. */
export function getModel(modelParams) {
  return getGenerativeModel(ai(), modelParams);
}
