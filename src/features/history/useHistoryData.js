/**
 * The conversations started in the chosen period, newest first, in pages of 500. The user filter is
 * applied by the caller on what is loaded: one query, no composite index (none is deployed here).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Timestamp, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { conversationsCollection } from './schema';

const PAGE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export function useHistoryData(rangeDays) {
  const [state, setState] = useState({ conversations: [], loading: true, error: null, cursor: null });

  const fetchPage = useCallback(
    async cursor => {
      const from = Timestamp.fromMillis(Date.now() - rangeDays * DAY_MS);
      const constraints = [where('startedAt', '>=', from), orderBy('startedAt', 'desc'), limit(PAGE)];
      if (cursor) constraints.push(startAfter(cursor));
      const snapshot = await getDocs(query(conversationsCollection(), ...constraints));
      return {
        conversations: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
        cursor: snapshot.docs.length === PAGE ? snapshot.docs.at(-1) : null
      };
    },
    [rangeDays]
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(null)
      .then(page => !cancelled && setState({ ...page, loading: false, error: null }))
      .catch(error => !cancelled && setState({ conversations: [], cursor: null, loading: false, error }));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!state.cursor) return;
    setState(s => ({ ...s, loading: true }));
    try {
      const page = await fetchPage(state.cursor);
      setState(s => ({
        conversations: [...s.conversations, ...page.conversations],
        cursor: page.cursor,
        loading: false,
        error: null
      }));
    } catch (error) {
      setState(s => ({ ...s, loading: false, error }));
    }
  }, [fetchPage, state.cursor]);

  return { ...state, loadMore };
}
