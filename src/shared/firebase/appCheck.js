/**
 * App Check with reCAPTCHA Enterprise: proves calls come from this app. Mandatory for Firebase AI
 * Logic from 2 November 2026. On localhost reCAPTCHA cannot attest, so the SDK prints a debug token
 * that must be registered once in the Firebase console (App Check → Manage debug tokens).
 */
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// public by design: it ships in the HTML of every protected page
const SITE_KEY = '6LdS0agtAAAAAFYw_ZaiPzEVbsVNgBQuHR-b7jSD';

const isLocalhost = () =>
  typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

let started = false;

export function startAppCheck(app) {
  if (started || typeof window === 'undefined') return;
  started = true;

  // must be set BEFORE initializeAppCheck, or the SDK queries reCAPTCHA instead
  if (isLocalhost()) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    // while enforcement is off, a failed attestation must not stop the chat from opening
    console.warn('[app-check] not initialised:', error?.message || error);
  }
}
