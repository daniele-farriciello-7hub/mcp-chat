/**
 * Everyone who may use this app, for the Storico user filter: read from userconf's `users`
 * collection (shared by the whole suite) with the same rule as the login (`useSession.js`).
 * Read once per tab opening; only admins reach this code.
 */
'use client';

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import { canUseApp } from '@/features/auth/useSession';

/** @returns {Promise<{uid: string, email: string, name: string}[]>} sorted by email */
export async function loadAppUsers() {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .filter(d => canUseApp(d.data()))
    .map(d => ({ uid: d.id, email: d.data().email || '', name: d.data().nome || '' }))
    .filter(u => u.email)
    .sort((a, b) => a.email.localeCompare(b.email));
}
