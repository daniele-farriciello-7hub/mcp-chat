/**
 * Tells the host how the sidebar stands, so it can draw its own hamburger and say where the chat is. It renders nothing: it lives
 * inside AppShell, where the context says whether the sidebar is docked and whether the drawer is open, and it reports
 * `{ docked, open, place: { label, chat } }` at the start and at every change (`label`: where the page is, see `placeLabel`;
 * `chat`: it is the conversation). When it goes away (the operator signed out: the sign-in screen has no sidebar) it reports
 * `null`, so the host stops offering what is no longer there.
 */
'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSidebar } from './SidebarContext';

export default function SidebarReporter({ label, chat, onChange }) {
  const sidebar = useSidebar();
  const docked = Boolean(sidebar?.desktop);
  const open = Boolean(sidebar?.mobileOpen);

  useEffect(() => {
    onChange?.({ docked, open, place: { label, chat } });
  }, [docked, open, label, chat, onChange]);

  // a separate effect with no dependencies: its cleanup runs only when this goes away, not at every change above
  const latest = useRef(onChange);
  useLayoutEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => () => latest.current?.(null), []);

  return null;
}
