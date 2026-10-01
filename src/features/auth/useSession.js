/**
 * The signed-in user. Firebase Auth provides the identity, `users/{uid}` the permissions — the same
 * document the userconf panel manages, so users enabled in the suite need no extra setup.
 *
 * `users/{uid}` belongs to userconf and is shared by every app in the suite: its field names
 * (`permessi_app`, `isActive`, `isAdmin`) are read as they are, never renamed here.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/shared/firebase/app';
import { APP_ID } from '@/shared/firebase/paths';

// Inside a third-party iframe the browser partitions storage and Auth may never answer:
// after this delay the login screen is shown instead of an endless spinner.
const AUTH_TIMEOUT_MS = 2500;

function appPermissions(userDoc) {
  const permissions = userDoc?.permessi_app;
  if (permissions === '*') return { wildcard: true };
  if (permissions && typeof permissions === 'object') return permissions[APP_ID] || null;
  return null;
}

function canUseApp(userDoc) {
  if (!userDoc || userDoc.isActive === false) return false;
  return Boolean(appPermissions(userDoc));
}

function isAppAdmin(userDoc) {
  if (!canUseApp(userDoc)) return false;
  const permissions = appPermissions(userDoc);
  return permissions?.wildcard === true || permissions?.isAdmin === true;
}

export function useSession() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  // Permissions live in a second document, read after Auth answers. Tracked apart from the user:
  // between the two reads the app knows who you are but not yet what you may do, and treating that
  // gap as "not allowed" made the access-denied screen flash right after every sign-in.
  const [permissionsResolved, setPermissionsResolved] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAuthResolved(true);
      setPermissionsResolved(true);
    }, AUTH_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      clearTimeout(timeout);
      setAuthResolved(true);
      if (!firebaseUser) {
        setUser(null);
        setUserDoc(null);
        setPermissionsResolved(true);
        return;
      }
      setUser(firebaseUser);
      setPermissionsResolved(false);
      try {
        const snapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
        setUserDoc(snapshot.exists() ? snapshot.data() : null);
      } catch (error) {
        console.error('[session] permissions read failed:', error);
        setUserDoc(null);
      }
      setPermissionsResolved(true);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const loading = !authResolved || (Boolean(user) && !permissionsResolved);

  const signIn = useCallback(
    (email, password) => signInWithEmailAndPassword(auth, email.trim(), password),
    []
  );
  const signInWithGoogle = useCallback(() => signInWithPopup(auth, new GoogleAuthProvider()), []);
  const resetPassword = useCallback(email => sendPasswordResetEmail(auth, email.trim()), []);
  const signOutUser = useCallback(() => signOut(auth), []);

  return {
    user,
    displayName: userDoc?.nome || user?.displayName || user?.email,
    canUse: Boolean(user) && canUseApp(userDoc),
    isAdmin: Boolean(user) && isAppAdmin(userDoc),
    loading,
    signIn,
    signInWithGoogle,
    resetPassword,
    signOut: signOutUser
  };
}
