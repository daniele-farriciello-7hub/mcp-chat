/**
 * HTTP handler for the conversation history, one path per action (POST /history/<action>). Same
 * shape as `databaseEndpoint.js`: the caller's Firebase ID token is verified and `users/{uid}` is
 * read on every call.
 *
 * `restore`, `question`, `turn`, `reset` act on the caller's own conversations only — the user comes
 * from the token, never from the body. `list`, `transcript`, `users` and `allShortcuts` read everyone's and are
 * admin-only.
 * Writes are refused (204, nothing stored) while `historyEnabled` is off in the settings: the
 * server does not take the browser's word for it.
 */
import { InvalidTokenError, verifyAppUser } from '../auth/firebaseUser.js';
import { applyCors } from './cors.js';
import {
  HistoryError,
  appUsers,
  endConversation,
  historySettings,
  listConversations,
  recordQuestion,
  recordTurn,
  restore,
  transcript
} from '../history/historyStore.js';
import {
  ShortcutsError,
  listAllShortcuts,
  loadShortcutsWithLimit,
  saveShortcuts
} from '../shortcuts/personalShortcuts.js';

const OPERATOR_ACTIONS = {
  restore: user => restore(user).then(conversation => ({ conversation })),
  question: (user, body, settings) => recordQuestion(user, body, settings.retentionDays),
  turn: (user, body) => recordTurn(user, body),
  reset: user => endConversation(user),
  // the caller's own welcome-screen shortcuts: not history, so they work with history off too
  shortcuts: user => loadShortcutsWithLimit(user),
  saveShortcuts: (user, body) => saveShortcuts(user, body)
};
const ALWAYS_ON = new Set(['shortcuts', 'saveShortcuts']);
const ADMIN_ACTIONS = {
  list: (_user, body) => listConversations(body),
  transcript: (_user, body) => transcript(body),
  users: () => appUsers(),
  allShortcuts: () => listAllShortcuts()
};
// these change data; with history off they are accepted and ignored, so an old tab does not error
const WRITE_ACTIONS = new Set(['question', 'turn', 'reset']);

export async function handleHistoryRequest(req, res) {
  if (!applyCors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const action = String(req.path || '').replace(/^\/+|\/+$/g, '');
  const isAdminAction = Boolean(ADMIN_ACTIONS[action]);
  const handler = ADMIN_ACTIONS[action] || OPERATOR_ACTIONS[action];
  if (!handler) return res.status(404).json({ error: `Unknown action "${action}".` });

  const authorization = req.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Firebase ID token in the Authorization header.' });
  }

  let user;
  try {
    user = await verifyAppUser(authorization.slice(7).trim());
  } catch (error) {
    if (error instanceof InvalidTokenError)
      return res.status(401).json({ error: `Token rejected: ${error.message}.` });
    throw error;
  }
  if (!user.canUse) return res.status(403).json({ error: 'This account may not use the assistant.' });
  if (isAdminAction && !user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  try {
    const settings = await historySettings();
    if (!settings.enabled && !isAdminAction && !ALWAYS_ON.has(action)) {
      if (WRITE_ACTIONS.has(action)) return res.status(200).json({ disabled: true });
      return res.status(200).json({ conversation: null, disabled: true });
    }
    return res.status(200).json(await handler(user, req.body || {}, settings));
  } catch (error) {
    if (error instanceof HistoryError || error instanceof ShortcutsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(`history ${action} failed`, error);
    return res.status(500).json({ error: 'Internal service error.' });
  }
}
