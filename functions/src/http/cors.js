/**
 * Browser origins allowed to call our HTTP functions. Shared by every endpoint (`tools`,
 * `database`) so there is one list to keep aligned with the web app host and `firebase.json`
 * frame-ancestors — see README "If the site name changes".
 */
export const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://assistente-7hub.web.app',
  'https://assistente-7hub.firebaseapp.com',
  // the development site (branch `development`): same project, so it calls these same functions
  'https://assistente-7hub-development.web.app',
  'https://assistente-7hub-development.firebaseapp.com'
];

/** Allows listed browser origins only. Returns false when the request was rejected (response already sent). */
export function applyCors(req, res) {
  const origin = req.get('Origin');
  // no Origin: a command-line or server-to-server call; the token is what matters
  if (!origin) return true;

  if (!ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed.' });
    return false;
  }
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
  return true;
}
