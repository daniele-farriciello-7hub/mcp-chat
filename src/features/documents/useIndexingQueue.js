'use client';

import { useEffect, useState } from 'react';
import { subscribeToIndexingQueue } from './indexingQueue';

/** The background queue's state, for display only: the queue itself runs outside React. */
export function useIndexingQueue() {
  const [queue, setQueue] = useState(null);
  useEffect(() => subscribeToIndexingQueue(setQueue), []);
  return queue;
}
