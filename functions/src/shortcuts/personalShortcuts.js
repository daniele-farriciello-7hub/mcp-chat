/**
 * Each operator's own shortcuts on the welcome screen. Stored server side under
 * `apps/assistente-7hub/chatUsers/{uid}/private/shortcuts` — inside `chatUsers`, which the Firestore
 * rules close to the browser — so the only way in is the `history` function, which takes the user
 * from the verified token: nobody reads or edits someone else's.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// No limit for the operator. This only keeps the list inside Firestore's 1 MB per document (each
// shortcut is at most ~1.3 KB), so an absurd list gets a clear error instead of a failed write.
const MAX_SHORTCUTS = 500;
const LIMITS = { icon: 30, title: 60, description: 120, prompt: 1000 };

const docOf = uid => getFirestore().doc(`apps/assistente-7hub/chatUsers/${uid}/private/shortcuts`);

export class ShortcutsError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function loadShortcuts(user) {
  const snapshot = await docOf(user.uid).get();
  return { shortcuts: snapshot.exists ? snapshot.data().items || [] : [] };
}

/** Replaces the caller's list: what the browser shows is what is stored, in the same order. */
export async function saveShortcuts(user, body) {
  if (!Array.isArray(body.shortcuts)) throw new ShortcutsError('shortcuts must be a list');
  if (body.shortcuts.length > MAX_SHORTCUTS) throw new ShortcutsError(`at most ${MAX_SHORTCUTS} shortcuts`);
  const items = body.shortcuts.map(s => ({
    icon: clean(s?.icon, LIMITS.icon) || 'question',
    title: clean(s?.title, LIMITS.title),
    description: clean(s?.description, LIMITS.description),
    prompt: clean(s?.prompt, LIMITS.prompt)
  }));
  if (items.some(s => !s.title || !s.prompt))
    throw new ShortcutsError('every shortcut needs a title and a question');
  await docOf(user.uid).set({ items, updatedAt: FieldValue.serverTimestamp() });
  return { shortcuts: items };
}
