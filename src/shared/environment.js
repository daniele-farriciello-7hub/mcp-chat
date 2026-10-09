/**
 * Production or development, fixed at build time by NEXT_PUBLIC_APP_ENV (set by the development
 * deploy and by `.env.development` for `npm run dev`).
 *
 * Development is a separate app of the suite, `assistente-7hub-development`: its own data under
 * `apps/assistente-7hub-development` (same Firestore database), its own Storage folder, its own key
 * in `users/{uid}.permessi_app` (who may use it, who is admin there) and its own function twins. A
 * test or a data migration tried there never touches production data. Shared with production: the
 * sign-in itself and the Firebase project.
 */
export const IS_DEVELOPMENT = process.env.NEXT_PUBLIC_APP_ENV === 'development';

/** This app's id in the suite: permission key, Firestore root and Storage folder. */
export const APP_ID = IS_DEVELOPMENT ? 'assistente-7hub-development' : 'assistente-7hub';

// functions with a development twin (functions/index.js); `tools` touches no app data and has none
const DEVELOPMENT_TWINS = new Set(['database', 'history']);

/** The deployed name of a function in this environment: `database` → `databaseDev` in development. */
export const functionName = name => (IS_DEVELOPMENT && DEVELOPMENT_TWINS.has(name) ? `${name}Dev` : name);
