/**
 * The signed-in operator's own shortcuts, through the `history` function (server side: nobody
 * reaches someone else's). See functions/src/shortcuts/personalShortcuts.js.
 */
'use client';

import { callFunction } from '@/shared/firebase/functions';

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
