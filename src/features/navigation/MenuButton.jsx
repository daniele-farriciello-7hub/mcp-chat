/**
 * The hamburger of the page headers: opens the sidebar drawer. Renders nothing without a sidebar, nor while it is docked, nor
 * when the host has a hamburger of its own for it (`hostButton`: in 7hub's header, which sends the chat a `toggle_sidebar`).
 */
'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export default function MenuButton() {
  const sidebar = useSidebar();
  if (!sidebar || sidebar.desktop || sidebar.hostButton) return null;
  return (
    <button
      type="button"
      onClick={sidebar.openMobile}
      aria-label="Apri il menu"
      aria-expanded={sidebar.mobileOpen}
      aria-controls="app-sidebar"
      className="hdr-btn -ml-2"
    >
      <Menu size={22} />
    </button>
  );
}
