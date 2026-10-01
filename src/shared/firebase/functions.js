/**
 * Calls the backend Cloud Functions from the browser (`database`, and later `tools`), attaching the
 * signed-in operator's Firebase ID token — `functions/src/auth/firebaseUser.js` verifies it and
 * reads their `users/{uid}` permissions.
 *
 * NOTE: confirm this base URL against the URL `firebase deploy --only functions` actually prints
 * the first time `database` is deployed — 2nd-gen HTTPS functions are Cloud Run services under the
 * hood, and the legacy `<region>-<project>.cloudfunctions.net/<name>` alias below is what this
 * project's other functions use locally, not yet exercised in production.
 */
import { auth } from './app';

const PROJECT_ID = 'mappa-contatti-217007';
const REGION = 'europe-west1';

function functionsBaseUrl() {
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}`;
  }
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;
}

export class FunctionCallError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'FunctionCallError';
    this.status = status;
  }
}

/** POSTs to `<function>/<path>` with the operator's ID token and JSON body; returns the JSON body. */
export async function callFunction(functionName, path, body = {}) {
  const user = auth.currentUser;
  if (!user) throw new FunctionCallError('Devi essere autenticato.', 401);
  const idToken = await user.getIdToken();

  let response;
  try {
    response = await fetch(`${functionsBaseUrl()}/${functionName}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body)
    });
  } catch {
    throw new FunctionCallError('Il server non risponde. Controlla la connessione.', 0);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new FunctionCallError('Risposta del server non valida.', response.status);
  }

  if (!response.ok) throw new FunctionCallError(data.error || `Errore ${response.status}`, response.status);
  return data;
}
