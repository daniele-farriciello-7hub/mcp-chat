/**
 * The commands without AI of the settings, for the places that only need to list them (the shortcut
 * pickers). null until the settings are read; [] when there are none.
 */
'use client';

import { useEffect, useState } from 'react';
import { getSettings } from '@/features/settings/settingsStore';

export function useNoAiCommands() {
  const [commands, setCommands] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getSettings().then(settings => {
      if (!cancelled) setCommands(settings.noAiCommands ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return commands;
}
