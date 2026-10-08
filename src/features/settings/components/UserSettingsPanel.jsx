/**
 * The gear for operators who are not admins: only their own shortcuts. Everything here is personal
 * and saves on its own (through the `history` function), so there is no save bar and no tabs.
 */
'use client';

import PersonalShortcuts from '@/features/shortcuts/PersonalShortcuts';
import SettingsHeader from './SettingsHeader';

export default function UserSettingsPanel({ uid, onClose }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <SettingsHeader onClose={onClose} title="Le mie scorciatoie" subtitle="Solo per te, salvate subito" />
      <div className="flex-1 overflow-y-auto border-t border-line px-4 py-4">
        <PersonalShortcuts uid={uid} variant="panel" />
      </div>
    </div>
  );
}
