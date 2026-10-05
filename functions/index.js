/** Cloud Functions entry point: wiring only. Logic lives in src/. */
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { handleToolRequest } from './src/http/toolsEndpoint.js';
import { handleDatabaseRequest } from './src/http/databaseEndpoint.js';
import { handleHistoryRequest } from './src/http/historyEndpoint.js';

// europe-west1: the data are Italian people's records and stay in the EU
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp({ storageBucket: 'mappa-contatti-217007.firebasestorage.app' });

export const tools = onRequest(handleToolRequest);
// timeoutSeconds below the 60s gen2 default: a long-running query must not leave the browser
// hanging past the function's own budget (plan edge case 18)
export const database = onRequest({ timeoutSeconds: 30 }, handleDatabaseRequest);

// conversation history: the browser never touches those collections, it goes through here
export const history = onRequest({ timeoutSeconds: 30 }, handleHistoryRequest);
