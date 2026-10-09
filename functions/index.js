/** Cloud Functions entry point: wiring only. Logic lives in src/. */
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { handleToolRequest } from './src/http/toolsEndpoint.js';
import { handleDatabaseRequest } from './src/http/databaseEndpoint.js';
import { handleHistoryRequest } from './src/http/historyEndpoint.js';
import { DEVELOPMENT_APP, PRODUCTION_APP, forApp } from './src/appContext.js';

// europe-west1: the data are Italian people's records and stay in the EU
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp({ storageBucket: 'mappa-contatti-217007.firebasestorage.app' });

export const tools = onRequest(handleToolRequest);
// timeoutSeconds below the 60s gen2 default: a long-running query must not leave the browser
// hanging past the function's own budget (plan edge case 18)
// 60s and 1GiB: an export (exportFile) runs a query of up to 45s and builds a file of up to 50k rows
export const database = onRequest(
  { timeoutSeconds: 60, memory: '1GiB' },
  forApp(PRODUCTION_APP, handleDatabaseRequest)
);

// conversation history: the browser never touches those collections, it goes through here
export const history = onRequest({ timeoutSeconds: 30 }, forApp(PRODUCTION_APP, handleHistoryRequest));

// Development twins: same code, serving the app `assistente-7hub-development` (its own data under
// apps/assistente-7hub-development, its own permission key). Deployed only from the `development`
// branch and called only by the development site; production deploys only the three above. `tools`
// touches no app data and has no twin.
export const databaseDev = onRequest(
  { timeoutSeconds: 60, memory: '1GiB' },
  forApp(DEVELOPMENT_APP, handleDatabaseRequest)
);
export const historyDev = onRequest({ timeoutSeconds: 30 }, forApp(DEVELOPMENT_APP, handleHistoryRequest));
