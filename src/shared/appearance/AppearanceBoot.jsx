/** Starts the appearance store on the client (reads the stored choice, follows the system theme). Renders nothing. */
'use client';

import { useEffect } from 'react';
import { startAppearance } from './appearanceStore';

export default function AppearanceBoot() {
  useEffect(() => {
    startAppearance();
  }, []);
  return null;
}
