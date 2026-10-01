'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/**
 * A value only the browser knows (window, navigator), hydration-safe: the static export renders
 * `serverValue`, the client then renders `getClientValue()`. The value is assumed not to change.
 */
export function useClientValue(getClientValue, serverValue) {
  return useSyncExternalStore(noSubscription, getClientValue, () => serverValue);
}
