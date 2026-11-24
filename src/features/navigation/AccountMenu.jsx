/**
 * The signed-in operator at the bottom of the sidebar: avatar, name and email, and a menu with "Impostazioni" (the appearance
 * drawer, which the sidebar owns) and "Esci". In the rail only the avatar is seen. The menu is a plain disclosure of two
 * `menuitem`s: Escape closes it and gives the focus back to the button, the arrows move between the items, a click or a Tab
 * outside closes it.
 */
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useAppearanceState } from '@/shared/appearance/appearanceStore';
import { drawerIcons } from '@/shared/appearance/drawerIcons';
import { settingsAreDefault } from '@/shared/appearance/settingsConfig';
import RailTip from './RailTip';
import { useSidebar } from './SidebarContext';

/** "Mario Rossi" → "MR", "mario.rossi@azienda.it" → "MR", "Cher" → "CH". */
function initialsOf(name, email) {
  const source = (name || email || '').trim().split('@')[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length > 1 ? words[0][0] + words.at(-1)[0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

export default function AccountMenu({ name, email, onOpenSettings, onSignOut, buttonRef }) {
  const sidebar = useSidebar();
  const { prefs } = useAppearanceState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const label = name || email || 'Account';
  // the name defaults to the email when the operator has none: do not print it twice
  const secondLine = email && email !== name ? email : null;

  // the first item takes the focus when the menu opens; a press outside closes it
  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = event => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef?.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items.at(event.key === 'Home' ? 0 : -1)?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const choose = action => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="sb-foot">
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="sb-menu"
        >
          {/* the account button already says who this is: kept out of the menu's own list of items */}
          <div aria-hidden className="sb-menu-who">
            <div className="truncate font-semibold">{label}</div>
            {secondLine && <div className="truncate sb-muted">{secondLine}</div>}
          </div>
          <button type="button" role="menuitem" onClick={choose(onOpenSettings)} className="sb-menu-item">
            <span aria-hidden className="grid w-6 place-items-center">
              {drawerIcons.gear}
            </span>
            Impostazioni
            {!settingsAreDefault(prefs) && (
              <span
                aria-hidden
                className="ml-auto h-2 w-2 rounded-full bg-[#ff5630]"
                title="Qualcosa è diverso dal predefinito"
              />
            )}
          </button>
          <button type="button" role="menuitem" onClick={choose(onSignOut)} className="sb-menu-item">
            <span aria-hidden className="grid w-6 place-items-center">
              <LogOut size={20} />
            </span>
            Esci
          </button>
        </div>
      )}

      <RailTip label={sidebar?.rail ? label : null}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="sb-account"
        >
          <span aria-hidden className="sb-avatar">
            {initialsOf(name, email)}
            {!settingsAreDefault(prefs) && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-[#ff5630]" />
            )}
          </span>
          <span className="sb-label sb-account-text">
            <span className="block truncate font-semibold">{label}</span>
            {secondLine && <span className="sb-muted block truncate">{secondLine}</span>}
          </span>
          <ChevronsUpDown aria-hidden size={16} className="sb-rail-hide shrink-0 opacity-70" />
        </button>
      </RailTip>
    </div>
  );
}
