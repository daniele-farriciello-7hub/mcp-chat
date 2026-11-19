/**
 * Where the chat's appearance is decided.
 *
 *  · Embedded in 7hub: the host's settings win (its mode, primary colour, menu theme, font size). Until the host
 *    has spoken the chat uses the mode it last received (so a reload has no flash) and its original blue.
 *  · Standalone: the operator's own choice from the appearance menu (Chiaro / Scuro / Sistema + an accent),
 *    kept in localStorage; "Sistema" follows the operating system and reacts when it changes.
 *
 * Every change is written to the document root by apply.js, so the whole UI (CSS variables and a `data-theme`
 * attribute, see globals.css) follows live, with no reload and no React state in the components.
 */
'use client';

import { useSyncExternalStore } from 'react';
import { isEmbedded } from '@/shared/embed/hostBridge';
import { HOST_MODE_STORAGE_KEY, PREFS_STORAGE_KEY, applyAppearance } from './apply';
import { DEFAULT_ACCENT_ID, LEGACY_PRIMARY, paletteById } from './palettes';
import { sanitizeAppearance, sanitizeMode } from './validate';

const DEFAULT_PREFS = { mode: 'system', accent: DEFAULT_ACCENT_ID };

let started = false;
let embedded = false;
let systemDark = false;
let hostAppearance = null;
let rememberedHostMode = null;
let prefs = DEFAULT_PREFS;
// null until startAppearance() has read the browser: until then (and while hydrating) the server snapshot is used
let snapshot = null;
const listeners = new Set();

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked (private window, third-party iframe): the choice just lasts until the page closes
  }
}

function readPrefs() {
  try {
    const stored = JSON.parse(readStorage(PREFS_STORAGE_KEY) || 'null');
    return {
      mode: ['light', 'dark', 'system'].includes(stored?.mode) ? stored.mode : DEFAULT_PREFS.mode,
      accent: paletteById(stored?.accent).id
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** What to draw right now, from the host (embedded) or the operator's choice (standalone). */
function resolve() {
  if (embedded) {
    const host = hostAppearance ?? {};
    return {
      mode: host.mode ?? rememberedHostMode ?? 'light',
      primary: host.primary ?? LEGACY_PRIMARY,
      accent: host.accent ?? null,
      fontSize: host.fontSize ?? null
    };
  }
  return {
    mode: prefs.mode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.mode,
    primary: paletteById(prefs.accent),
    accent: null,
    fontSize: null
  };
}

function commit() {
  const next = resolve();
  applyAppearance(next);
  if (embedded && hostAppearance?.mode) writeStorage(HOST_MODE_STORAGE_KEY, hostAppearance.mode);
  snapshot = { prefs, embedded };
  listeners.forEach(listener => listener());
}

/** Reads the stored choice and starts following the system theme. Idempotent; safe to call from any client code. */
export function startAppearance() {
  if (started || typeof window === 'undefined') return;
  started = true;
  embedded = isEmbedded();
  prefs = readPrefs();
  rememberedHostMode = sanitizeMode(readStorage(HOST_MODE_STORAGE_KEY));
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark = query.matches;
  query.addEventListener('change', event => {
    systemDark = event.matches;
    commit();
  });
  commit();
}

/**
 * The host's appearance, from its `context` or `appearance` message. The whole state is replaced each time (the
 * host always sends all of it). `legacyTheme` is the old `theme: 'light'|'dark'` of the context, used when the
 * host sends no `mode` of its own.
 */
export function receiveHostAppearance(raw, legacyTheme) {
  startAppearance();
  const clean = sanitizeAppearance(raw) ?? {};
  const mode = clean.mode ?? sanitizeMode(legacyTheme);
  hostAppearance = mode ? { ...clean, mode } : clean;
  commit();
}

/** The standalone chat's own choice (appearance menu). Ignored when embedded: the host decides there. */
export function setAppearancePrefs(patch) {
  startAppearance();
  prefs = {
    mode: ['light', 'dark', 'system'].includes(patch.mode) ? patch.mode : prefs.mode,
    accent: patch.accent ? paletteById(patch.accent).id : prefs.accent
  };
  writeStorage(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  commit();
}

const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// embedded: true, so the menu never shows in the static HTML nor in a frame before the host is known
const serverSnapshot = { prefs: DEFAULT_PREFS, embedded: true };

/** `{ prefs: { mode, accent }, embedded }`: the menu is only for the standalone chat (`embedded` false). */
export function useAppearanceState() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot ?? serverSnapshot,
    () => serverSnapshot
  );
}
