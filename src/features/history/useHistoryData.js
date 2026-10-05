/**
 * The conversations started in the chosen period, newest first, in pages of 500, read through the
 * `history` function (admin only on the server). The user filter is applied by the caller.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { listConversations } from './historyApi';

export function useHistoryData(rangeDays) {
  const [state, setState] = useState({ conversations: [], loading: true, error: null, nextAfter: null });

  useEffect(() => {
    let cancelled = false;
    listConversations(rangeDays)
      .then(page => !cancelled && setState({ ...page, loading: false, error: null }))
      .catch(error => !cancelled && setState({ conversations: [], nextAfter: null, loading: false, error }));
    return () => {
      cancelled = true;
    };
  }, [rangeDays]);

  const loadMore = useCallback(async () => {
    if (!state.nextAfter) return;
    setState(s => ({ ...s, loading: true }));
    try {
      const page = await listConversations(rangeDays, state.nextAfter);
      setState(s => ({
        conversations: [...s.conversations, ...page.conversations],
        nextAfter: page.nextAfter,
        loading: false,
        error: null
      }));
    } catch (error) {
      setState(s => ({ ...s, loading: false, error }));
    }
  }, [rangeDays, state.nextAfter]);

  return { ...state, cursor: state.nextAfter, loadMore };
}
