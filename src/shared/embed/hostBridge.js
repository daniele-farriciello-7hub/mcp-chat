/**
 * postMessage protocol between this iframe and the page hosting it (7hub-revolution). The iframe
 * lives on another origin, so it can neither read cookies nor navigate the parent: everything goes
 * through postMessage, always with a verified origin.
 *
 * host → iframe
 *   { type: 'context', user: { firstName, lastName, email }, page: '/dashboard/…', pageTitle,
 *     theme: 'light'|'dark', tools: ['get_context', 'search_records', 'open_page', 'open_record'] }
 *   { type: 'tool_result', id, ok: true, result } | { type: 'tool_result', id, ok: false, error }
 *   { type: 'ask', text }                 the operator asked from the host (home box, search bar): send it
 *   { type: 'reset' } | { type: 'open_settings' } | { type: 'sign_out' }   the host's header buttons
 *   (context.hostChrome = true: the host draws the header, so this page hides its own)
 * iframe → host
 *   { type: 'ready' }                    sent twice: by the inline script in app/embed/layout.jsx and on mount
 *   { type: 'navigate', url: '/dashboard/…' }
 *   { type: 'close' }
 *   { type: 'status', busy }             so the host can show that the assistant is working
 *   { type: 'tool_call', id, name, args } the host runs it in the operator's own 7Hub session (their
 *                                         login and visibility rules) and answers with tool_result
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

// `listening`: sent once the page listens to the host (the inline pre-hydration `ready` cannot receive commands yet)
export const announceReady = () => postToHost({ type: 'ready', listening: true });

const HOST_COMMANDS = new Set(['ask', 'reset', 'open_settings', 'sign_out']);

/**
 * Listens to the host. `onContext(context, origin)` for context, `onCommand(command, origin)` for the host's
 * commands (ask, reset, open_settings, sign_out). Trusted origins only. Returns cleanup.
 */
export function listenToHost(onContext, onCommand) {
  if (typeof window === 'undefined') return () => {};

  const handler = event => {
    if (!isTrustedHostOrigin(event.origin)) return;
    if (!event.data || typeof event.data !== 'object') return;
    const data = fromLegacyContext(event.data);
    if (data.type === 'context') onContext(data, event.origin);
    else if (onCommand && event.source === window.parent && HOST_COMMANDS.has(data.type))
      onCommand(data, event.origin);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

// ---------------------------------------------------------------------------------------------------
// Tool bridge: the model's 7Hub tools (features/chat/tools/hostTools.js) are executed by the host page,
// which already has the operator's session. Each call gets an id; the matching tool_result resolves it.

const HOST_TOOL_TIMEOUT_MS = 20000;
const pending = new Map();
let resultListener = null;

function ensureResultListener() {
  if (resultListener || typeof window === 'undefined') return;
  resultListener = event => {
    if (!isTrustedHostOrigin(event.origin)) return;
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'tool_result') return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || 'host tool failed'));
  };
  window.addEventListener('message', resultListener);
}

/** Asks the host page to run one of its tools. Rejects if not embedded, not trusted, or no answer in time. */
export function callHostTool(name, args = {}) {
  const origin = getHostOrigin();
  if (!origin) return Promise.reject(new Error('not embedded in 7Hub'));
  ensureResultListener();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('7Hub did not answer in time'));
    }, HOST_TOOL_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ type: 'tool_call', id, name, args }, origin);
  });
}
