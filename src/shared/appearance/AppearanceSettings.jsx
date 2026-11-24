/**
 * The gear in the header of the standalone chat (and on its login screen) that opens the settings drawer: 7hub's own
 * settings button (7hub-revolution: layouts/components/settings-button.tsx), a round 40px button with the duotone gear, the
 * outer ring turning slowly, and a red dot while something differs from the defaults. Embedded in 7hub it renders nothing:
 * the host's own settings (mode, primary colour, menu theme, font size) win there.
 *
 * The sidebar (features/navigation) opens the same drawer from its account menu: it passes `open` / `onOpenChange` and
 * `hideButton` (no gear of its own) and puts the focus back where it wants when the drawer closes from the keyboard.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Tooltip from '@/shared/ui/Tooltip';
import { useAppearanceState } from './appearanceStore';
import { drawerIcons } from './drawerIcons';
import SettingsDrawer from './SettingsDrawer';
import { settingsAreDefault } from './settingsConfig';

export default function AppearanceSettings({ open: controlledOpen, onOpenChange, hideButton = false }) {
  const { prefs, embedded } = useAppearanceState();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : ownOpen;
  const buttonRef = useRef(null);
  const restoreFocus = useRef(false);

  const setOpen = useCallback(
    (value, viaKeyboard = false) => {
      if (!controlled) setOwnOpen(value);
      onOpenChange?.(value, viaKeyboard);
    },
    [controlled, onOpenChange]
  );

  const close = useCallback(
    viaKeyboard => {
      restoreFocus.current = viaKeyboard;
      setOpen(false, viaKeyboard);
    },
    [setOpen]
  );

  // closed from the keyboard: the focus goes back to the gear
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  if (embedded) return null;

  return (
    <>
      {!hideButton && (
        /* no tooltip while the drawer is open: it would stay under the invisible backdrop */
        <Tooltip label="Impostazioni" align="right" disabled={open}>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Impostazioni"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="hdr-btn"
          >
            {/* 7hub's Badge: an 8px dot (error.main) centred on the top right corner of the 24px icon */}
            <span className="relative inline-flex">
              {drawerIcons.gear}
              {!settingsAreDefault(prefs) && (
                <span
                  aria-hidden
                  className="absolute right-0 top-0 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#ff5630]"
                />
              )}
            </span>
          </button>
        </Tooltip>
      )}
      {/* in the body: the header has a backdrop filter, which would make it the containing block of a fixed panel */}
      {createPortal(<SettingsDrawer open={open} onClose={close} />, document.body)}
    </>
  );
}
