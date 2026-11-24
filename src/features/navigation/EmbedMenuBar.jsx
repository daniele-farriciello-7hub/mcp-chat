/**
 * The header of the chat inside 7hub, in the one case it has no header of its own: the host draws it (`hostChrome`, the 7AI
 * panel), but the drawer still needs its hamburger. This is a slim bar with just that and the name of the place, shown only while
 * the sidebar is a drawer; docked (a wide panel) the sidebar is there and there is nothing to open, so it renders nothing.
 * It is the fallback for a host that has no hamburger of its own: one that declares the `sidebarButton` capability puts it in its
 * header (and shows the place there), so the bar renders nothing and takes no room under it.
 */
'use client';

import MenuButton from './MenuButton';
import { useSidebar } from './SidebarContext';

export default function EmbedMenuBar({ label = 'Chat' }) {
  const sidebar = useSidebar();
  if (!sidebar || sidebar.desktop || sidebar.hostButton) return null;
  return (
    <div className="relative z-20 flex items-center gap-2 border-b border-line bg-panel/90 py-1.5 pl-4 pr-2.5 backdrop-blur">
      <MenuButton />
      <span className="truncate text-fs-13 font-semibold text-ink">{label}</span>
    </div>
  );
}
