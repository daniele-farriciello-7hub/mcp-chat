/**
 * Each operator's own shortcuts on the welcome screen. Stored server side under
 * `apps/<app>/chatUsers/{uid}/private/shortcuts` — inside `chatUsers`, which the Firestore
 * rules close to the browser — so the only way in is the `history` function, which takes the user
 * from the verified token: nobody reads or edits someone else's.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appRoot } from '../appContext.js';

// No limit for the operator. This only keeps the list inside Firestore's 1 MB per document (each
// shortcut is at most ~1.3 KB), so an absurd list gets a clear error instead of a failed write.
const MAX_SHORTCUTS = 500;

/** The admin's limit (`personalShortcutsLimit` in the settings; 0 or missing = none), at most 500. */
async function adminLimit() {
  const snapshot = await getFirestore().doc(`${appRoot()}/config/settings`).get();
  const limit = Number(snapshot.exists ? snapshot.data().personalShortcutsLimit : 0);
  return limit > 0 ? Math.min(Math.round(limit), MAX_SHORTCUTS) : MAX_SHORTCUTS;
}
const LIMITS = { icon: 30, title: 60, description: 120, prompt: 1000 };

const docOf = uid => getFirestore().doc(`${appRoot()}/chatUsers/${uid}/private/shortcuts`);

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

/** The list plus the limit, for the browser to know whether to offer "Aggiungi". */
export async function loadShortcutsWithLimit(user) {
  const [{ shortcuts }, limit] = await Promise.all([loadShortcuts(user), adminLimit()]);
  return { shortcuts, limit: limit === MAX_SHORTCUTS ? null : limit };
}

/** Replaces the caller's list: what the browser shows is what is stored, in the same order. */
export async function saveShortcuts(user, body) {
  if (!Array.isArray(body.shortcuts)) throw new ShortcutsError('shortcuts must be a list');
  const limit = await adminLimit();
  const current = (await loadShortcuts(user)).shortcuts.length;
  // lowering the limit deletes nothing: a list already over it may be edited or shortened, not grown
  if (body.shortcuts.length > limit && body.shortcuts.length > current) {
    throw new ShortcutsError(`Puoi avere al massimo ${limit} scorciatoie personali.`);
  }
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

/**
 * Admin only: every operator's personal shortcuts, with who they belong to. One read of the
 * `chatUsers` pointers plus their `private/shortcuts` documents, all under this app's path.
 */
export async function listAllShortcuts() {
  const db = getFirestore();
  const pointers = await db.collection(`${appRoot()}/chatUsers`).listDocuments();
  const docs = pointers.length
    ? await db.getAll(...pointers.map(ref => ref.collection('private').doc('shortcuts')))
    : [];
  const owners = docs.filter(d => d.exists && (d.data().items || []).length);
  const users = owners.length
    ? await db.getAll(...owners.map(d => db.doc(`users/${d.ref.parent.parent.id}`)))
    : [];
  const byUid = new Map(users.filter(u => u.exists).map(u => [u.id, u.data()]));
  return {
    owners: owners
      .map(d => {
        const uid = d.ref.parent.parent.id;
        const user = byUid.get(uid) || {};
        return {
          uid,
          email: user.email || '',
          name: user.nome || '',
          shortcuts: d.data().items,
          updatedAt: d.data().updatedAt?.toMillis?.() ?? null
        };
      })
      .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid))
  };
}
