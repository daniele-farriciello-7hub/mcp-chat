/**
 * Assistant settings, editable by admins without a release. Stored at
 * `apps/assistente-7hub/config/settings`; a partial document is completed with the defaults.
 */
'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import { FIRESTORE_ROOT } from '@/shared/firebase/paths';
import { DEFAULT_SETTINGS } from './defaultSettings';

const settingsDoc = () => doc(db, ...FIRESTORE_ROOT, 'config', 'settings');

// one per prompt field that can carry attached .md files (PromptAttachments.jsx) — each is
// independent, so "Istruzioni al modello" and "Come sceglie i documenti" don't share files
const ATTACHMENT_FIELDS = [
  'instructionsAttachments',
  'indexingAttachments',
  'documentSelectionAttachments',
  'databaseAttachments',
  'databaseSelectionAttachments'
];

function withDefaults(stored) {
  if (!stored) return DEFAULT_SETTINGS;
  const attachmentFields = {};
  for (const field of ATTACHMENT_FIELDS) {
    // un array vuoto e' una scelta dell'admin: i default valgono solo se il campo non c'e' proprio
    attachmentFields[field] = Array.isArray(stored[field]) ? stored[field] : DEFAULT_SETTINGS[field];
  }
  // migra il vecchio campo singolo (`instructionsAttachment`, pre-multi-file) se il nuovo array non
  // c'e' ancora, cosi' un file gia' salvato prima del passaggio a piu' file non sparisce
  if (!Array.isArray(stored.instructionsAttachments) && stored.instructionsAttachment) {
    attachmentFields.instructionsAttachments = [stored.instructionsAttachment];
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    historyLimit: { ...DEFAULT_SETTINGS.historyLimit, ...(stored.historyLimit || {}) },
    // un array vuoto e' una scelta dell'admin: i default valgono solo se il campo non c'e' proprio
    shortcuts: Array.isArray(stored.shortcuts) ? stored.shortcuts : DEFAULT_SETTINGS.shortcuts,
    ...attachmentFields
  };
}

let cached = null;

/** Current settings, read once per session unless `refresh` is set. Falls back to defaults on error. */
export async function getSettings({ refresh = false } = {}) {
  if (cached && !refresh) return cached;
  try {
    const snapshot = await getDoc(settingsDoc());
    cached = withDefaults(snapshot.exists() ? snapshot.data() : null);
  } catch (error) {
    console.warn('[settings] read failed, using defaults:', error?.message || error);
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

/**
 * Changes only the given fields, on top of a fresh read: for small edits made outside the settings
 * panel (an admin's own shortcuts from the welcome screen), so they never overwrite settings someone
 * else saved in the meantime with this tab's older copy.
 */
export async function saveSettingsFields(fields) {
  await setDoc(settingsDoc(), fields, { merge: true });
  return getSettings({ refresh: true });
}

export async function saveSettings(settings) {
  await setDoc(settingsDoc(), settings, { merge: true });
  cached = withDefaults(settings);
  return cached;
}

/**
 * Keeps only the part of the conversation allowed by `historyLimit`, most recent first.
 * The token unit is an estimate (four characters per token), good enough for a ceiling.
 */
export function trimHistory(messages, historyLimit = DEFAULT_SETTINGS.historyLimit) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const limit = Number(historyLimit.value) || DEFAULT_SETTINGS.historyLimit.value;

  if (historyLimit.unit === 'tokens') {
    const kept = [];
    let estimate = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const cost = Math.ceil((messages[i]?.text?.length || 0) / 4);
      if (estimate + cost > limit && kept.length > 0) break;
      estimate += cost;
      kept.unshift(messages[i]);
    }
    return kept;
  }

  return messages.slice(-limit);
}
