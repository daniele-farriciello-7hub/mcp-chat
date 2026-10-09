/**
 * Verifies the caller's Firebase ID token and reads their permissions from `users/{uid}` — the
 * piece the README lists as still missing on `tools`. The database endpoint needs it from the
 * start: unlike the Java tools (scoped by the forwarded Keycloak token), a database connection has
 * no per-operator ACL, so knowing *which* Firebase user is calling, and whether they are an admin
 * of this app, is the only gate there is.
 *
 * `users/{uid}` belongs to userconf and is shared by every app in the suite: field names
 * (`permessi_app`, `isActive`, `isAdmin`) are read as they are, mirroring `useSession.js` on the
 * client (`canUseApp` / `isAppAdmin`) — keep the two in sync if that logic changes.
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { appId } from '../appContext.js';

export class InvalidTokenError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'InvalidTokenError';
  }
}

function appPermissions(userDoc) {
  const permissions = userDoc?.permessi_app;
  if (permissions === '*') return { wildcard: true };
  if (permissions && typeof permissions === 'object') return permissions[appId()] || null;
  return null;
}

export function canUseApp(userDoc) {
  if (!userDoc || userDoc.isActive === false) return false;
  return Boolean(appPermissions(userDoc));
}

function isAppAdmin(userDoc) {
  if (!canUseApp(userDoc)) return false;
  const permissions = appPermissions(userDoc);
  return permissions?.wildcard === true || permissions?.isAdmin === true;
}

/**
 * @param {string} idToken the Firebase ID token, without "Bearer "
 * @returns {Promise<{uid: string, email?: string, emailVerified?: boolean, canUse: boolean, isAdmin: boolean}>}
 */
export async function verifyAppUser(idToken) {
  if (!idToken || typeof idToken !== 'string') throw new InvalidTokenError('missing token');

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    throw new InvalidTokenError('invalid or expired Firebase token');
  }

  const snapshot = await getFirestore().doc(`users/${decoded.uid}`).get();
  const userDoc = snapshot.exists ? snapshot.data() : null;

  return {
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified,
    canUse: canUseApp(userDoc),
    isAdmin: isAppAdmin(userDoc)
  };
}

/** For logs only. */
export const appUserLogFields = user => ({ uid: user.uid, isAdmin: user.isAdmin });
