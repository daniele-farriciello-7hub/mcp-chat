/**
 * postMessage protocol between this iframe and the page hosting it (7hub-revolution). The iframe
 * lives on another origin, so it can neither read cookies nor navigate the parent: everything goes
 * through postMessage, always with a verified origin.
 *
 * host → iframe
 *   { type: 'context', user: { firstName, lastName, email }, page: '/dashboard/…', theme: 'light'|'dark' }
 * iframe → host
 *   { type: 'ready' }                    sent twice: by the inline script in app/embed/layout.jsx and on mount
 *   { type: 'navigate', url: '/dashboard/…' }
 *   { type: 'close' }
 */

// The trusted suffix is compared on the parsed HOSTNAME, never on the raw origin string:
// `origin.includes('7hub.it')` would accept `https://7hub.it.attacker.com`.
const TRUSTED_DOMAIN = '7hub.it';
const TRUSTED_LOCALHOSTS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

// LEGACY(host protocol v1): hosts deployed before the English protocol send and expect Italian
// keys. Outgoing messages carry both keys; incoming legacy context is normalised. Remove this block
// once 7hub-revolution with the English protocol is in production.
const LEGACY_OUTGOING = { ready: 'pronto', navigate: 'naviga', close: 'chiudi' };

function fromLegacyContext(data) {
  if (data.tipo !== 'contesto') return data;
  return {
    type: 'context',
    user: data.utente
      ? { firstName: data.utente.nome, lastName: data.utente.cognome, email: data.utente.email }
      : null,
    page: data.pagina,
    theme: data.tema
  };
}

function withLegacyKeys(message) {
  const legacyType = LEGACY_OUTGOING[message.type];
  return legacyType ? { ...message, tipo: legacyType } : message;
}
// END LEGACY

export function isTrustedHostOrigin(origin) {
  if (!origin) return false;
  if (TRUSTED_LOCALHOSTS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    // the leading dot matters: without it `fake7hub.it` would pass
    return hostname === TRUSTED_DOMAIN || hostname.endsWith(`.${TRUSTED_DOMAIN}`);
  } catch {
    return false;
  }
}

export const isEmbedded = () => typeof window !== 'undefined' && window.parent !== window;

/** The embedding page's origin, derived (ancestorOrigins, then referrer) and verified; null otherwise. */
export function getHostOrigin() {
  if (!isEmbedded()) return null;

  const candidates = [];
  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors?.length) candidates.push(ancestors[0]);
  } catch {
    // not supported: fall back to the referrer
  }
  if (document.referrer) {
    try {
      candidates.push(new URL(document.referrer).origin);
    } catch {
      // malformed referrer: ignored
    }
  }
  return candidates.find(isTrustedHostOrigin) || null;
}

/** Sends a message to the host. Never '*': always an explicit, trusted origin. */
export function postToHost(message, origin) {
  if (!isEmbedded()) return;
  const target = origin && isTrustedHostOrigin(origin) ? origin : getHostOrigin();
  if (!target) return;
  window.parent.postMessage(withLegacyKeys(message), target);
}

export const announceReady = () => postToHost({ type: 'ready' });

/** Listens for host context. `onContext(context, origin)` fires only for trusted origins. Returns cleanup. */
export function listenToHost(onContext) {
  if (typeof window === 'undefined') return () => {};

  const handler = event => {
    if (!isTrustedHostOrigin(event.origin)) return;
    if (!event.data || typeof event.data !== 'object') return;
    const data = fromLegacyContext(event.data);
    if (data.type === 'context') onContext(data, event.origin);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
