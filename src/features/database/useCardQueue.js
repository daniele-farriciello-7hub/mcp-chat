'use client';

import { useEffect, useState } from 'react';
import { subscribeToCardQueue } from './cardQueue';

/** The background card-drafting queue's state, for display only: the queue itself runs outside React. */
export function useCardQueue() {
  const [queue, setQueue] = useState(null);
  useEffect(() => subscribeToCardQueue(setQueue), []);
  return queue;
}
