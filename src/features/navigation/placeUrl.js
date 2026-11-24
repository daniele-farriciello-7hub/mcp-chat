/**
 * Where the standalone page is (the chat, or a configuration tab and its subsection) and how that reads in the URL hash, so a
 * refresh or a shared link comes back to the same place and the browser's back button walks through the places visited:
 *
 *   (no hash)                      the chat
 *   #config/modello/istruzioni     a tab of "Configurazione" and its subsection (slugs: settingsSections.js)
 *   #storico/panoramica            Storico, in the "Assistente" group
 *   #le-mie-scorciatoie            the shortcuts of an operator who is not an admin
 *
 * A place is `{ section, sub }`: `section` is null for the chat or the id of a tab (`SETTINGS_TABS`; 'shortcuts' is also the
 * panel of a non-admin), `sub` the id of its subsection, null where the tab has none. A hash that names nothing (a typo, a tab
 * a non-admin cannot see) is the chat; a tab without its subsection is the tab's first. /embed has no sidebar and no hash.
 */
import { SETTINGS_TABS, findSubsection, findTab } from '@/features/settings/settingsSections';

export const CHAT_PLACE = { section: null, sub: null };
const OWN_SHORTCUTS_HASH = 'le-mie-scorciatoie';
const CONFIG_PREFIX = 'config';

/** The place with its subsection filled in (the tab's first) and anything the operator cannot reach turned into the chat. */
export function normalizePlace(place, isAdmin) {
  const { section, sub } = place || CHAT_PLACE;
  if (section === null || section === undefined) return CHAT_PLACE;
  // someone who is not an admin only has their own shortcuts
  if (!isAdmin) return section === 'shortcuts' ? { section, sub: null } : CHAT_PLACE;
  const tab = findTab(section);
  if (!tab) return CHAT_PLACE;
  return { section: tab.id, sub: findSubsection(tab, sub)?.id ?? null };
}

export const samePlace = (a, b) => a.section === b.section && a.sub === b.sub;

/** `#config/modello/istruzioni`, or '' for the chat. `place` is expected to be normalized. */
export function hashFromPlace(place, isAdmin) {
  if (place.section === null) return '';
  if (!isAdmin) return `#${OWN_SHORTCUTS_HASH}`;
  const tab = findTab(place.section);
  if (!tab) return '';
  const path = [tab.group === 'config' ? CONFIG_PREFIX : null, tab.slug, place.sub].filter(Boolean);
  return `#${path.join('/')}`;
}

/** The place a hash names, normalized; the chat for anything else. */
export function placeFromHash(hash, isAdmin) {
  const parts = decodeURIComponent((hash || '').replace(/^#\/?/, ''))
    .split('/')
    .filter(Boolean);
  if (!parts.length) return CHAT_PLACE;
  if (!isAdmin) return parts[0] === OWN_SHORTCUTS_HASH ? { section: 'shortcuts', sub: null } : CHAT_PLACE;
  const group = parts[0] === CONFIG_PREFIX ? 'config' : 'assistant';
  const [slug, sub] = group === 'config' ? parts.slice(1) : parts;
  const tab = SETTINGS_TABS.find(item => item.group === group && item.slug === slug);
  return tab ? normalizePlace({ section: tab.id, sub }, true) : CHAT_PLACE;
}

/** The place the address bar shows now (the standalone page only: it needs a window). */
export function placeFromLocation(isAdmin) {
  if (typeof window === 'undefined') return CHAT_PLACE;
  try {
    return placeFromHash(window.location.hash, isAdmin);
  } catch {
    // a malformed escape in the hash (decodeURIComponent)
    return CHAT_PLACE;
  }
}

/** Writes a place into the address bar: a new history entry (`replace` false) or the current one. Nothing if it already reads so. */
export function writePlace(place, isAdmin, { replace = false } = {}) {
  const hash = hashFromPlace(place, isAdmin);
  if (window.location.hash === hash) return;
  const url = window.location.pathname + window.location.search + hash;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
