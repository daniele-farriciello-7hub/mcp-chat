/**
 * What the operator chose about the sidebar, kept in localStorage and read with `useSyncExternalStore`, so it follows the other
 * tabs too (`storage` event). Where storage is blocked (private window, third-party iframe) a choice just lasts until the page
 * closes.
 *   · whether it is collapsed to its icon rail (`mcp-chat:sidebar`)
 *   · which groups of entries are open or closed (`mcp-chat:sidebar-groups`, `{ [groupId]: boolean }`): a group that was
 *     never opened or closed by hand follows the page (it is open while the page is inside it, closed when it leaves); one
 *     opened by hand stays open, one closed by hand stays closed until the page goes into it again
 *
 * Two scopes, each with its own keys, so a choice made on the standalone page does not decide how the panel inside 7hub
 * opens (and the other way round): `standalone` (the keys above) and `embed` (`mcp-chat:embed-sidebar`,
 * `mcp-chat:embed-sidebar-groups`). The scope is the last argument of every function and hook; it defaults to `standalone`.
 */
'use client';

import { useSyncExternalStore } from 'react';

export const SIDEBAR_STORAGE_KEY = 'mcp-chat:sidebar';

export const GROUPS_STORAGE_KEY = 'mcp-chat:sidebar-groups';

const SCOPES = {
  standalone: { collapsed: SIDEBAR_STORAGE_KEY, groups: GROUPS_STORAGE_KEY },
  embed: { collapsed: 'mcp-chat:embed-sidebar', groups: 'mcp-chat:embed-sidebar-groups' }
};

const listeners = new Set();
// what was chosen in this page, for when localStorage cannot hold it
const remembered = { standalone: false, embed: false };
const rememberedGroups = { standalone: '', embed: '' };

function read(scope) {
  try {
    const stored = window.localStorage.getItem(SCOPES[scope].collapsed);
    if (stored !== null) return stored === 'collapsed';
  } catch {
    // storage blocked: the in-memory choice below
  }
  return remembered[scope];
}

export function setSidebarCollapsed(collapsed, scope = 'standalone') {
  remembered[scope] = collapsed;
  try {
    window.localStorage.setItem(SCOPES[scope].collapsed, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // storage blocked: kept in memory only
  }
  listeners.forEach(listener => listener());
}

// the raw text, not the object: `useSyncExternalStore` needs a snapshot that is the same until something changes
function readGroups(scope) {
  try {
    const stored = window.localStorage.getItem(SCOPES[scope].groups);
    if (stored !== null) return stored;
  } catch {
    // storage blocked: the in-memory choice below
  }
  return rememberedGroups[scope];
}

function parseGroups(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeGroups(groups, scope) {
  const next = JSON.stringify(groups);
  rememberedGroups[scope] = next;
  try {
    window.localStorage.setItem(SCOPES[scope].groups, next);
  } catch {
    // storage blocked: kept in memory only
  }
  listeners.forEach(listener => listener());
}

/** Opens or closes a group of the sidebar by hand (true, false), and remembers it. */
export function setGroupOpen(id, open, scope = 'standalone') {
  writeGroups({ ...parseGroups(readGroups(scope)), [id]: open }, scope);
}

/** The page went inside a group the operator had closed by hand: forget that, so it follows the page again (open while inside). */
export function followPage(id, scope = 'standalone') {
  const groups = parseGroups(readGroups(scope));
  if (groups[id] !== false) return;
  delete groups[id];
  writeGroups(groups, scope);
}

const subscribe = listener => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};

/** True while the operator has the sidebar collapsed to the rail (on screens that have a sidebar beside the page). */
export function useSidebarCollapsed(scope = 'standalone') {
  return useSyncExternalStore(
    subscribe,
    () => read(scope),
    () => false
  );
}

/** Whether the operator left a group open (true) or closed (false); undefined when they never touched it. */
export function useGroupOpen(id, scope = 'standalone') {
  const raw = useSyncExternalStore(
    subscribe,
    () => readGroups(scope),
    () => ''
  );
  const value = parseGroups(raw)[id];
  return typeof value === 'boolean' ? value : undefined;
}
