/**
 * The commands and the lists of documents without AI of the settings, as one list of targets (noAiTargets.js), for
 * the places that only need to name them (the shortcut pickers). null until the settings are read; [] when there are
 * none.
 */
'use client';

import { useEffect, useState } from 'react';
import { getSettings } from '@/features/settings/settingsStore';
import { noAiTargets } from './noAiTargets';

export function useNoAiTargets() {
  const [targets, setTargets] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getSettings().then(settings => {
      if (!cancelled) setTargets(noAiTargets(settings));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return targets;
}
