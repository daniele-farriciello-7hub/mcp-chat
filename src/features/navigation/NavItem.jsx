/**
 * One entry of the sidebar, in the look of 7hub's menu items (7hub-revolution: components/nav-section/vertical/nav-item.tsx):
 * a soft fill and the text at full strength on hover, the icon growing a little, a deeper fill and the primary colour (white on a
 * coordinated theme) for the current one. A button, not a link: the chat is a single page and the entries switch what it shows.
 * Collapsed to the rail only the icon is seen (the label stays for screen readers) and a tooltip names it.
 */
'use client';

import RailTip from './RailTip';
import { useSidebar } from './SidebarContext';

export default function NavItem({ icon, label, active = false, onClick }) {
  const sidebar = useSidebar();
  return (
    <RailTip label={sidebar?.rail ? label : null}>
      <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className="sb-item">
        <span aria-hidden className="sb-item-icon">
          {icon}
        </span>
        <span className="sb-label">{label}</span>
      </button>
    </RailTip>
  );
}
