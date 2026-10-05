/**
 * Everyone who may use this app, for the Storico user filter — read by the `history` function
 * (admin only on the server) from userconf's `users`, with the same rule as the login.
 */
'use client';

import { callFunction } from '@/shared/firebase/functions';

/** @returns {Promise<{uid: string, email: string, name: string}[]>} sorted by email */
export async function loadAppUsers() {
  const { users } = await callFunction('history', 'users');
  return users;
}
