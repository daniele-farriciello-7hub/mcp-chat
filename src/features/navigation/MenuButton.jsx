/** The hamburger of the page headers: opens the sidebar drawer on phones. Renders nothing without a sidebar, and from 768px up. */
'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export default function MenuButton() {
  const sidebar = useSidebar();
  if (!sidebar) return null;
  return (
    <button
      type="button"
      onClick={sidebar.openMobile}
      aria-label="Apri il menu"
      aria-expanded={sidebar.mobileOpen}
      aria-controls="app-sidebar"
      className="hdr-btn -ml-2 md:hidden"
    >
      <Menu size={22} />
    </button>
  );
}
