/**
 * The signed-in operator's own shortcuts, through the `history` function (server side: nobody
 * reaches someone else's). See functions/src/shortcuts/personalShortcuts.js.
 */
'use client';

import { callFunction } from '@/shared/firebase/functions';
import { getSettings, saveSettingsFields } from '@/features/settings/settingsStore';

/** @returns {Promise<{shortcuts: object[], limit: number | null}>} limit null = no limit */
export async function loadPersonalShortcuts() {
  const { shortcuts, limit } = await callFunction('history', 'shortcuts');
  return { shortcuts: shortcuts || [], limit: limit ?? null };
}

export async function savePersonalShortcuts(shortcuts) {
  const result = await callFunction('history', 'saveShortcuts', { shortcuts });
  return result.shortcuts;
}

/** The admin's shortcuts this user should see: those for everyone, and those assigned to them. */
export const shortcutsFor = (shortcuts, uid) =>
  (shortcuts || []).filter(s => !s.uids?.length || (uid && s.uids.includes(uid)));

/** An admin shortcut assigned to this user alone: for an admin, that is "theirs". */
export const isOnlyFor = (shortcut, uid) => shortcut.uids?.length === 1 && shortcut.uids[0] === uid;

// Admins have no private personal shortcuts: "their" shortcuts are admin shortcuts assigned only to
// themselves, kept in the shared settings with the others (Scorciatoie tab, «Per chi» = themselves).

async function loadAdminOwn(uid) {
  const settings = await getSettings({ refresh: true });
  const shortcuts = settings.shortcuts
    .filter(s => isOnlyFor(s, uid))
    .map(({ uids, ...rest }) => (void uids, rest));
  return { shortcuts, limit: null };
}

/** Replaces this admin's own shortcuts, leaving every other admin shortcut as it is, in place. */
async function saveAdminOwn(uid, own) {
  const settings = await getSettings({ refresh: true });
  const others = settings.shortcuts.filter(s => !isOnlyFor(s, uid));
  const next = [...others, ...own.map(s => ({ ...s, uids: [uid] }))];
  const saved = await saveSettingsFields({ shortcuts: next });
  return saved.shortcuts.filter(s => isOnlyFor(s, uid)).map(({ uids, ...rest }) => (void uids, rest));
}

/** "Le tue scorciatoie" of whoever is signed in: private ones for operators, own admin ones for admins. */
export const loadOwnShortcuts = ({ uid, isAdmin }) => (isAdmin ? loadAdminOwn(uid) : loadPersonalShortcuts());
export const saveOwnShortcuts = ({ uid, isAdmin }, list) =>
  isAdmin ? saveAdminOwn(uid, list) : savePersonalShortcuts(list);

/** Admin only (checked by the server): every operator's personal shortcuts, by owner. */
export async function loadAllPersonalShortcuts() {
  const { owners } = await callFunction('history', 'allShortcuts');
  return owners || [];
}
