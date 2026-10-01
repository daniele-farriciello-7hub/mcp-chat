'use client';

import { useEffect, useState } from 'react';
import { listenToConnections, listenToTables } from './connectionStore';

export function useConnections() {
  const [connections, setConnections] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(
    () =>
      listenToConnections(setConnections, error => {
        console.error('[database] connections read failed:', error);
        setLoadError(
          error?.code === 'permission-denied'
            ? 'Il tuo account non può leggere le connessioni al database.'
            : 'Non riesco a leggere le connessioni al database.'
        );
      }),
    []
  );

  return { connections, loadError };
}

// connectionId is stable for the lifetime of a TableList (one per ConnectionRow): no need to reset
// `tables` on change, so the effect only ever subscribes/unsubscribes.
export function useTables(connectionId) {
  const [tables, setTables] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!connectionId) return undefined;
    return listenToTables(connectionId, setTables, error => {
      console.error('[database] tables read failed:', error);
      setLoadError('Non riesco a leggere le tabelle.');
    });
  }, [connectionId]);

  return { tables, loadError };
}
