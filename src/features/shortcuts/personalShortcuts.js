/**
 * The signed-in operator's own shortcuts, through the `history` function (server side: nobody
 * reaches someone else's). See functions/src/shortcuts/personalShortcuts.js.
 */
'use client';

import { callFunction } from '@/shared/firebase/functions';

export const MAX_PERSONAL_SHORTCUTS = 12;

export async function loadPersonalShortcuts() {
  const { shortcuts } = await callFunction('history', 'shortcuts');
  return shortcuts || [];
}

export async function savePersonalShortcuts(shortcuts) {
  const result = await callFunction('history', 'saveShortcuts', { shortcuts });
  return result.shortcuts;
}

/** The admin's shortcuts this user should see: those for everyone, and those assigned to them. */
export const shortcutsFor = (shortcuts, uid) =>
  (shortcuts || []).filter(s => !s.uids?.length || (uid && s.uids.includes(uid)));
