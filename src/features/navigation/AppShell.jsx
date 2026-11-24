/**
 * The standalone chat's frame: the sidebar (`sidebar`, see Sidebar.jsx) beside the page (`children`).
 *
 *  · From 768px up the sidebar is part of the layout, expanded or collapsed to an icon rail (the choice is kept in
 *    localStorage, sidebarStore.js). "Classico" is flush with the window edges, "Flottante" a rounded panel with a margin and
 *    a shadow; its colours follow the coordinated menu theme (globals.css, `.app-sidebar`).
 *  · Below 768px it is an off-canvas drawer, opened by the hamburger of the page headers (MenuButton). While it is open the
 *    page behind is `inert` (the focus stays in the drawer), and it closes on a click on the backdrop, on Escape and when
 *    something in it is chosen (`closeMobile`, called by the sidebar). The focus goes back to the hamburger, or to the page
 *    when that is gone (the chosen entry has changed the header).
 *
 * Only the standalone page uses it. /embed is a narrow iframe: there the chat stays what it was, with no sidebar.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { SidebarProvider } from './SidebarContext';
import { setSidebarCollapsed, useSidebarCollapsed } from './sidebarStore';

const DESKTOP_QUERY = '(min-width: 768px)';

export default function AppShell({ sidebar, children }) {
  // the server (static export) never renders this; true keeps the first client render the wide one
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const collapsed = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const asideRef = useRef(null);
  const mainRef = useRef(null);
  const opener = useRef(null);
  const wasOpen = useRef(false);

  const drawerOpen = mobileOpen && !desktop;
  const rail = desktop && collapsed;

  const openMobile = useCallback(() => {
    opener.current = document.activeElement;
    setMobileOpen(true);
  }, []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleCollapsed = useCallback(() => setSidebarCollapsed(!collapsed), [collapsed]);

  // focus into the drawer when it opens, back out when it closes
  useEffect(() => {
    if (drawerOpen) {
      wasOpen.current = true;
      asideRef.current?.querySelector('[data-autofocus]')?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // a dialog opened by the choice made in the drawer (unsaved edits) has the focus now
    if (document.activeElement?.closest('[aria-modal="true"]')) return;
    const target = opener.current?.isConnected ? opener.current : mainRef.current;
    target?.focus();
  }, [drawerOpen]);

  // Escape closes the drawer, but only when it is pressed inside it: the settings drawer (in a portal) and the account menu
  // have their own Escape
  const onKeyDown = event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !drawerOpen) return;
    if (!asideRef.current?.contains(event.target)) return;
    event.preventDefault();
    closeMobile();
  };

  const value = useMemo(
    () => ({ desktop, rail, mobileOpen: drawerOpen, openMobile, closeMobile, toggleCollapsed }),
    [desktop, rail, drawerOpen, openMobile, closeMobile, toggleCollapsed]
  );

  return (
    <SidebarProvider value={value}>
      <div className="app-shell">
        <aside
          ref={asideRef}
          id="app-sidebar"
          aria-label="Menu laterale"
          className="app-sidebar"
          data-collapsed={rail || undefined}
          data-mobile-open={drawerOpen || undefined}
          // closed on a phone it is off screen: nothing in it can be reached
          inert={!desktop && !drawerOpen}
          onKeyDown={onKeyDown}
        >
          {/* the animated glow of a coordinated theme (7hub's NavGlow), behind everything */}
          <span aria-hidden className="sb-glow" />

          {/* on the sidebar's edge, level with the header, as 7hub's pin button */}
          <Tooltip
            label={rail ? 'Espandi il menu' : 'Riduci il menu'}
            side="right"
            className="absolute right-0 top-7 z-10 hidden translate-x-1/2 md:block"
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={rail ? 'Espandi il menu' : 'Riduci il menu'}
              aria-expanded={!rail}
              aria-controls="app-sidebar"
              className="sb-edge"
            >
              {rail ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </Tooltip>

          {sidebar}
        </aside>

        {/* phones: tapping outside the drawer closes it */}
        <div aria-hidden className="app-backdrop" data-open={drawerOpen || undefined} onClick={closeMobile} />

        <div ref={mainRef} tabIndex={-1} className="app-main" inert={drawerOpen}>
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
