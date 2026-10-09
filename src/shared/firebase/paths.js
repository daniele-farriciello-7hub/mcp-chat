/**
 * This app's id in the suite — key of `users/{uid}.permessi_app` and root of its Firestore/Storage
 * data. `assistente-7hub` in production, `assistente-7hub-development` in development
 * (see shared/environment.js).
 */
export { APP_ID } from '@/shared/environment';
import { APP_ID } from '@/shared/environment';

export const FIRESTORE_ROOT = ['apps', APP_ID];
