'use client';

import { useEffect, useState } from 'react';
import { getDocumentUrl } from './documentStore';

// Download URLs already resolved, by storage path. A row that is rebuilt (it moves from "Da indicizzare"
// to "Indicizzati", a tab or a filter changes) has its URL at once instead of showing the skeleton for a
// round trip. It is still checked again in the background: if the file was replaced, the new URL wins.
const resolvedUrls = new Map();

/**
 * The download URL of a document's file: `{ url, failed }`. `url` is null while it loads, and `failed`
 * says it cannot be had (no file, or Storage refused), so the caller can stop showing a skeleton. Nothing
 * is requested until `enabled`, so a long list only asks for what is on screen.
 */
export function useDocumentUrl(document, enabled = true) {
  // the answer is tied to the path it was asked for, so a changed path never shows the old file
  const [lookup, setLookup] = useState({ path: null, url: null, failed: false });
  const storagePath = document?.storagePath;

  useEffect(() => {
    if (!enabled || !storagePath) return undefined;
    let cancelled = false;
    getDocumentUrl({ storagePath })
      .then(found => {
        if (found) resolvedUrls.set(storagePath, found);
        if (!cancelled) setLookup({ path: storagePath, url: found, failed: !found });
      })
      .catch(error => {
        console.warn('[documents] preview not available:', error?.code || error);
        if (!cancelled) setLookup({ path: storagePath, url: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath, enabled]);

  const answer = lookup.path === storagePath ? lookup : null;
  const url = answer?.url ?? (storagePath ? resolvedUrls.get(storagePath) : null) ?? null;
  return { url, failed: !url && (!storagePath || Boolean(answer?.failed)) };
}
