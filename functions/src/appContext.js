/**
 * Which app a request works for. Production functions serve `assistente-7hub`; their development
 * twins (`databaseDev`, `historyDev`, see index.js) serve `assistente-7hub-development` — a separate
 * app of the suite, with its own data under `apps/assistente-7hub-development` in the same Firestore
 * database, its own Storage folder and its own permission key in `users/{uid}.permessi_app`. A test
 * or a data migration tried from the development site never touches production data.
 *
 * Kept per request with AsyncLocalStorage rather than in a module variable: the emulator runs every
 * function in one process, so a module variable would let a development and a production request
 * race.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const PRODUCTION_APP = 'assistente-7hub';
export const DEVELOPMENT_APP = 'assistente-7hub-development';

const current = new AsyncLocalStorage();

/** Wraps an HTTP handler so that everything it calls works for `app`. */
export const forApp = (app, handler) => (req, res) => current.run(app, () => handler(req, res));

/** The app of the current request; production outside any request. */
export const appId = () => current.getStore() || PRODUCTION_APP;

/** Firestore path of the current app's data: `apps/<appId>`. */
export const appRoot = () => `apps/${appId()}`;
