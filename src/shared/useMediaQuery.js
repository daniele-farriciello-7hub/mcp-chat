'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches right now, and follows it as the window changes. `serverValue` is what the static
 * export (and the hydration pass) assumes, since the server has no window.
 */
export function useMediaQuery(query, serverValue = false) {
  return useSyncExternalStore(
    onChange => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}
