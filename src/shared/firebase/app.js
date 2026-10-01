/**
 * Firebase initialisation. Same project as instant-rating (mappa-contatti-217007), so users and
 * permissions (`users/{uid}.permessi_app`) are shared across the suite.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { startAppCheck } from './appCheck';

const firebaseConfig = {
  apiKey: 'AIzaSyDOtSc93S6YbPjo24HiHrR39IxMxbayytI',
  authDomain: 'mappa-contatti-217007.firebaseapp.com',
  projectId: 'mappa-contatti-217007',
  storageBucket: 'mappa-contatti-217007.firebasestorage.app',
  messagingSenderId: '38352279960',
  appId: '1:38352279960:web:559b6e17100fe13881f3ed'
};

// getApps() avoids a double init during dev hot reload
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// must run before any other Firebase service is used
startAppCheck(app);

export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const auth = getAuth(app);
export const storage = getStorage(app);
