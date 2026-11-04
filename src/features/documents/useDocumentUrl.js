'use client';

import { useEffect, useState } from 'react';
import { getDocumentUrl } from './documentStore';

/**
 * The download URL of a document's file, or null while it loads (or if it cannot be had). Nothing is
 * requested until `enabled`, so a long list only asks for what is on screen.
 */
export function useDocumentUrl(document, enabled = true) {
  const [url, setUrl] = useState(null);
  const storagePath = document?.storagePath;

  useEffect(() => {
    if (!enabled || !storagePath) return undefined;
    let cancelled = false;
    getDocumentUrl({ storagePath })
      .then(found => !cancelled && setUrl(found))
      .catch(error => console.warn('[documents] preview not available:', error?.code || error));
    return () => {
      cancelled = true;
    };
  }, [storagePath, enabled]);

  return url;
}
