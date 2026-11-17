/** Cloud Functions entry point: wiring only. Logic lives in src/. */
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { handleToolRequest } from './src/http/toolsEndpoint.js';
import { handleDatabaseRequest } from './src/http/databaseEndpoint.js';
import { handleHistoryRequest } from './src/http/historyEndpoint.js';
import { DEVELOPMENT_APP, PRODUCTION_APP, forApp } from './src/appContext.js';

// The Drive and Gemini libraries are heavy and every function shares this file's cold start, so the Drive
// handlers are loaded when first called, not here.
const lazy =
  (module, name) =>
  async (...args) =>
    (await import(module))[name](...args);
const handleDriveRequest = lazy('./src/http/driveEndpoint.js', 'handleDriveRequest');
const handleDriveWebhook = lazy('./src/http/driveWebhookEndpoint.js', 'handleDriveWebhook');
const runDriveTick = lazy('./src/drive/tick.js', 'runDriveTick');

// europe-west1: the data are Italian people's records and stay in the EU
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp({ storageBucket: 'mappa-contatti-217007.firebasestorage.app' });

export const tools = onRequest(handleToolRequest);
// 720s (12 min): a query may run up to 600s (QUERY_MAX_SECONDS / EXPORT_LIMITS in databaseEndpoint.js),
// plus connection setup, building the file and sending it; the server always stops the query first, so
// the operator gets a clean error, not a raw 504. This is also the Cloud Run request timeout (gen2 HTTP
// functions allow up to 3600s). The browser calls the function URL directly (shared/firebase/functions.js),
// NOT through a Firebase Hosting rewrite, which would cut every request at 60s: do not add one for
// `database`. 1GiB: an export builds a file of up to 200k rows
export const database = onRequest(
  { timeoutSeconds: 720, memory: '1GiB' },
  forApp(PRODUCTION_APP, handleDatabaseRequest)
);

// conversation history: the browser never touches those collections, it goes through here
export const history = onRequest({ timeoutSeconds: 30 }, forApp(PRODUCTION_APP, handleHistoryRequest));

// Google Drive → document archive (functions/src/drive/):
//   drive          admin API of the panel: sources, frequency, "Sincronizza ora". 540s: a manual sync runs
//                  inside the request (and reports its progress through Firestore), see driveEndpoint.js
//   driveWebhook   public: Drive's push notifications; only marks a source due, never syncs (the token
//                  checked there is what authenticates it)
//   driveScheduler every 15 minutes (Cloud Scheduler job created by the deploy): renews notification
//                  channels and runs the sources that are due. 1GiB: PDFs up to 20MB, several at once
export const drive = onRequest(
  { timeoutSeconds: 540, memory: '1GiB' },
  forApp(PRODUCTION_APP, handleDriveRequest)
);
export const driveWebhook = onRequest({ timeoutSeconds: 30 }, forApp(PRODUCTION_APP, handleDriveWebhook));
export const driveScheduler = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Europe/Rome', timeoutSeconds: 540, memory: '1GiB' },
  forApp(PRODUCTION_APP, runDriveTick)
);

// Development twins: same code, serving the app `assistente-7hub-development` (its own data under
// apps/assistente-7hub-development, its own permission key). Deployed only from the `development`
// branch and called only by the development site; production deploys only the functions above.
// `tools` touches no app data and has no twin.
export const databaseDev = onRequest(
  { timeoutSeconds: 720, memory: '1GiB' },
  forApp(DEVELOPMENT_APP, handleDatabaseRequest)
);
export const historyDev = onRequest({ timeoutSeconds: 30 }, forApp(DEVELOPMENT_APP, handleHistoryRequest));
export const driveDev = onRequest(
  { timeoutSeconds: 540, memory: '1GiB' },
  forApp(DEVELOPMENT_APP, handleDriveRequest)
);
export const driveWebhookDev = onRequest({ timeoutSeconds: 30 }, forApp(DEVELOPMENT_APP, handleDriveWebhook));
export const driveSchedulerDev = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Europe/Rome', timeoutSeconds: 540, memory: '1GiB' },
  forApp(DEVELOPMENT_APP, runDriveTick)
);
