/**
 * Inline script for <head> (app/layout.jsx): sets `data-theme` before the first paint, so a dark chat does not
 * flash white while the bundle loads. Only the mode: the accent and the font size follow with the first render
 * (the host's context arrives after hydration anyway). Embedded, it uses the last mode the host sent (light if
 * none yet, as before); standalone, the operator's choice, with "system" following the operating system.
 * The same decision as appearanceStore.js, repeated by hand because this runs before any bundle.
 */
import { HOST_MODE_STORAGE_KEY, PREFS_STORAGE_KEY } from './apply';

export const EARLY_THEME_SCRIPT = `
(function () {
  try {
    var mode = 'light';
    if (window.parent !== window) {
      if (localStorage.getItem(${JSON.stringify(HOST_MODE_STORAGE_KEY)}) === 'dark') mode = 'dark';
    } else {
      var stored = JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_STORAGE_KEY)}) || 'null');
      var pick = stored && stored.mode;
      if (pick === 'dark' || (pick !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) mode = 'dark';
    }
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  } catch (e) {}
})();
`;
