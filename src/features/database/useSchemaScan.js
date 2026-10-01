'use client';

import { useState } from 'react';
import { scanConnection } from './connectionStore';

/** Runs one schema scan and tracks its own status — the scan is a single round trip to the server,
 * unlike card drafting (see `cardQueue.js`), so it needs no background queue of its own. */
export function useSchemaScan() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const scan = async connectionId => {
    setScanning(true);
    setError(null);
    try {
      return await scanConnection(connectionId);
    } catch (e) {
      console.error('[database] scan failed:', e);
      setError(e?.message || 'La lettura delle tabelle non è riuscita.');
      return null;
    } finally {
      setScanning(false);
    }
  };

  return { scan, scanning, error };
}
