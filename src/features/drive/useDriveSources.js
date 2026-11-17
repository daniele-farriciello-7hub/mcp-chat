'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listDriveSources } from './driveApi';

// while a source is running the panel follows its progress closely; otherwise it only keeps up
const RUNNING_POLL_MS = 3000;
const IDLE_POLL_MS = 20_000;

/**
 * The Drive sources, kept fresh by polling the `drive` function (the run state is not in Firestore's
 * reach, see driveApi.js). Polls fast while any source is running, and not at all while the tab is hidden.
 * `refresh` reads now; `replace` puts in the source an action just returned, without waiting for the poll.
 */
export function useDriveSources() {
  const [state, setState] = useState({ data: null, error: null });
  const timer = useRef(null);
  const latest = useRef(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listDriveSources();
      if (!alive.current) return;
      latest.current = data;
      setState({ data, error: null });
    } catch (error) {
      if (!alive.current) return;
      console.error('[drive] list failed:', error);
      setState(current => ({ ...current, error }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const poll = async () => {
      if (!document.hidden) await refresh();
      if (!alive.current) return;
      const running = latest.current?.sources.some(source => source.status === 'running');
      timer.current = setTimeout(poll, running ? RUNNING_POLL_MS : IDLE_POLL_MS);
    };
    poll();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [refresh]);

  const replace = useCallback(source => {
    setState(current => {
      if (!current.data) return current;
      const sources = current.data.sources.some(s => s.id === source.id)
        ? current.data.sources.map(s => (s.id === source.id ? source : s))
        : [...current.data.sources, source].sort((a, b) => a.name.localeCompare(b.name, 'it'));
      const data = { ...current.data, sources };
      latest.current = data;
      return { ...current, data };
    });
  }, []);

  const drop = useCallback(id => {
    setState(current => {
      if (!current.data) return current;
      const data = { ...current.data, sources: current.data.sources.filter(s => s.id !== id) };
      latest.current = data;
      return { ...current, data };
    });
  }, []);

  return { ...state, refresh, replace, drop };
}
